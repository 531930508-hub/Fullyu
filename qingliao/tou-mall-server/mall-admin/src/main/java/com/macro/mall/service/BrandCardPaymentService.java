package com.macro.mall.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.fasterxml.jackson.databind.JsonNode;
import com.macro.mall.common.exception.BusinessException;
import com.macro.mall.crm.brand.BrandMemberClient;
import com.macro.mall.crm.brand.BrandMemberException;
import com.macro.mall.entity.Customer;
import com.macro.mall.entity.CustomerMemberCard;
import com.macro.mall.entity.MemberCardConfig;
import com.macro.mall.entity.MemberCardOrder;
import com.macro.mall.entity.Order;
import com.macro.mall.enums.OrderState;
import com.macro.mall.mapper.MemberCardOrderMapper;
import com.macro.mall.mapper.OrderMapper;
import com.macro.mall.pay.PayChannel;
import com.macro.mall.pay.PayService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.util.CollectionUtils;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.security.SecureRandom;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 品牌会员卡在线支付、验签回调开卡与退款。
 *
 * <p>金额与卡期以 CRM 报价/开卡结果为准，本地只保存支付单与权益期快照：
 * <ul>
 *   <li>下单：CRM 生成 30 分钟报价 → 本地待支付单 → 汇付小程序支付参数（总公司商户）；</li>
 *   <li>回调：按订单号识别开卡单 → 校验金额 → CRM issue（幂等）→ 本地权益期；</li>
 *   <li>退款：以 CRM 试算为准——7 天内 = 实付 − 已兑实物礼；之后 = 实付 − 已享优惠 − 已兑实物礼；
 *       ≤0 不可退，赠送/附赠资格不可退；特殊情况只能在 CRM 后台协商退款；</li>
 *   <li>防薅羊毛：同一客户连续两次 7 天内自助退款后锁定购买，后台可解锁。</li>
 * </ul>
 *
 * <p>测试模式（{@code -Dfullyu.test-mode=true}）不调用汇付，只走模拟支付与 CRM 开卡，
 * 供隔离测试环境验证完整链路。</p>
 *
 * @date 2026/11/08
 */
@Slf4j
@Service
public class BrandCardPaymentService {

    private static final DateTimeFormatter ORDER_SN_FORMAT = DateTimeFormatter.ofPattern("yyyyMMddHHmmss");
    private static final DateTimeFormatter CRM_TIME_FORMAT = DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss+08:00");
    private static final SecureRandom RANDOM = new SecureRandom();

    public static final String PRODUCT_MONTH = "FY_MONTH";
    public static final String PRODUCT_ANNUAL = "FY_ANNUAL";
    public static final String REFUND_WITHIN_7D = "WITHIN_7D";
    /** CRM 新口径：7 天后扣除已享优惠与已兑礼券。 */
    public static final String REFUND_AFTER_7D = "AFTER_7D";
    /** 旧口径（仅历史数据），CRM 仍接受为 AFTER_7D 的别名。 */
    public static final String REFUND_PRORATED = "PRORATED";

    private static final String REFUND_NONE = "NONE";
    private static final String REFUND_SUCCESS = "SUCCESS";
    private static final String REFUND_PENDING_CRM = "PENDING_CRM";

    /** 下单防重：刚创建 60 秒内的待支付单视为同一次点击，直接拒绝。 */
    private static final int CREATE_DEDUP_SECONDS = 60;
    /**
     * 并发重复支付判定的兜底窗口：只在历史订单缺少下单时间时使用。
     * 正常续费会先生成新订单再支付，不能用「刚支付过」拦截新订单，
     * 否则用户买完卡立即续费会被误判为重复购买而无法支付。
     */
    private static final int DUPLICATE_PAY_SECONDS = 120;
    /** 需要人工核对、禁止自动重试开卡的错误标记。 */
    private static final String ERROR_AMOUNT_MISMATCH = "不一致";
    private static final String ERROR_DUPLICATE_PAY = "重复支付";

    @Autowired
    private MemberCardService memberCardService;
    @Autowired
    private CustomerService customerService;
    @Autowired
    private MemberCardOrderMapper orderMapper;
    @Autowired
    private OrderMapper mallOrderMapper;
    @Autowired
    private BrandMemberClient brandMemberClient;
    @Autowired
    private PayService payService;
    @Autowired
    private PlatformTransactionManager transactionManager;

    // ==================== 下单 ====================

    /**
     * 创建品牌会员卡支付单。只接收产品编码，价格由 CRM 报价决定。
     */
    public Map<String, Object> createOrder(Long customerId, Map<String, Object> params) {
        if (customerId == null) {
            throw new BusinessException("请先登录", 401);
        }
        Customer customer = customerService.getById(customerId);
        if (customer == null) {
            throw new BusinessException("客户不存在", 404);
        }
        if (customer.getBrandCardLocked() != null && customer.getBrandCardLocked() == 1) {
            throw new BusinessException("品牌会员购买已暂停，请联系工作人员解锁后再试", 403);
        }
        Map<String, Object> form = params == null ? new HashMap<>() : params;
        if (!Boolean.parseBoolean(String.valueOf(form.getOrDefault("agreeTerms", "false")))) {
            throw new BusinessException("请先阅读并同意会员卡购买条款");
        }
        String productCode = normalizeProductCode(stringValue(form.get("productCode")));
        if (productCode == null) {
            productCode = normalizeProductCode(stringValue(form.get("cardType")));
        }
        if (productCode == null) {
            throw new BusinessException("请选择要开通的会员卡");
        }
        String cardType = PRODUCT_MONTH.equals(productCode) ? MemberCardService.TYPE_MONTH : MemberCardService.TYPE_YEAR;
        MemberCardConfig config = memberCardService.getConfigByType(cardType);
        if (config.getStatus() != null && config.getStatus() == 0) {
            throw new BusinessException("该会员卡暂未开放");
        }
        // 防重：重复点击/网络重试不能生成第二笔未支付单；买卡成功后立刻续费是合法行为，不在此拦截
        guardRecentOrder(customerId, productCode);

        // 真实支付必须先拿到微信 openId，缺失时不落单，避免产生无法支付的孤儿订单
        String openId = null;
        if (!memberCardService.isTestMode()) {
            openId = stringValue(form.get("openId"));
            if (openId == null) {
                throw new BusinessException("微信支付参数缺失，请重试");
            }
        }

        JsonNode quote = brandMemberClient.quote(String.valueOf(customerId), productCode);
        int priceCents = quote.path("priceCents").asInt(0);
        String quoteId = quote.path("quoteId").asText("");
        if (priceCents <= 0 || quoteId.isEmpty()) {
            throw new BusinessException("会员卡报价异常，请稍后重试", 503);
        }

        LocalDateTime now = LocalDateTime.now();
        MemberCardOrder order = new MemberCardOrder();
        order.setOrderSn("C" + now.format(ORDER_SN_FORMAT) + String.format("%04d", RANDOM.nextInt(10000)));
        order.setCustomerId(customerId);
        order.setConfigId(config.getId());
        order.setCardType(cardType);
        order.setProductCode(productCode);
        order.setQuoteId(quoteId);
        order.setPaidCents(priceCents);
        order.setAmount(centsToYuan(priceCents));
        order.setState(MemberCardOrder.STATE_UNPAID);
        order.setPayType(1);
        order.setPayChannel(PayChannel.WX_MINI);
        order.setRefundState(REFUND_NONE);
        order.setCrmRefunded(0);
        order.setIdempotencyKey("brand-card:issue:" + order.getOrderSn());
        applyProfile(order, form);
        if (orderMapper.insert(order) != 1) {
            throw new BusinessException("开卡订单保存失败");
        }

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("orderSn", order.getOrderSn());
        result.put("productCode", productCode);
        result.put("productName", productName(productCode));
        result.put("amount", order.getAmount());
        result.put("priceCents", priceCents);
        result.put("payChannel", PayChannel.WX_MINI);

        if (memberCardService.isTestMode()) {
            result.put("testMode", true);
            return result;
        }

        Order payOrder = new Order();
        payOrder.setId(order.getId());
        payOrder.setCode(order.getOrderSn());
        payOrder.setPayAmount(order.getAmount());
        payOrder.setPayType(1);
        payOrder.setPayChannel(PayChannel.WX_MINI);
        payOrder.setProductTitle(productName(productCode));
        Map<?, ?> payResult;
        try {
            // generatePay 的 payParams 实际是嵌套 Map，静态泛型为 String，这里按 Object 读取避免强转失败
            payResult = payService.generatePay(payOrder, openId, productName(productCode));
        } catch (RuntimeException e) {
            log.warn("品牌会员卡发起支付失败, orderSn={}, error={}", order.getOrderSn(), e.getMessage());
            throw new BusinessException("发起微信支付失败，请稍后重试");
        }
        Object payOrderSn = payResult.get("orderSn");
        order.setMerOrdId(payOrderSn == null ? null : payOrderSn.toString());
        orderMapper.updateById(order);
        result.put("testMode", false);
        result.put("payParams", payResult.get("payParams"));
        result.put("payOrderSn", payOrderSn);
        return result;
    }

    /**
     * 下单前的防重检查：60 秒内刚创建的待支付单视为同一次点击的重复提交，直接拒绝。
     *
     * <p>注意：不能按「最近已支付」拦截新订单。用户买完卡立即续费是合法行为，
     * 旧实现用 30 分钟窗口会把续费误判成重复购买导致无法支付。
     * 真正的并发重复扣款由 {@link #hasDuplicatePaidOrder(MemberCardOrder)}
     * 在结算时按「订单创建早于另一笔支付」判定，并标记人工退款。</p>
     */
    private void guardRecentOrder(Long customerId, String productCode) {
        Long recentCreated = orderMapper.selectCount(new LambdaQueryWrapper<MemberCardOrder>()
                .eq(MemberCardOrder::getCustomerId, customerId)
                .eq(MemberCardOrder::getProductCode, productCode)
                .eq(MemberCardOrder::getState, MemberCardOrder.STATE_UNPAID)
                .ge(MemberCardOrder::getCreateTime, LocalDateTime.now().minusSeconds(CREATE_DEDUP_SECONDS)));
        if (recentCreated != null && recentCreated > 0) {
            throw new BusinessException("支付单正在创建，请稍后重试", 409);
        }
    }

    /**
     * 测试环境模拟支付：不调用汇付，直接按订单金额走 CRM 开卡。
     */
    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> mockPay(Long customerId, String orderSn) {
        if (!memberCardService.isTestMode()) {
            throw new BusinessException("当前环境不支持模拟支付", 403);
        }
        MemberCardOrder order = lockOrder(orderSn);
        if (order == null || !order.getCustomerId().equals(customerId)) {
            throw new BusinessException("开卡订单不存在", 404);
        }
        if (order.getState() != null && order.getState() == MemberCardOrder.STATE_PAID) {
            return orderStatus(customerId, orderSn);
        }
        if (order.getState() != null && (order.getState() == MemberCardOrder.STATE_REFUNDED
                || order.getState() == MemberCardOrder.STATE_CLOSED)) {
            throw new BusinessException("该订单已终止，不能模拟支付", 409);
        }
        settlePaidOrder(order, order.getPaidCents(), "MOCK-" + order.getOrderSn(),
                "MOCK-" + System.currentTimeMillis(), null, null, 1, PayChannel.WX_MINI);
        return orderStatus(customerId, orderSn);
    }

    // ==================== 验签回调 ====================

    /** 是否为品牌会员卡支付单（自动去掉汇付附加的 A 后缀）。 */
    public boolean isCardOrder(String merOrdId) {
        String orderSn = baseOrderSn(merOrdId);
        if (orderSn == null || !orderSn.startsWith("C")) {
            return false;
        }
        return orderMapper.selectCount(new LambdaQueryWrapper<MemberCardOrder>()
                .eq(MemberCardOrder::getOrderSn, orderSn)) > 0;
    }

    /**
     * 汇付支付成功回调。金额不符或订单已终止时只记录不重试；
     * CRM 暂时不可用时抛出异常让汇付继续重试。
     */
    public void handlePayCallback(String merOrdId, BigDecimal transAmount, String hfSeqId,
                                  String partyOrderId, String outTransId, Integer payType,
                                  String payChannel) {
        String orderSn = baseOrderSn(merOrdId);
        TransactionTemplate tx = new TransactionTemplate(transactionManager);
        try {
            tx.executeWithoutResult(status -> settleInTransaction(orderSn, merOrdId, transAmount,
                    hfSeqId, partyOrderId, outTransId, payType, payChannel));
        } catch (RuntimeException e) {
            log.error("品牌会员卡开卡失败，等待汇付重试, orderSn={}, error={}", orderSn, e.getMessage());
            // 结算事务已回滚，单独记录失败原因供后台核对；保留重试入口
            try {
                tx.executeWithoutResult(status -> {
                    MemberCardOrder current = lockOrder(orderSn);
                    if (current != null) {
                        // 开卡事务已回滚，必须把支付流水一并补记，否则后台无法发起退款
                        fillPaymentRefs(current, merOrdId, hfSeqId, partyOrderId, outTransId,
                                payType, payChannel);
                        markPaidError(current, e.getMessage());
                    }
                });
            } catch (RuntimeException ignored) {
                log.error("品牌会员卡开卡失败原因记录失败, orderSn={}", orderSn);
            }
            throw e;
        }
    }

    /**
     * 汇付退款结果回调（refund.standard）。退款请求时已按受理结果标记退款，
     * 这里只做对账补充：补记退款流水；退款失败时回写 payError 提示人工核对。
     */
    public void handleRefundCallback(String merOrdId, BigDecimal refundAmount, String hfSeqId,
                                     String transStat, String bankMessage) {
        String orderSn = baseOrderSn(merOrdId);
        MemberCardOrder order = findOrder(orderSn);
        if (order == null || order.getState() == null || order.getState() != MemberCardOrder.STATE_REFUNDED) {
            return;
        }
        if ("F".equals(transStat)) {
            String message = "退款失败（汇付）：" + (hasText(bankMessage) ? bankMessage : "未返回原因")
                    + "，退款流水 " + (hasText(hfSeqId) ? hfSeqId : "-") + "，请人工核对";
            order.setPayError(message.substring(0, Math.min(255, message.length())));
            orderMapper.updateById(order);
            log.error("品牌会员卡退款失败回调, orderSn={}, bankMessage={}", orderSn, bankMessage);
            return;
        }
        if (!hasText(order.getRefundHfSeqId()) && hasText(hfSeqId)) {
            order.setRefundHfSeqId(hfSeqId);
            orderMapper.updateById(order);
        }
    }

    private void settleInTransaction(String orderSn, String merOrdId, BigDecimal transAmount,
                                     String hfSeqId, String partyOrderId, String outTransId,
                                     Integer payType, String payChannel) {
        MemberCardOrder order = lockOrder(orderSn);
        if (order == null) {
            log.warn("品牌会员卡回调找不到订单, merOrdId={}", merOrdId);
            return;
        }
        if (order.getState() != null && order.getState() == MemberCardOrder.STATE_PAID) {
            // 同一开卡单收到第二笔不同流水：说明用户为同一订单付了两次，钱已到账但不能再开卡
            if (hasText(hfSeqId) && hasText(order.getHfSeqId()) && !hfSeqId.equals(order.getHfSeqId())) {
                log.error("品牌会员卡重复支付, orderSn={}, 原流水={}, 新流水={}",
                        orderSn, order.getHfSeqId(), hfSeqId);
                recordPayError(order, "重复支付：同一开卡单收到两笔流水（原 " + order.getHfSeqId()
                        + "，新 " + hfSeqId + "），请人工核对退款");
            }
            return;
        }
        if (order.getState() != null && (order.getState() == MemberCardOrder.STATE_REFUNDED
                || order.getState() == MemberCardOrder.STATE_CLOSED)) {
            log.warn("品牌会员卡回调订单已终止, orderSn={}, state={}", orderSn, order.getState());
            return;
        }
        int paidCents = transAmount == null ? 0
                : transAmount.multiply(BigDecimal.valueOf(100)).setScale(0, RoundingMode.HALF_UP).intValue();
        if (order.getPaidCents() != null && order.getPaidCents() != paidCents) {
            // 金额不符不自动开卡，也不允许后台“重试开卡”，只能人工核对退款；
            // 先保存流水号，后台才能凭流水在汇付侧发起退款。
            fillPaymentRefs(order, merOrdId, hfSeqId, partyOrderId, outTransId, payType, payChannel);
            markPaidError(order, "回调金额 " + paidCents + " 分与订单 " + order.getPaidCents()
                    + " 分不一致，请人工核对退款");
            log.error("品牌会员卡支付金额不一致, orderSn={}, paid={}, expected={}",
                    orderSn, paidCents, order.getPaidCents());
            return;
        }
        settlePaidOrder(order, paidCents, merOrdId, hfSeqId, partyOrderId, outTransId,
                payType, payChannel);
    }

    /**
     * 已支付订单的开卡结算。调用方须先持有订单行锁。
     */
    private void settlePaidOrder(MemberCardOrder order, int paidCents, String merOrdId,
                                 String hfSeqId, String partyOrderId, String outTransId,
                                 Integer payType, String payChannel) {
        // 先锁客户行，串行化同一客户的并发回调/重试，再做重复支付判断
        memberCardService.lockCustomer(order.getCustomerId());
        if (hasDuplicatePaidOrder(order)) {
            fillPaymentRefs(order, merOrdId, hfSeqId, partyOrderId, outTransId, payType, payChannel);
            markPaidError(order, ERROR_DUPLICATE_PAY
                    + "：同一会员卡存在另一笔并发支付，本笔支付已成功但未开卡，需人工核对退款");
            log.error("品牌会员卡重复支付已拦截, orderSn={}, customerId={}",
                    order.getOrderSn(), order.getCustomerId());
            return;
        }

        JsonNode issue = issueWithQuoteFallback(order, paidCents);
        JsonNode cardNode = issue.path("card");
        LocalDate validFrom = parseDate(cardNode.path("validFrom").asText(""));
        LocalDate validUntil = parseDate(cardNode.path("validUntil").asText(""));
        String cardType = PRODUCT_MONTH.equals(order.getProductCode())
                ? MemberCardService.TYPE_MONTH : MemberCardService.TYPE_YEAR;
        // 本地权益期按支付单幂等：重试开卡时复用已创建的本地卡，避免同一支付单挂两张权益
        CustomerMemberCard card = memberCardService.getOne(new LambdaQueryWrapper<CustomerMemberCard>()
                .eq(CustomerMemberCard::getPayOrderId, order.getId())
                .orderByAsc(CustomerMemberCard::getId)
                .last("limit 1"));
        if (card == null) {
            card = memberCardService.issuePaidCard(order.getCustomerId(), cardType,
                    order.getAmount(), order.getId(), validFrom, validUntil,
                    cardNode.path("productName").asText(""));
        }

        LocalDateTime now = LocalDateTime.now();
        order.setState(MemberCardOrder.STATE_PAID);
        order.setCardId(card.getId());
        order.setCrmCardId(cardNode.path("cardId").asText(""));
        fillPaymentRefs(order, merOrdId, hfSeqId, partyOrderId, outTransId, payType, payChannel);
        order.setPayTime(now);
        order.setPayError(null);
        if (orderMapper.updateById(order) != 1) {
            throw new BusinessException("开卡订单更新失败");
        }
    }

    private void fillPaymentRefs(MemberCardOrder order, String merOrdId, String hfSeqId,
                                 String partyOrderId, String outTransId, Integer payType,
                                 String payChannel) {
        order.setMerOrdId(merOrdId);
        order.setHfSeqId(hfSeqId);
        order.setPartyOrderId(partyOrderId);
        order.setOutTransId(outTransId);
        if (payType != null) {
            order.setPayType(payType);
        }
        if (payChannel != null && !payChannel.isEmpty()) {
            order.setPayChannel(payChannel);
        }
    }

    /**
     * 并发重复支付判定：只有另一笔同款卡支付严格发生在本单创建之后，才说明两笔单在支付前已并行存在，
     * 属于双击/并发重复扣款；本单创建不早于上一笔支付的是正常续费，CRM 会把新卡期接在原卡期之后。
     *
     * <p>入库时间只到秒，买卡成功后立刻续费时「上一笔支付秒 = 本单创建秒」很常见，
     * 因此这里用严格大于（gt）而不是大于等于（ge），否则正常续费会被误判为重复支付。</p>
     *
     * 历史订单缺少下单时间时退回固定窗口兜底。
     */
    private boolean hasDuplicatePaidOrder(MemberCardOrder order) {
        LambdaQueryWrapper<MemberCardOrder> query = new LambdaQueryWrapper<MemberCardOrder>()
                .eq(MemberCardOrder::getCustomerId, order.getCustomerId())
                .eq(MemberCardOrder::getProductCode, order.getProductCode())
                .eq(MemberCardOrder::getState, MemberCardOrder.STATE_PAID)
                .ne(MemberCardOrder::getId, order.getId());
        if (order.getCreateTime() == null) {
            query.ge(MemberCardOrder::getPayTime, LocalDateTime.now().minusSeconds(DUPLICATE_PAY_SECONDS));
        } else {
            query.gt(MemberCardOrder::getPayTime, order.getCreateTime());
        }
        Long count = orderMapper.selectCount(query);
        return count != null && count > 0;
    }

    private boolean hasText(String value) {
        return value != null && !value.trim().isEmpty();
    }

    /**
     * 报价 30 分钟过期后，按当前版本重新报价；只有价格未变才继续开卡，
     * 避免在用户已付金额与新产品价格不一致时强行开卡。
     */
    private JsonNode issueWithQuoteFallback(MemberCardOrder order, int paidCents) {
        String paidAt = LocalDateTime.now().format(CRM_TIME_FORMAT);
        try {
            return brandMemberClient.issue(order.getQuoteId(), order.getOrderSn(), paidCents,
                    paidAt, order.getIdempotencyKey());
        } catch (BusinessException first) {
            log.warn("品牌会员卡首次开卡失败，尝试重新报价, orderSn={}, error={}",
                    order.getOrderSn(), first.getMessage());
            JsonNode quote;
            try {
                quote = brandMemberClient.quote(String.valueOf(order.getCustomerId()), order.getProductCode());
            } catch (BusinessException e) {
                throw first;
            }
            if (quote.path("priceCents").asInt(-1) != paidCents) {
                throw new BusinessException("会员卡价格已调整，请联系工作人员核对退款或补差", 409);
            }
            String quoteId = quote.path("quoteId").asText("");
            if (quoteId.isEmpty()) {
                throw first;
            }
            order.setQuoteId(quoteId);
            orderMapper.updateById(order);
            return brandMemberClient.issue(quoteId, order.getOrderSn(), paidCents, paidAt,
                    order.getIdempotencyKey() + ":" + quoteId);
        }
    }

    // ==================== 支付单查询 ====================

    public Map<String, Object> orderStatus(Long customerId, String orderSn) {
        MemberCardOrder order = findOrder(orderSn);
        if (order == null || (customerId != null && !order.getCustomerId().equals(customerId))) {
            throw new BusinessException("开卡订单不存在", 404);
        }
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("orderSn", order.getOrderSn());
        result.put("productCode", order.getProductCode());
        result.put("productName", productName(order.getProductCode()));
        result.put("amount", order.getAmount());
        result.put("state", order.getState());
        result.put("stateText", stateText(order.getState()));
        result.put("payTime", order.getPayTime() == null ? null
                : order.getPayTime().format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss")));
        result.put("refundState", order.getRefundState());
        result.put("refundType", order.getRefundType());
        result.put("refundCents", order.getRefundCents());
        result.put("payError", order.getPayError());
        if (order.getCardId() != null) {
            CustomerMemberCard card = memberCardService.getById(order.getCardId());
            if (card != null) {
                result.put("cardId", card.getId());
                result.put("cardNo", card.getCardNo());
                result.put("startTime", card.getStartTime() == null ? null
                        : card.getStartTime().format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss")));
                result.put("endTime", card.getEndTime() == null ? null
                        : card.getEndTime().format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss")));
            }
        }
        return result;
    }

    // ==================== 退款 ====================

    /**
     * 退款试算：7 天内全额；之后按实付减已享优惠，最多退到 0。
     */
    public Map<String, Object> refundPreview(Long customerId, String orderSn) {
        MemberCardOrder order = findOrder(orderSn);
        if (order == null || (customerId != null && !order.getCustomerId().equals(customerId))) {
            throw new BusinessException("开卡订单不存在", 404);
        }
        if (customerId != null && order.getState() != null
                && order.getState() == MemberCardOrder.STATE_PAID_PENDING) {
            throw new BusinessException("该订单需人工核对处理，请联系工作人员", 409);
        }
        return buildRefundPreview(order);
    }

    /**
     * 客户本人的品牌卡支付单，供小程序展示购卡记录、7 天退款入口与锁定状态。
     * 金额与退款试算一律取服务端结果，前端只做展示。
     */
    public Map<String, Object> customerOrders(Long customerId) {
        Customer customer = customerService.getById(customerId);
        Map<String, Object> result = new LinkedHashMap<>();
        boolean locked = customer != null && customer.getBrandCardLocked() != null
                && customer.getBrandCardLocked() == 1;
        result.put("locked", locked);
        result.put("lockReason", customer == null ? null : customer.getBrandCardLockReason());

        List<MemberCardOrder> orders = orderMapper.selectList(new LambdaQueryWrapper<MemberCardOrder>()
                .eq(MemberCardOrder::getCustomerId, customerId)
                .orderByDesc(MemberCardOrder::getId)
                .last("limit 10"));
        List<Map<String, Object>> rows = new ArrayList<>();
        for (MemberCardOrder order : orders) {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("orderSn", order.getOrderSn());
            row.put("productCode", order.getProductCode());
            row.put("productName", productName(order.getProductCode()));
            row.put("amount", order.getAmount());
            row.put("paidCents", order.getPaidCents());
            row.put("state", order.getState());
            row.put("stateText", stateText(order.getState()));
            row.put("refundState", order.getRefundState());
            row.put("refundType", order.getRefundType());
            row.put("refundCents", order.getRefundCents());
            row.put("refundAmount", order.getRefundAmount());
            row.put("refundTime", order.getRefundTime() == null ? null
                    : order.getRefundTime().format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss")));
            row.put("payTime", order.getPayTime() == null ? null
                    : order.getPayTime().format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss")));
            // 订单页把品牌卡单与卡券单合并展示，需要创建时间参与排序。
            row.put("createTime", order.getCreateTime() == null ? null
                    : order.getCreateTime().format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss")));
            row.put("crmCardId", order.getCrmCardId());
            row.put("payError", order.getPayError());
            boolean refundable = order.getState() != null
                    && order.getState() == MemberCardOrder.STATE_PAID
                    && !REFUND_SUCCESS.equals(order.getRefundState());
            row.put("refundable", refundable);
            if (refundable) {
                // 试算失败只影响该行的退款入口，不让整个购卡记录列表失败
                try {
                    Map<String, Object> preview = buildRefundPreview(order);
                    row.put("usedBenefitCents", preview.get("usedBenefitCents"));
                    row.put("savedCents", preview.get("savedCents"));
                    row.put("redeemedGiftCents", preview.get("redeemedGiftCents"));
                    row.put("refundCents", preview.get("refundCents"));
                    row.put("refundAmount", preview.get("refundAmount"));
                    row.put("refundType", preview.get("refundType"));
                    row.put("within7Days", preview.get("within7Days"));
                    row.put("allowed", preview.get("allowed"));
                    row.put("reasonCode", preview.get("reasonCode"));
                    row.put("needConfirm", preview.get("needConfirm"));
                    row.put("deadline", preview.get("deadline"));
                    row.put("policy", preview.get("policy"));
                } catch (BusinessException e) {
                    row.put("allowed", false);
                    row.put("refundQuoteError", e.getMessage());
                }
            }
            rows.add(row);
        }
        result.put("orders", rows);
        return result;
    }

    /**
     * 退款试算。正常已开卡订单以 CRM 试算为唯一口径：
     * 7 天内 = 实付 − 已兑实物礼；7 天后 = 实付 − 已享会员优惠 − 已兑实物礼；≤0 不可退。
     * CRM 不可达时直接报错，绝不回退成本地计算，避免两端金额不一致。
     * 支付异常单（未开卡）不经 CRM，人工核对后按实付全额退回。
     */
    private Map<String, Object> buildRefundPreview(MemberCardOrder order) {
        boolean pending = order.getState() != null
                && order.getState() == MemberCardOrder.STATE_PAID_PENDING;
        if (!pending && (order.getState() == null || order.getState() != MemberCardOrder.STATE_PAID)) {
            throw new BusinessException("该订单当前不可退款", 409);
        }
        int paidCents = order.getPaidCents() == null ? cents(order.getAmount()) : order.getPaidCents();
        LocalDateTime paidAt = order.getPayTime() == null ? order.getCreateTime() : order.getPayTime();
        String localDeadline = paidAt == null ? null
                : paidAt.plusDays(7).format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("orderSn", order.getOrderSn());
        result.put("productCode", order.getProductCode());
        result.put("productName", productName(order.getProductCode()));
        result.put("paidCents", paidCents);
        if (pending) {
            result.put("savedCents", 0);
            result.put("redeemedGiftCents", 0);
            result.put("usedBenefitCents", 0);
            result.put("refundCents", paidCents);
            result.put("refundAmount", centsToYuan(paidCents));
            result.put("refundType", REFUND_WITHIN_7D);
            result.put("within7Days", paidAt != null && !LocalDateTime.now().isAfter(paidAt.plusDays(7)));
            result.put("allowed", true);
            result.put("reasonCode", null);
            result.put("needConfirm", false);
            result.put("deadline", localDeadline);
            result.put("policy", "支付异常订单：未开卡，人工核对后全额退回实付金额。");
            return result;
        }

        JsonNode quote = brandMemberClient.refundQuote(order.getOrderSn());
        boolean allowed = quote.path("allowed").asBoolean(false);
        int savedCents = Math.max(0, quote.path("savedCents").asInt(0));
        int giftCents = Math.max(0, quote.path("redeemedGiftCents").asInt(0));
        int refundCents = allowed ? Math.max(0, quote.path("refundableCents").asInt(0)) : 0;
        if (refundCents > paidCents) {
            // CRM 记录的实付与本地不一致时不能按 CRM 金额原路退回
            log.error("品牌会员卡退款试算超出本地实付, orderSn={}, crm={}, local={}",
                    order.getOrderSn(), refundCents, paidCents);
            throw new BusinessException("退款金额与支付记录不一致，请联系工作人员核对", 409);
        }
        String window = quote.path("window").asText(quote.path("refundType").asText(""));
        String windowEndsAt = quote.path("windowEndsAt").asText("");
        String message = quote.path("message").asText("");
        String reasonCode = quote.path("reasonCode").isTextual() ? quote.path("reasonCode").asText() : null;
        boolean within7 = REFUND_WITHIN_7D.equals(window);
        // 本地订单记录的会员优惠多于 CRM 已收到的上报（上报未开启/滞后），CRM 试算会多退：
        // 暂停在线退款，交人工在 CRM 后台核对后协商处理。
        if (allowed && !within7 && order.getCardId() != null) {
            int localSaved = usedBenefitCents(order.getCardId());
            result.put("localSavedCents", localSaved);
            if (localSaved > savedCents) {
                log.warn("品牌会员卡退款试算优惠未同步, orderSn={}, crmSaved={}, localSaved={}",
                        order.getOrderSn(), savedCents, localSaved);
                allowed = false;
                refundCents = 0;
                reasonCode = "SAVINGS_SYNC_PENDING";
                message = "会员优惠记录正在同步，暂不能在线退款，请联系工作人员核对";
            }
        }
        result.put("savedCents", savedCents);
        result.put("redeemedGiftCents", giftCents);
        result.put("usedBenefitCents", savedCents + giftCents);
        result.put("refundCents", refundCents);
        result.put("refundAmount", centsToYuan(refundCents));
        result.put("refundType", quote.path("refundType").asText(REFUND_AFTER_7D));
        result.put("within7Days", within7);
        result.put("allowed", allowed);
        result.put("reasonCode", reasonCode);
        // 旧版小程序/后台按 needConfirm 弹二次确认；新规则下 ¥0 一律不可退，不再需要确认
        result.put("needConfirm", false);
        result.put("deadline", windowEndsAt.length() >= 19
                ? windowEndsAt.substring(0, 19).replace('T', ' ') : localDeadline);
        result.put("policy", message.isEmpty()
                ? (allowed ? "可退 ¥" + centsToYuan(refundCents).toPlainString() : "当前不可退款")
                : message);
        return result;
    }

    /**
     * 执行退款。小程序自助退款 operatorId 为空；后台退款传管理员 id。
     * confirmZero 仅为兼容旧调用保留：新规则下可退金额 ≤0 一律不退，特殊情况走 CRM 后台协商退款。
     */
    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> refund(Long customerId, String orderSn, String reason,
                                      boolean confirmZero, Long operatorId) {
        return refundInternal(customerId, orderSn, reason, confirmZero, operatorId, false);
    }

    /**
     * 退款主流程。crmInitiated=true 表示由 CRM 后台发起：跳过防薅羊毛计数，
     * 且不再回调 CRM 撤销（CRM 自己会在拿到结果后落库），避免同一笔退款产生两次撤销事件。
     */
    private Map<String, Object> refundInternal(Long customerId, String orderSn, String reason,
                                               boolean confirmZero, Long operatorId, boolean crmInitiated) {
        MemberCardOrder order = lockOrder(orderSn);
        if (order == null || (customerId != null && !order.getCustomerId().equals(customerId))) {
            throw new BusinessException("开卡订单不存在", 404);
        }
        if (order.getRefundState() != null && REFUND_SUCCESS.equals(order.getRefundState())) {
            throw new BusinessException("该订单已退款", 409);
        }
        if (order.getState() != null && order.getState() == MemberCardOrder.STATE_REFUNDED) {
            throw new BusinessException("该订单已退款", 409);
        }
        // 金额不一致/重复支付等异常单只能由后台人工核对退款，避免按错误金额原路退回
        if (customerId != null && order.getState() != null
                && order.getState() == MemberCardOrder.STATE_PAID_PENDING) {
            throw new BusinessException("该订单需人工核对处理，请联系工作人员", 409);
        }
        boolean wasPaid = order.getState() != null && order.getState() == MemberCardOrder.STATE_PAID;
        Map<String, Object> preview = buildRefundPreview(order);
        int refundCents = (Integer) preview.get("refundCents");
        if (!Boolean.TRUE.equals(preview.get("allowed")) || refundCents <= 0) {
            String policy = String.valueOf(preview.get("policy"));
            throw new BusinessException(operatorId == null ? policy
                    : policy + "（如需特殊处理，请在 CRM 后台走协商退款）", 409);
        }

        String refundHfSeqId = null;
        if (!memberCardService.isTestMode()) {
            if (order.getMerOrdId() == null) {
                throw new BusinessException("缺少支付流水，不能自动退款，请联系工作人员", 409);
            }
            Order refundOrder = new Order();
            refundOrder.setId(order.getId());
            refundOrder.setCode(order.getOrderSn());
            refundOrder.setMerOrdId(order.getMerOrdId());
            refundOrder.setHfSeqId(order.getHfSeqId());
            refundOrder.setPayTime(order.getPayTime());
            refundOrder.setPayAmount(order.getAmount());
            refundOrder.setHasRefundAmount(BigDecimal.ZERO);
            refundOrder.setState(OrderState.PAID_NOT_COMMENT.getValue());
            refundOrder.setRefundState(0);
            try {
                refundHfSeqId = payService.refundPay(refundOrder, centsToYuan(refundCents));
            } catch (RuntimeException e) {
                log.error("品牌会员卡汇付退款失败, orderSn={}, error={}", orderSn, e.getMessage());
                throw new BusinessException("退款通道处理失败，请稍后重试或联系工作人员", 503);
            }
            if (refundHfSeqId == null || refundHfSeqId.isEmpty()) {
                throw new BusinessException("退款通道处理失败，请稍后重试或联系工作人员", 503);
            }
        } else {
            refundHfSeqId = "MOCK-REFUND-" + System.currentTimeMillis();
        }

        boolean crmRefunded = crmInitiated || revokeCrmCard(order, refundCents,
                (String) preview.get("refundType"), reason, false);
        LocalDateTime now = LocalDateTime.now();
        order.setState(MemberCardOrder.STATE_REFUNDED);
        order.setRefundType((String) preview.get("refundType"));
        order.setUsedBenefitCents((Integer) preview.get("usedBenefitCents"));
        order.setRefundCents(refundCents);
        order.setRefundAmount(centsToYuan(refundCents));
        order.setRefundTime(now);
        order.setRefundReason(reason);
        order.setRefundOperatorId(operatorId);
        order.setRefundState(crmRefunded ? REFUND_SUCCESS : REFUND_PENDING_CRM);
        order.setCrmRefunded(crmRefunded ? 1 : 0);
        // 退款流水单独保存，保留原支付 hf_seq_id 供汇付退款/查询核对
        order.setRefundHfSeqId(refundHfSeqId);
        if (orderMapper.updateById(order) != 1) {
            throw new BusinessException("退款单更新失败");
        }

        CustomerMemberCard card = order.getCardId() == null ? null : memberCardService.getById(order.getCardId());
        if (card != null) {
            card.setStatus(CustomerMemberCard.STATUS_REFUNDED);
            card.setRefundAmount(centsToYuan(refundCents));
            card.setRefundTime(now);
            card.setRefundReason(reason);
            card.setRemark("在线退款" + (crmRefunded ? "" : "（CRM 待撤销）"));
            memberCardService.updateById(card);
        }

        boolean locked = false;
        // 只有正常已支付订单的自助 7 天退款才计入防薅羊毛；异常单人工退款与 CRM 发起退款不计
        if (!crmInitiated && operatorId == null && wasPaid
                && REFUND_WITHIN_7D.equals(order.getRefundType())) {
            locked = checkAndLockAbuse(order.getCustomerId());
        }

        Map<String, Object> result = buildRefundPreviewResult(order, preview);
        result.put("crmRefunded", crmRefunded);
        result.put("customerLocked", locked);
        if (!crmRefunded) {
            result.put("warning", "退款已原路退回；跨品牌权益撤销暂未完成，系统会自动重试，请勿重复购卡。");
        }
        return result;
    }

    private Map<String, Object> buildRefundPreviewResult(MemberCardOrder order, Map<String, Object> preview) {
        Map<String, Object> result = new LinkedHashMap<>(preview);
        result.put("state", order.getState());
        result.put("stateText", stateText(order.getState()));
        result.put("refundState", order.getRefundState());
        result.put("refundTime", order.getRefundTime() == null ? null
                : order.getRefundTime().format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss")));
        return result;
    }

    /**
     * 调用 CRM 撤销卡权。失败时保留 PENDING_CRM，由定时任务或后台重试。
     * 按开卡订单号定位（CRM 按 (soldBy, orderRef) 唯一），不依赖本地是否存了 CRM 卡 id；
     * CRM 确认没有这张卡（开卡从未成功）时视为无需撤销，避免待撤销永远重试。
     */
    public boolean revokeCrmCard(MemberCardOrder order, int refundCents, String refundType,
                                 String reason, boolean quiet) {
        try {
            brandMemberClient.refund(order.getOrderSn(), order.getCrmCardId(), refundCents,
                    refundType, reason, LocalDateTime.now().format(CRM_TIME_FORMAT),
                    "brand-card:refund:" + order.getOrderSn());
            return true;
        } catch (BrandMemberException e) {
            if (e.is("CARD_NOT_FOUND") && (order.getCrmCardId() == null || order.getCrmCardId().isEmpty())) {
                log.info("品牌会员卡在 CRM 无记录，无需撤销, orderSn={}", order.getOrderSn());
                return true;
            }
            if (!quiet) {
                log.warn("品牌会员卡 CRM 撤销失败, orderSn={}, code={}, error={}",
                        order.getOrderSn(), e.getCode(), e.getMessage());
            }
            return false;
        } catch (BusinessException e) {
            if (!quiet) {
                log.warn("品牌会员卡 CRM 撤销失败, orderSn={}, error={}", order.getOrderSn(), e.getMessage());
            }
            return false;
        }
    }

    /**
     * 连续两次 7 天内自助退款 → 锁定品牌会员购买。
     */
    private boolean checkAndLockAbuse(Long customerId) {
        List<MemberCardOrder> recent = orderMapper.selectList(new LambdaQueryWrapper<MemberCardOrder>()
                .eq(MemberCardOrder::getCustomerId, customerId)
                .eq(MemberCardOrder::getState, MemberCardOrder.STATE_REFUNDED)
                .eq(MemberCardOrder::getRefundType, REFUND_WITHIN_7D)
                .isNull(MemberCardOrder::getRefundOperatorId)
                .orderByDesc(MemberCardOrder::getRefundTime)
                .last("limit 2"));
        if (recent.size() < 2) {
            return false;
        }
        Customer customer = customerService.getById(customerId);
        if (customer == null || (customer.getBrandCardLocked() != null && customer.getBrandCardLocked() == 1)) {
            return customer != null;
        }
        customer.setBrandCardLocked(1);
        customer.setBrandCardLockReason("连续两次 7 天内无理由退款，品牌会员购买已锁定");
        customer.setBrandCardLockedAt(LocalDateTime.now());
        customerService.updateById(customer);
        return true;
    }

    public void unlockCustomer(Long customerId) {
        Customer customer = customerService.getById(customerId);
        if (customer == null) {
            throw new BusinessException("客户不存在", 404);
        }
        // updateById 会忽略 null 字段，解锁必须显式清空原因与时间，避免后台残留旧锁定信息
        customerService.update(new LambdaUpdateWrapper<Customer>()
                .eq(Customer::getId, customerId)
                .set(Customer::getBrandCardLocked, 0)
                .set(Customer::getBrandCardLockReason, null)
                .set(Customer::getBrandCardLockedAt, null));
    }

    // ==================== 定时补偿 ====================

    /**
     * CRM 撤销失败的退款单每 10 分钟重试一次；CR M 幂等接口保证不会重复撤销。
     */
    public int retryPendingCrmRefunds() {
        List<MemberCardOrder> pending = orderMapper.selectList(new LambdaQueryWrapper<MemberCardOrder>()
                .eq(MemberCardOrder::getRefundState, REFUND_PENDING_CRM)
                .orderByAsc(MemberCardOrder::getRefundTime)
                .last("limit 50"));
        int success = 0;
        for (MemberCardOrder order : pending) {
            if (revokeCrmCard(order, order.getRefundCents() == null ? 0 : order.getRefundCents(),
                    order.getRefundType(), order.getRefundReason(), true)) {
                order.setRefundState(REFUND_SUCCESS);
                order.setCrmRefunded(1);
                orderMapper.updateById(order);
                success++;
            }
        }
        return success;
    }

    // ==================== 后台 ====================

    public Map<String, Object> adminPage(Map<String, Object> params) {
        int page = parseInt(params.get("page"), 1);
        int size = parseInt(params.get("size"), 20);
        Map<String, Object> result = new HashMap<>();
        LambdaQueryWrapper<MemberCardOrder> lqw = new LambdaQueryWrapper<>();
        String keyword = stringValue(params.get("keyword"));
        if (keyword == null) {
            keyword = stringValue(params.get("phone"));
        }
        if (keyword != null) {
            List<Long> customerIds = customerService.findIdListByPhoneOrName(keyword);
            if (CollectionUtils.isEmpty(customerIds)) {
                result.put("list", new ArrayList<>());
                result.put("total", 0L);
                result.put("pageNum", page);
                result.put("pageSize", size);
                return result;
            }
            lqw.in(MemberCardOrder::getCustomerId, customerIds);
        }
        if (params.get("state") != null && !"".equals(params.get("state"))) {
            lqw.eq(MemberCardOrder::getState, parseInt(params.get("state"), 0));
        }
        if (params.get("refundState") != null && !"".equals(params.get("refundState"))) {
            lqw.eq(MemberCardOrder::getRefundState, params.get("refundState").toString());
        }
        if (params.get("productCode") != null && !"".equals(params.get("productCode"))) {
            lqw.eq(MemberCardOrder::getProductCode, params.get("productCode").toString());
        }
        if (params.get("payFrom") != null && !"".equals(params.get("payFrom"))) {
            lqw.ge(MemberCardOrder::getCreateTime, parseDateTime(params.get("payFrom").toString(), false));
        }
        if (params.get("payTo") != null && !"".equals(params.get("payTo"))) {
            lqw.le(MemberCardOrder::getCreateTime, parseDateTime(params.get("payTo").toString(), true));
        }
        lqw.orderByDesc(MemberCardOrder::getId);
        com.github.pagehelper.PageHelper.startPage(page, size);
        List<MemberCardOrder> list = orderMapper.selectList(lqw);
        com.github.pagehelper.PageInfo<MemberCardOrder> pageInfo = new com.github.pagehelper.PageInfo<>(list);
        List<Map<String, Object>> rows = new ArrayList<>();
        for (MemberCardOrder order : pageInfo.getList()) {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("id", order.getId());
            row.put("orderSn", order.getOrderSn());
            row.put("customerId", order.getCustomerId());
            Customer customer = customerService.getById(order.getCustomerId());
            if (customer != null) {
                row.put("nickname", customer.getNickname());
                row.put("phone", customer.getPhone());
                row.put("brandCardLocked", customer.getBrandCardLocked());
            }
            row.put("productCode", order.getProductCode());
            row.put("productName", productName(order.getProductCode()));
            row.put("amount", order.getAmount());
            row.put("paidCents", order.getPaidCents());
            row.put("state", order.getState());
            row.put("stateText", stateText(order.getState()));
            row.put("refundState", order.getRefundState());
            row.put("refundType", order.getRefundType());
            row.put("refundCents", order.getRefundCents());
            row.put("refundAmount", order.getRefundAmount());
            row.put("crmCardId", order.getCrmCardId());
            row.put("payTime", order.getPayTime() == null ? null
                    : order.getPayTime().format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss")));
            row.put("refundTime", order.getRefundTime() == null ? null
                    : order.getRefundTime().format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss")));
            row.put("createTime", order.getCreateTime() == null ? null
                    : order.getCreateTime().format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss")));
            row.put("payError", order.getPayError());
            rows.add(row);
        }
        result.put("list", rows);
        result.put("total", pageInfo.getTotal());
        result.put("pageNum", pageInfo.getPageNum());
        result.put("pageSize", pageInfo.getPageSize());
        return result;
    }

    public Map<String, Object> adminPreview(Long orderId) {
        MemberCardOrder order = orderMapper.selectById(orderId);
        if (order == null) {
            throw new BusinessException("开卡订单不存在", 404);
        }
        if (order.getState() != null && order.getState() == MemberCardOrder.STATE_REFUNDED) {
            Map<String, Object> result = new LinkedHashMap<>();
            result.put("orderSn", order.getOrderSn());
            result.put("productCode", order.getProductCode());
            result.put("productName", productName(order.getProductCode()));
            result.put("paidCents", order.getPaidCents());
            result.put("refundCents", order.getRefundCents());
            result.put("refundAmount", order.getRefundAmount());
            result.put("refundType", order.getRefundType());
            result.put("within7Days", false);
            result.put("needConfirm", false);
            result.put("alreadyRefunded", true);
            result.put("policy", "该订单已退款，无需再次操作。");
            return result;
        }
        Map<String, Object> result = buildRefundPreview(order);
        if (order.getRefundState() != null && REFUND_SUCCESS.equals(order.getRefundState())) {
            result.put("alreadyRefunded", true);
        }
        return result;
    }

    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> adminRefund(Long orderId, String reason, boolean confirmZero, Long operatorId) {
        MemberCardOrder order = orderMapper.selectById(orderId);
        if (order == null) {
            throw new BusinessException("开卡订单不存在", 404);
        }
        return refund(null, order.getOrderSn(), reason, confirmZero, operatorId);
    }

    /**
     * 已确认收款但 CRM 开卡失败时的人工重试。仅 STATE_PAID_PENDING 可用。
     * 金额不一致/重复支付必须人工核对退款，不能重新开卡。
     */
    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> retrySettle(Long orderId) {
        MemberCardOrder found = orderMapper.selectById(orderId);
        if (found == null) {
            throw new BusinessException("开卡订单不存在", 404);
        }
        MemberCardOrder order = lockOrder(found.getOrderSn());
        if (order == null) {
            throw new BusinessException("开卡订单不存在", 404);
        }
        if (order.getState() == null || order.getState() != MemberCardOrder.STATE_PAID_PENDING) {
            throw new BusinessException("只有“已支付待开卡”的订单可以重试开卡", 409);
        }
        if (needsManualReview(order.getPayError())) {
            throw new BusinessException("该笔支付需人工核对后处理（金额不一致或重复支付），不能自动重试开卡", 409);
        }
        settlePaidOrder(order, order.getPaidCents() == null ? 0 : order.getPaidCents(),
                order.getMerOrdId(), order.getHfSeqId(), order.getPartyOrderId(),
                order.getOutTransId(), order.getPayType(), order.getPayChannel());
        return orderStatus(null, order.getOrderSn());
    }

    private boolean needsManualReview(String payError) {
        return payError != null && (payError.contains(ERROR_AMOUNT_MISMATCH)
                || payError.contains(ERROR_DUPLICATE_PAY));
    }

    public int retryCrmRefund(Long orderId) {
        MemberCardOrder order = orderMapper.selectById(orderId);
        if (order == null || !REFUND_PENDING_CRM.equals(order.getRefundState())) {
            throw new BusinessException("该退款单不在待撤销状态，无需重试", 409);
        }
        if (!revokeCrmCard(order, order.getRefundCents() == null ? 0 : order.getRefundCents(),
                order.getRefundType(), order.getRefundReason(), false)) {
            throw new BusinessException("CRM 撤销仍未成功，请稍后重试或联系 CRM 管理员", 503);
        }
        order.setRefundState(REFUND_SUCCESS);
        order.setCrmRefunded(1);
        orderMapper.updateById(order);
        return 1;
    }

    // ==================== CRM 内部接口 ====================

    /** CRM 后台查询开卡支付单快照（不含手机号/姓名，CRM 自己已有会员档案）。 */
    public Map<String, Object> crmOrder(String orderSn) {
        MemberCardOrder order = findOrder(orderSn);
        if (order == null) {
            throw new BusinessException("开卡订单不存在", 404);
        }
        return crmOrderView(order);
    }

    private Map<String, Object> crmOrderView(MemberCardOrder order) {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("orderSn", order.getOrderSn());
        result.put("customerId", order.getCustomerId());
        result.put("productCode", order.getProductCode());
        result.put("productName", productName(order.getProductCode()));
        result.put("paidCents", order.getPaidCents() == null ? cents(order.getAmount()) : order.getPaidCents());
        result.put("state", order.getState());
        result.put("stateText", stateText(order.getState()));
        result.put("refundState", order.getRefundState());
        result.put("refundType", order.getRefundType());
        result.put("refundCents", order.getRefundCents());
        result.put("crmCardId", order.getCrmCardId());
        result.put("crmRefunded", order.getCrmRefunded());
        result.put("payError", order.getPayError());
        result.put("refundable", order.getState() != null
                && order.getState() == MemberCardOrder.STATE_PAID
                && !REFUND_SUCCESS.equals(order.getRefundState()));
        result.put("createTime", formatTime(order.getCreateTime()));
        result.put("payTime", formatTime(order.getPayTime()));
        result.put("refundTime", formatTime(order.getRefundTime()));
        return result;
    }

    private static String formatTime(LocalDateTime value) {
        return value == null ? null : value.format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));
    }

    /**
     * CRM 发起的退款。
     *
     * <p>规则退款（WITHIN_7D / AFTER_7D / PRORATED）仍以 CRM 试算为准，直接复用线上退款主流程，
     * 并校验实际退款金额与 CRM 传入金额一致；协商退款（NEGOTIATED）由 CRM 指定金额，
     * 先真实退款再落库，重复请求按同金额幂等重放。</p>
     *
     * <p>无论哪种方式，退款成功后 CRM 侧负责把卡置为已退款；本接口不再回调 CRM。</p>
     */
    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> crmRefund(String orderSn, Integer refundCents, String refundType,
                                         String reason, String operatorName) {
        MemberCardOrder found = findOrder(orderSn);
        if (found == null) {
            throw new BusinessException("开卡订单不存在", 404);
        }
        String type = refundType == null ? "" : refundType.trim().toUpperCase();
        String note = hasText(reason) ? reason.trim() : "CRM 后台退款";
        String operator = hasText(operatorName) ? operatorName.trim() : "CRM";
        if (operator.length() > 32) {
            operator = operator.substring(0, 32);
        }

        if ("NEGOTIATED".equals(type)) {
            return crmNegotiatedRefund(found.getOrderSn(), refundCents, note, operator);
        }
        if (!REFUND_WITHIN_7D.equals(type) && !REFUND_AFTER_7D.equals(type) && !REFUND_PRORATED.equals(type)) {
            throw new BusinessException("不支持的退款类型", 400);
        }
        // 先按同一套规则复算，金额不一致在动钱之前就拒绝（退款一旦提交无法回滚）
        MemberCardOrder current = findOrder(found.getOrderSn());
        Map<String, Object> preview = buildRefundPreview(current);
        int expected = preview.get("refundCents") instanceof Integer ? (Integer) preview.get("refundCents") : 0;
        if (!Boolean.TRUE.equals(preview.get("allowed")) || expected <= 0) {
            throw new BusinessException(String.valueOf(preview.get("policy")), 409);
        }
        if (refundCents != null && refundCents > 0 && refundCents != expected) {
            log.error("CRM 退款金额与轻疗复算不一致, orderSn={}, crm={}, local={}",
                    orderSn, refundCents, expected);
            throw new BusinessException("退款金额与 CRM 不一致，请刷新后重试", 409);
        }
        Map<String, Object> result = refundInternal(null, found.getOrderSn(), note, false, null, true);
        Object actual = result.get("refundCents");
        int actualCents = actual instanceof Integer ? (Integer) actual : 0;
        if (actualCents != expected) {
            // 钱已按 actualCents 原路退回，不能回滚数据库；如实告诉 CRM 实际金额并标记需核对
            log.error("CRM 退款实际金额与试算不一致, orderSn={}, expected={}, actual={}",
                    orderSn, expected, actualCents);
            result.put("amountMismatch", true);
        }
        result.put("crmRefunded", true);
        return result;
    }

    private Map<String, Object> crmNegotiatedRefund(String orderSn, Integer refundCents,
                                                    String reason, String operator) {
        MemberCardOrder order = lockOrder(orderSn);
        if (order == null) {
            throw new BusinessException("开卡订单不存在", 404);
        }
        int cents = refundCents == null ? 0 : refundCents;
        if (order.getState() != null && order.getState() == MemberCardOrder.STATE_REFUNDED) {
            int refunded = order.getRefundCents() == null ? 0 : order.getRefundCents();
            if (refunded == cents) {
                Map<String, Object> replay = crmOrderView(order);
                replay.put("replayed", true);
                return replay;
            }
            throw new BusinessException("该订单已按 ¥" + centsToYuan(refunded).toPlainString()
                    + " 退款，不能改为其他金额", 409);
        }
        if (order.getState() == null || order.getState() != MemberCardOrder.STATE_PAID) {
            throw new BusinessException("该订单当前不可退款", 409);
        }
        int paid = order.getPaidCents() == null ? cents(order.getAmount()) : order.getPaidCents();
        if (cents <= 0) {
            throw new BusinessException("协商退款金额必须大于 0", 400);
        }
        if (cents > paid) {
            throw new BusinessException("协商退款金额不能超过实付金额", 400);
        }
        String refundHfSeqId;
        if (!memberCardService.isTestMode()) {
            if (!hasText(order.getMerOrdId())) {
                throw new BusinessException("缺少支付流水，不能自动退款，请联系工作人员", 409);
            }
            Order refundOrder = new Order();
            refundOrder.setId(order.getId());
            refundOrder.setCode(order.getOrderSn());
            refundOrder.setMerOrdId(order.getMerOrdId());
            refundOrder.setHfSeqId(order.getHfSeqId());
            refundOrder.setPayTime(order.getPayTime());
            refundOrder.setPayAmount(order.getAmount());
            refundOrder.setHasRefundAmount(BigDecimal.ZERO);
            refundOrder.setState(OrderState.PAID_NOT_COMMENT.getValue());
            refundOrder.setRefundState(0);
            try {
                refundHfSeqId = payService.refundPay(refundOrder, centsToYuan(cents));
            } catch (RuntimeException e) {
                log.error("品牌会员卡协商退款（汇付）失败, orderSn={}, error={}", orderSn, e.getMessage());
                throw new BusinessException("退款通道处理失败，请稍后重试或联系工作人员", 503);
            }
            if (!hasText(refundHfSeqId)) {
                throw new BusinessException("退款通道处理失败，请稍后重试或联系工作人员", 503);
            }
        } else {
            refundHfSeqId = "MOCK-REFUND-" + System.currentTimeMillis();
        }

        LocalDateTime now = LocalDateTime.now();
        order.setState(MemberCardOrder.STATE_REFUNDED);
        order.setRefundType("NEGOTIATED");
        order.setRefundCents(cents);
        order.setRefundAmount(centsToYuan(cents));
        order.setRefundTime(now);
        order.setRefundReason("CRM 协商退款 · " + operator + (hasText(reason) ? " · " + reason : ""));
        order.setRefundOperatorId(null);
        // CRM 已知道并会自行落卡状态，这里直接标记已同步，避免定时任务重复撤销
        order.setRefundState(REFUND_SUCCESS);
        order.setCrmRefunded(1);
        order.setRefundHfSeqId(refundHfSeqId);
        if (orderMapper.updateById(order) != 1) {
            throw new BusinessException("退款单更新失败");
        }
        if (order.getCardId() != null) {
            CustomerMemberCard card = memberCardService.getById(order.getCardId());
            if (card != null) {
                card.setStatus(CustomerMemberCard.STATUS_REFUNDED);
                card.setRefundAmount(centsToYuan(cents));
                card.setRefundTime(now);
                card.setRefundReason(order.getRefundReason());
                card.setRemark("CRM 协商退款");
                memberCardService.updateById(card);
            }
        }
        Map<String, Object> result = crmOrderView(order);
        result.put("crmRefunded", true);
        return result;
    }

    /**
     * CRM 发起的补偿重试：SETTLE = 已支付但开卡失败重试开卡；CRM_REFUND = CRM 撤销失败重试。
     * 两个动作本身幂等，重复调用不会重复开卡或重复退款。
     */
    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> crmRetry(String orderSn, String kind) {
        MemberCardOrder order = findOrder(orderSn);
        if (order == null) {
            throw new BusinessException("开卡订单不存在", 404);
        }
        String action = kind == null ? "" : kind.trim().toUpperCase();
        if ("SETTLE".equals(action)) {
            retrySettle(order.getId());
            return crmOrder(orderSn);
        }
        if ("CRM_REFUND".equals(action)) {
            retryCrmRefund(order.getId());
            return crmOrder(orderSn);
        }
        throw new BusinessException("不支持的重试类型", 400);
    }

    /**
     * CRM 按手机号解锁品牌会员购买。只返回解锁结果，不回显手机号与客户资料。
     */
    public Map<String, Object> crmUnlockByPhone(String phone) {
        String value = phone == null ? "" : phone.trim();
        if (value.isEmpty()) {
            throw new BusinessException("缺少手机号", 400);
        }
        List<Customer> customers = customerService.list(new LambdaQueryWrapper<Customer>()
                .eq(Customer::getPhone, value)
                .last("limit 1"));
        if (CollectionUtils.isEmpty(customers)) {
            throw new BusinessException("未找到该手机号对应的客户", 404);
        }
        Customer customer = customers.get(0);
        boolean wasLocked = customer.getBrandCardLocked() != null && customer.getBrandCardLocked() == 1;
        unlockCustomer(customer.getId());
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("customerId", customer.getId());
        result.put("wasLocked", wasLocked);
        result.put("unlocked", true);
        return result;
    }

    // ==================== 工具 ====================

    private MemberCardOrder findOrder(String orderSn) {
        if (orderSn == null || orderSn.isEmpty()) {
            return null;
        }
        return orderMapper.selectOne(new LambdaQueryWrapper<MemberCardOrder>()
                .eq(MemberCardOrder::getOrderSn, baseOrderSn(orderSn)));
    }

    private MemberCardOrder lockOrder(String orderSn) {
        if (orderSn == null || orderSn.isEmpty()) {
            return null;
        }
        return orderMapper.selectOne(new LambdaQueryWrapper<MemberCardOrder>()
                .eq(MemberCardOrder::getOrderSn, baseOrderSn(orderSn))
                .last("FOR UPDATE"));
    }

    private String baseOrderSn(String merOrdId) {
        if (merOrdId == null) {
            return null;
        }
        String value = merOrdId.trim();
        int index = value.lastIndexOf('A');
        if (index > 0 && value.length() - index == 4) {
            return value.substring(0, index);
        }
        return value;
    }

    private int usedBenefitCents(Long cardId) {
        QueryWrapper<Order> query = new QueryWrapper<>();
        query.select("IFNULL(SUM(benefit_amount),0) AS benefit");
        query.eq("member_card_id", cardId);
        query.in("state", OrderState.PAID_NOT_COMMENT.getValue(), OrderState.PAID_COMMENTED.getValue());
        List<Map<String, Object>> rows = mallOrderMapper.selectMaps(query);
        if (CollectionUtils.isEmpty(rows) || rows.get(0) == null) {
            return 0;
        }
        Object value = rows.get(0).get("benefit");
        if (value == null) {
            return 0;
        }
        return new BigDecimal(value.toString()).multiply(BigDecimal.valueOf(100))
                .setScale(0, RoundingMode.HALF_UP).intValue();
    }

    private void markPaidError(MemberCardOrder order, String message) {
        order.setState(MemberCardOrder.STATE_PAID_PENDING);
        recordPayError(order, message);
    }

    private void recordPayError(MemberCardOrder order, String message) {
        order.setPayError(message == null ? "开卡失败" : message.substring(0, Math.min(255, message.length())));
        orderMapper.updateById(order);
    }

    private void applyProfile(MemberCardOrder order, Map<String, Object> form) {
        String contactName = stringValue(form.get("contactName"));
        if (contactName != null) {
            order.setContactName(contactName);
        }
        String gender = stringValue(form.get("contactGender"));
        if ("1".equals(gender) || "2".equals(gender)) {
            order.setContactGender(Integer.valueOf(gender));
        }
        String wechat = stringValue(form.get("contactWechat"));
        if (wechat != null) {
            order.setContactWechat(wechat);
        }
        String birthday = stringValue(form.get("contactBirthday"));
        if (birthday != null) {
            LocalDate date = parseDate(birthday);
            if (date != null) {
                order.setContactBirthday(date);
            }
        }
        String joinGroup = stringValue(form.get("joinGroup"));
        order.setJoinGroup("0".equals(joinGroup) ? 0 : 1);
    }

    private String normalizeProductCode(String code) {
        if (code == null) {
            return null;
        }
        String value = code.trim().toUpperCase();
        if (PRODUCT_MONTH.equals(value) || "MONTH".equals(value) || "MONTHLY".equals(value)) {
            return PRODUCT_MONTH;
        }
        if (PRODUCT_ANNUAL.equals(value) || "YEAR".equals(value) || "ANNUAL".equals(value)) {
            return PRODUCT_ANNUAL;
        }
        return null;
    }

    private String productName(String productCode) {
        return PRODUCT_MONTH.equals(productCode) ? "Full愈月卡" : "Full愈年卡";
    }

    private String stateText(Integer state) {
        if (state == null) {
            return "";
        }
        switch (state) {
            case MemberCardOrder.STATE_UNPAID:
                return "待支付";
            case MemberCardOrder.STATE_PAID:
                return "已支付";
            case MemberCardOrder.STATE_CLOSED:
                return "已关闭";
            case MemberCardOrder.STATE_REFUNDED:
                return "已退款";
            case MemberCardOrder.STATE_PAID_PENDING:
                return "已支付待开卡";
            default:
                return "";
        }
    }

    private BigDecimal centsToYuan(int cents) {
        return BigDecimal.valueOf(cents).divide(BigDecimal.valueOf(100), 2, RoundingMode.HALF_UP);
    }

    private int cents(BigDecimal amount) {
        if (amount == null) {
            return 0;
        }
        return amount.multiply(BigDecimal.valueOf(100)).setScale(0, RoundingMode.HALF_UP).intValue();
    }

    private String stringValue(Object value) {
        if (value == null) {
            return null;
        }
        String text = value.toString().trim();
        return text.isEmpty() ? null : text;
    }

    private int parseInt(Object value, int defaultValue) {
        try {
            return value == null ? defaultValue : Integer.parseInt(value.toString().trim());
        } catch (NumberFormatException e) {
            return defaultValue;
        }
    }

    private LocalDate parseDate(String text) {
        if (text == null || text.trim().length() < 10) {
            return null;
        }
        try {
            return LocalDate.parse(text.trim().substring(0, 10));
        } catch (Exception e) {
            return null;
        }
    }

    private LocalDateTime parseDateTime(String text, boolean endOfDay) {
        if (text == null || text.trim().isEmpty()) {
            return null;
        }
        try {
            String value = text.trim().replace(' ', 'T');
            if (value.length() == 10) {
                LocalDate date = LocalDate.parse(value);
                return endOfDay ? date.atTime(23, 59, 59) : date.atStartOfDay();
            }
            return LocalDateTime.parse(value);
        } catch (Exception e) {
            return null;
        }
    }
}
