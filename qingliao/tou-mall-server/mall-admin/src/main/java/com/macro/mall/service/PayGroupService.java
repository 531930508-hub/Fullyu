package com.macro.mall.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.macro.mall.common.exception.BusinessException;
import com.macro.mall.entity.MemberCardOrder;
import com.macro.mall.entity.Order;
import com.macro.mall.entity.PayGroup;
import com.macro.mall.enums.OrderState;
import com.macro.mall.mapper.MemberCardOrderMapper;
import com.macro.mall.mapper.PayGroupMapper;
import com.macro.mall.pay.PayChannel;
import com.macro.mall.pay.PayService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import javax.annotation.Resource;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ThreadLocalRandom;

/**
 * 合并支付（预约单 + 会员卡续费）：一次微信收款，回调后按分单台账各归各的单，并落分账台账。
 *
 * <p>为什么需要：门店单次消费 3.5 折、品牌会员年卡 8 折，折后单价几乎是全站最低。
 * 但两笔钱属于不同结算主体（门店 / 品牌会员运营主体），如果拆成两次支付，用户要连弹两次
 * 微信支付框，体验差且容易只付一半。这里先合并收款，再在结算时按订单金额分账到门店。</p>
 *
 * <p>金额口径：预约单金额 = 订单折后应付（pay_amount，已扣积分 / 券），会员卡金额 = CRM 报价，
 * 总额 = 两者之和，由汇付按合并单号收一笔。</p>
 *
 * @date 2026/12/01
 */
@Slf4j
@Service
public class PayGroupService {

    /** 合并支付单号前缀，回调侧靠它分流，不能与订单号（S 开头）/ 卡单号（C 开头）冲突。 */
    private static final String PAY_NO_PREFIX = "G";
    private static final DateTimeFormatter PAY_NO_FORMAT = DateTimeFormatter.ofPattern("yyMMddHHmmss");
    /** 超过 30 分钟的未支付合并单视为失效，避免用户拿旧支付参数付款。 */
    private static final int EXPIRE_MINUTES = 30;

    @Resource
    private PayGroupMapper payGroupMapper;

    @Resource
    private OrderService orderService;

    @Resource
    private BrandCardPaymentService brandCardPaymentService;

    @Resource
    private PayService payService;

    /** 合并单超时关闭时，顺带关掉同一笔里的未支付开卡单，避免留下孤儿卡单。 */
    @Resource
    private MemberCardOrderMapper memberCardOrderMapper;

    /** 门店分账开关：分账通道未开通时只记台账，不调分账接口。 */
    @Value("${fullyu.pay-group.split-enabled:false}")
    private boolean splitEnabled;

    // ==================== 查询 ====================

    public PayGroup getByPayNo(String payNo) {
        if (payNo == null || payNo.isEmpty() || !payNo.startsWith(PAY_NO_PREFIX)) {
            return null;
        }
        return payGroupMapper.selectOne(new LambdaQueryWrapper<PayGroup>()
                .eq(PayGroup::getPayNo, payNo));
    }

    /** 回调侧分流：G 开头且库里确有这张合并支付单（避免和普通订单撞号）。 */
    public boolean isGroupPaySn(String sn) {
        if (sn == null || !sn.startsWith(PAY_NO_PREFIX)) {
            return false;
        }
        return getByPayNo(sn) != null;
    }

    public PayGroup getById(Long id) {
        return id == null ? null : payGroupMapper.selectById(id);
    }

    public PayGroup getByCardOrderSn(String cardOrderSn) {
        if (cardOrderSn == null || cardOrderSn.isEmpty()) {
            return null;
        }
        return payGroupMapper.selectOne(new LambdaQueryWrapper<PayGroup>()
                .eq(PayGroup::getCardOrderSn, cardOrderSn)
                .orderByDesc(PayGroup::getId)
                .last("limit 1"));
    }

    /** 小程序轮询 / 结果页落库用：返回合并单支付状态与对应订单 id。 */
    public Map<String, Object> state(Long customerId, String payNo) {
        PayGroup group = getByPayNo(payNo);
        if (group == null || !group.getCustomerId().equals(customerId)) {
            throw new BusinessException("支付单不存在", 404);
        }
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("payNo", group.getPayNo());
        result.put("state", group.getState());
        result.put("paid", group.getState() != null && group.getState() == PayGroup.STATE_PAID);
        result.put("orderId", group.getOrderId());
        result.put("cardOrderSn", group.getCardOrderSn());
        result.put("totalAmount", group.getTotalAmount());
        result.put("orderAmount", group.getOrderAmount());
        result.put("cardAmount", group.getCardAmount());
        if (group.getCardOrderSn() != null) {
            Map<String, Object> card = brandCardPaymentService.orderStatus(customerId, group.getCardOrderSn());
            result.put("cardPaid", isCardStatePaid(card.get("state")));
        }
        return result;
    }

    private static boolean isCardStatePaid(Object state) {
        return state != null && Integer.parseInt(String.valueOf(state)) == MemberCardOrder.STATE_PAID;
    }

    // ==================== 下单 ====================

    /**
     * 创建合并支付：一张合并单 + 一张未支付的会员卡单（可选），发起一笔微信支付。
     *
     * <p>参数：orderId 必填；renewYear=true 时一并续年卡；openId 真实支付必填。</p>
     *
     * <p>订单已被券 / 积分结清时，renewYear=true 仍然可以建单，此时订单部分金额记 0，
     * 只向微信收会员卡费（券和积分都不能抵扣卡费）。</p>
     */
    public Map<String, Object> createMergePay(Long customerId, Map<String, Object> form) {
        if (customerId == null) {
            throw new BusinessException("请先登录", 401);
        }
        Map<String, Object> params = form == null ? new HashMap<>() : form;
        Long orderId = longValue(params.get("orderId"));
        if (orderId == null) {
            throw new BusinessException("请先选择要支付的订单");
        }
        Order order = orderService.getById(orderId);
        if (order == null || !customerId.equals(order.getCustomerId())) {
            throw new BusinessException("订单不存在", 404);
        }
        boolean renewYear = Boolean.parseBoolean(String.valueOf(params.getOrDefault("renewYear", "false")));
        BigDecimal orderAmount = order.getPayAmount() == null ? BigDecimal.ZERO : order.getPayAmount();
        boolean orderUnpaid = OrderState.NOT_PAY.getValue().equals(order.getState());
        boolean cardOnly = false;
        if (!orderUnpaid) {
            // 订单已被券 / 积分在别处结清：会员卡是现金商品，券和积分都不能抵卡费，
            // 所以这里允许再建一张「只收卡费」的合并单（订单部分金额记 0，不再结算订单）。
            boolean orderSettled = OrderState.PAID_NOT_COMMENT.getValue().equals(order.getState())
                    || OrderState.PAID_COMMENTED.getValue().equals(order.getState());
            if (!renewYear || !orderSettled) {
                throw new BusinessException("订单状态已变化，请刷新后重试");
            }
            cardOnly = true;
            orderAmount = BigDecimal.ZERO;
        }
        if (!renewYear && orderAmount.compareTo(new BigDecimal("0.01")) < 0) {
            throw new BusinessException("订单无需支付");
        }

        // 同一订单只保留一张有效合并单：旧单直接关闭，防止用户拿旧参数付款后回调错账
        closeUnpaidGroups(orderId);

        MemberCardOrder cardOrder = null;
        BigDecimal cardAmount = BigDecimal.ZERO;
        if (renewYear) {
            Map<String, Object> cardForm = new HashMap<>(params);
            // 合并支付页已勾选条款，这里视为同意；产品编码沿用年卡
            cardForm.put("agreeTerms", "true");
            cardForm.put("productCode", "FY_ANNUAL");
            cardOrder = brandCardPaymentService.createPendingOrder(customerId, cardForm, false);
            cardAmount = cardOrder.getAmount() == null ? BigDecimal.ZERO : cardOrder.getAmount();
        }
        BigDecimal total = orderAmount.add(cardAmount).setScale(2, RoundingMode.HALF_UP);
        if (total.compareTo(new BigDecimal("0.01")) < 0) {
            throw new BusinessException("订单无需支付");
        }

        PayGroup group = new PayGroup();
        group.setPayNo(PAY_NO_PREFIX + LocalDateTime.now().format(PAY_NO_FORMAT)
                + String.format("%06d", ThreadLocalRandom.current().nextInt(1000000)));
        group.setCustomerId(customerId);
        group.setOrderId(order.getId());
        group.setOrderCode(order.getCode());
        group.setCardOrderSn(cardOrder == null ? null : cardOrder.getOrderSn());
        group.setOrderAmount(orderAmount.setScale(2, RoundingMode.HALF_UP));
        group.setCardAmount(cardAmount.setScale(2, RoundingMode.HALF_UP));
        group.setTotalAmount(total);
        group.setState(PayGroup.STATE_UNPAID);
        group.setSplitAmount(orderAmount.setScale(2, RoundingMode.HALF_UP));
        group.setSplitState(splitEnabled && orderAmount.compareTo(BigDecimal.ZERO) > 0
                ? PayGroup.SPLIT_PENDING : PayGroup.SPLIT_NONE);
        if (payGroupMapper.insert(group) != 1) {
            throw new BusinessException("支付单保存失败");
        }

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("payNo", group.getPayNo());
        result.put("orderId", order.getId());
        result.put("cardOrderSn", group.getCardOrderSn());
        result.put("orderAmount", group.getOrderAmount());
        result.put("cardAmount", group.getCardAmount());
        result.put("totalAmount", group.getTotalAmount());
        // cardOnly=true：订单已由券/积分结清，本笔只收会员卡费
        result.put("cardOnly", cardOnly);
        result.put("expireAt", LocalDateTime.now().plusMinutes(EXPIRE_MINUTES).format(
                DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss")));

        // 测试环境不发起真实支付，直接给模拟支付入口
        if (brandCardPaymentServiceTestMode()) {
            result.put("testMode", true);
            return result;
        }

        String openId = stringValue(params.get("openId"));
        if (openId == null) {
            throw new BusinessException("微信支付参数缺失，请重试");
        }
        Order payOrder = new Order();
        payOrder.setId(group.getId());
        payOrder.setCode(group.getPayNo());
        payOrder.setPayAmount(total);
        payOrder.setPayType(1);
        payOrder.setPayChannel(PayChannel.WX_MINI);
        payOrder.setProductTitle(cardOnly ? "Full愈·会员卡续费" : "Full愈·门店消费+会员卡");
        String title = cardOnly ? "Full愈·会员卡续费" : "Full愈·门店消费+会员卡";
        Map<String, String> payResult;
        try {
            // shopId 为空走品牌主体商户号（sysId1），合并款先统一收到品牌主体，再按台账分账到门店
            payResult = payService.generatePay(payOrder, openId, title);
        } catch (RuntimeException e) {
            log.warn("合并支付发起失败, payNo={}, error={}", group.getPayNo(), e.getMessage());
            throw new BusinessException("发起微信支付失败，请稍后重试");
        }
        String merOrdId = payResult.get("orderSn");
        group.setMerOrdId(merOrdId);
        group.setUpdateTime(LocalDateTime.now());
        payGroupMapper.updateById(group);
        // 预约单也记上合并流水，后台退款才能按原支付流水发起；
        // 仅卡费单里订单不是本笔收的，不能覆盖订单已有的支付流水
        if (!cardOnly) {
            order.setMerOrdId(merOrdId);
            orderService.updateById(order);
        }

        result.put("testMode", false);
        result.put("payParams", payResult.get("payParams"));
        result.put("merOrdId", merOrdId);
        return result;
    }

    /** 历史未支付合并单关闭（被新单替代）。 */
    private void closeUnpaidGroups(Long orderId) {
        // 顺带记下旧单的卡单号：用户取消支付后重新下单时，旧卡单也要关掉，
        // 否则会留下一串没人付的待支付卡单
        List<PayGroup> stale = payGroupMapper.selectList(new LambdaQueryWrapper<PayGroup>()
                .select(PayGroup::getId, PayGroup::getCardOrderSn)
                .eq(PayGroup::getOrderId, orderId)
                .eq(PayGroup::getState, PayGroup.STATE_UNPAID));
        payGroupMapper.update(null, new LambdaUpdateWrapper<PayGroup>()
                .eq(PayGroup::getOrderId, orderId)
                .eq(PayGroup::getState, PayGroup.STATE_UNPAID)
                .set(PayGroup::getState, PayGroup.STATE_CLOSED)
                .set(PayGroup::getUpdateTime, LocalDateTime.now()));
        for (PayGroup old : stale) {
            if (old.getCardOrderSn() != null) {
                memberCardOrderMapper.update(null, new LambdaUpdateWrapper<MemberCardOrder>()
                        .eq(MemberCardOrder::getOrderSn, old.getCardOrderSn())
                        .eq(MemberCardOrder::getState, MemberCardOrder.STATE_UNPAID)
                        .set(MemberCardOrder::getState, MemberCardOrder.STATE_CLOSED)
                        .set(MemberCardOrder::getUpdateTime, LocalDateTime.now()));
            }
        }
    }

    // ==================== 支付回调结算 ====================

    /**
     * 汇付回调：一笔合并收款按台账拆成两张单，任一张结算失败整笔回滚交给汇付重试。
     *
     * @param transAmount 实收金额（元），必须等于合并单总额
     */
    public void handlePaySuccess(String payNo, String merOrdId, BigDecimal transAmount, String hfSeqId,
                                 String partyOrderId, String outTransId, String payChannel) {
        PayGroup group = getByPayNo(payNo);
        if (group == null) {
            log.error("合并支付回调找不到支付单, payNo={}", payNo);
            return;
        }
        synchronized (("payGroup:" + payNo).intern()) {
            group = getByPayNo(payNo);
            if (group.getState() != null && group.getState() == PayGroup.STATE_PAID) {
                return;
            }
            BigDecimal total = group.getTotalAmount() == null ? BigDecimal.ZERO : group.getTotalAmount();
            if (transAmount == null || transAmount.compareTo(total) != 0) {
                // 金额不符不动订单，交给汇付重试 + 人工核对
                log.error("合并支付金额不符, payNo={}, 应_收={}, 实收={}", payNo, total, transAmount);
                throw new BusinessException("合并支付金额与支付单不一致");
            }
            // 防重复：订单 / 卡单可能已经用别的流水付过（用户先在别处付了一笔），钱收到了但不能再结算。
            // 但也可能是本笔合并收款上一轮回调只结算了一半（汇付重试），用 mer_ord_id 区分这两种情况。
            // orderAmount=0 有两种合法形态：① 积分在预约时已扣完的 0 元订单（订单仍是待支付，需要结算）；
            // ② 仅卡费单（订单已被券/积分结清，本笔只收卡费，订单不再结算）。
            BigDecimal groupOrderAmount = group.getOrderAmount() == null ? BigDecimal.ZERO : group.getOrderAmount();
            Order order = orderService.getById(group.getOrderId());
            if (order == null) {
                if (groupOrderAmount.compareTo(BigDecimal.ZERO) > 0) {
                    log.error("合并支付找不到预约单, payNo={}, orderId={}", payNo, group.getOrderId());
                    return;
                }
            } else {
                boolean orderSettledByGroup = merOrdId != null && merOrdId.equals(order.getMerOrdId());
                boolean orderPending = OrderState.NOT_PAY.getValue().equals(order.getState());
                if (orderSettledByGroup) {
                    // 上一轮回调已结算过订单部分，这里跳过（卡单部分继续往下按 mer_ord_id 幂等）
                } else if (orderPending) {
                    // 预约单部分：沿用原有结算逻辑（积分 / 券扣减、分单拆分、通知都在里面）
                    Map<String, Object> orderData = new HashMap<>();
                    orderData.put("mchOrderNo", group.getOrderCode());
                    orderData.put("amount", String.valueOf(toCents(group.getOrderAmount())));
                    orderData.put("amountChecked", Boolean.TRUE);
                    orderData.put("merOrdId", merOrdId);
                    orderData.put("hfSeqId", hfSeqId);
                    orderData.put("partyOrderId", partyOrderId);
                    orderData.put("outTransId", outTransId);
                    orderData.put("payChannel", payChannel);
                    orderData.put("payType", 1);
                    orderService.handlePaySuccess(orderData);
                } else if (groupOrderAmount.compareTo(BigDecimal.ZERO) > 0) {
                    markDuplicatePaid(group, "预约单已由其他支付结算，合并款需人工退款");
                    return;
                } else {
                    // 仅卡费单：订单在券/积分环节已经结清，本笔只负责开卡
                    log.info("仅卡费合并单结算, payNo={}, orderId={}, state={}", payNo, order.getId(),
                            order.getState());
                }
            }

            // 会员卡部分：按卡单金额开卡（CRM 失败会抛异常让汇付重试，已结算的部分靠 mer_ord_id 幂等跳过）
            String partException = null;
            if (group.getCardOrderSn() != null) {
                boolean cardSettledByGroup = merOrdId != null
                        && merOrdId.equals(brandCardPaymentService.cardMerOrdId(group.getCardOrderSn()));
                if (!cardSettledByGroup) {
                    Map<String, Object> card = brandCardPaymentService.orderStatus(
                            group.getCustomerId(), group.getCardOrderSn());
                    if (isCardStatePaid(card.get("state"))) {
                        // 卡单已单独付过：卡这部分钱是重复收款，只记台账等财务退款，不能重复开卡
                        partException = "会员卡部分重复收款，需退还 " + group.getCardAmount() + " 元";
                        log.error("合并支付会员卡部分重复收款, payNo={}, cardOrderSn={}, 需退还 {} 元", payNo,
                                group.getCardOrderSn(), group.getCardAmount());
                    } else {
                        brandCardPaymentService.handleGroupPayCallback(group.getCardOrderSn(), merOrdId,
                                group.getCardAmount(), hfSeqId, partyOrderId, outTransId, 1, payChannel);
                    }
                }
            }

            group.setState(PayGroup.STATE_PAID);
            group.setMerOrdId(merOrdId);
            group.setHfSeqId(hfSeqId);
            group.setPartyOrderId(partyOrderId);
            group.setOutTransId(outTransId);
            group.setPayChannel(payChannel);
            group.setPaidTime(LocalDateTime.now());
            group.setUpdateTime(LocalDateTime.now());
            if (partException != null) {
                group.setSplitState(PayGroup.SPLIT_FAILED);
                group.setSplitError(partException);
            }
            payGroupMapper.updateById(group);
            log.info("合并支付结算完成, payNo={}, 订单={}, 卡单={}, 总额={}", payNo, group.getOrderCode(),
                    group.getCardOrderSn(), group.getTotalAmount());
            // 分账台账：门店该拿的钱在这里落账，具体分账调用由后台/定时任务消费台账
            if (group.getSplitState() != null && group.getSplitState() == PayGroup.SPLIT_PENDING) {
                log.info("合并支付待分账, payNo={}, 门店应分={}", payNo, group.getSplitAmount());
            }
        }
    }

    private void markDuplicatePaid(PayGroup group, String reason) {
        group.setState(PayGroup.STATE_DUPLICATE_PAID);
        group.setSplitState(PayGroup.SPLIT_NONE);
        group.setUpdateTime(LocalDateTime.now());
        payGroupMapper.updateById(group);
        log.error("合并支付重复收款需人工退款, payNo={}, hfSeqId={}, 原因={}", group.getPayNo(),
                group.getHfSeqId(), reason);
    }

    /**
     * 测试环境模拟支付：不调用汇付，直接按台账结算，方便本地/测试库联调。
     */
    public Map<String, Object> mockPay(Long customerId, String payNo) {
        if (!brandCardPaymentServiceTestMode()) {
            throw new BusinessException("当前环境不支持模拟支付", 403);
        }
        PayGroup group = getByPayNo(payNo);
        if (group == null || !group.getCustomerId().equals(customerId)) {
            throw new BusinessException("支付单不存在", 404);
        }
        handlePaySuccess(payNo, group.getMerOrdId(), group.getTotalAmount(), "MOCK" + payNo, null, null,
                PayChannel.WX_MINI);
        return state(customerId, payNo);
    }

    // ==================== 后台对账 ====================

    /** 合并支付台账：按时间倒序翻页，供财务对账（门店分账 / 待退款）。 */
    public Map<String, Object> adminPage(Map<String, Object> params) {
        int pageNum = intValue(params.get("pageNum"), 1);
        int pageSize = Math.min(200, Math.max(1, intValue(params.get("pageSize"), 20)));
        String payNo = stringValue(params.get("payNo"));
        String orderCode = stringValue(params.get("orderCode"));
        Long customerId = longValue(params.get("customerId"));
        Integer state = optionalInt(params.get("state"));
        Integer splitState = optionalInt(params.get("splitState"));
        // 有会员卡才算合并支付；对账时经常只看「预约+年卡」的单
        boolean withCard = "true".equalsIgnoreCase(String.valueOf(params.get("withCard")));
        LocalDateTime startTime = parseTime(params.get("startTime"));
        LocalDateTime endTime = parseTime(params.get("endTime"));
        LambdaQueryWrapper<PayGroup> wrapper = new LambdaQueryWrapper<PayGroup>()
                .like(payNo != null, PayGroup::getPayNo, payNo)
                .like(orderCode != null, PayGroup::getOrderCode, orderCode)
                .eq(customerId != null, PayGroup::getCustomerId, customerId)
                .eq(state != null, PayGroup::getState, state)
                .eq(splitState != null, PayGroup::getSplitState, splitState)
                .gt(withCard, PayGroup::getCardAmount, BigDecimal.ZERO)
                .ge(startTime != null, PayGroup::getCreateTime, startTime)
                .le(endTime != null, PayGroup::getCreateTime, endTime)
                .orderByDesc(PayGroup::getId);
        long total = payGroupMapper.selectCount(wrapper);
        int offset = Math.max(0, (pageNum - 1) * pageSize);
        wrapper.last("limit " + offset + "," + pageSize);
        List<PayGroup> list = payGroupMapper.selectList(wrapper);

        // 汇总只统计命中已支付的数据，避免把未支付/关闭单算进营业额
        List<PayGroup> paidGroups = payGroupMapper.selectList(new LambdaQueryWrapper<PayGroup>()
                .eq(PayGroup::getState, PayGroup.STATE_PAID)
                .gt(withCard, PayGroup::getCardAmount, BigDecimal.ZERO)
                .ge(startTime != null, PayGroup::getCreateTime, startTime)
                .le(endTime != null, PayGroup::getCreateTime, endTime));
        BigDecimal paidTotal = BigDecimal.ZERO;
        BigDecimal orderTotal = BigDecimal.ZERO;
        BigDecimal cardTotal = BigDecimal.ZERO;
        for (PayGroup group : paidGroups) {
            paidTotal = paidTotal.add(nvl(group.getTotalAmount()));
            orderTotal = orderTotal.add(nvl(group.getOrderAmount()));
            cardTotal = cardTotal.add(nvl(group.getCardAmount()));
        }
        Map<String, Object> summary = new LinkedHashMap<>();
        summary.put("paidCount", paidGroups.size());
        summary.put("paidAmount", paidTotal.setScale(2, RoundingMode.HALF_UP));
        summary.put("orderAmount", orderTotal.setScale(2, RoundingMode.HALF_UP));
        summary.put("cardAmount", cardTotal.setScale(2, RoundingMode.HALF_UP));
        summary.put("duplicatePaidCount", payGroupMapper.selectCount(new LambdaQueryWrapper<PayGroup>()
                .eq(PayGroup::getState, PayGroup.STATE_DUPLICATE_PAID)
                .ge(startTime != null, PayGroup::getCreateTime, startTime)
                .le(endTime != null, PayGroup::getCreateTime, endTime)));
        summary.put("splitPendingCount", payGroupMapper.selectCount(new LambdaQueryWrapper<PayGroup>()
                .eq(PayGroup::getState, PayGroup.STATE_PAID)
                .eq(PayGroup::getSplitState, PayGroup.SPLIT_PENDING)
                .ge(startTime != null, PayGroup::getCreateTime, startTime)
                .le(endTime != null, PayGroup::getCreateTime, endTime)));
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("list", list);
        result.put("total", total);
        result.put("pageNum", pageNum);
        result.put("pageSize", pageSize);
        result.put("summary", summary);
        return result;
    }

    /**
     * 财务手工确认门店分账完成（分账通道未开通/线下走账时使用）。
     *
     * <p>只标记台账，不动订单和卡单——钱已经在合并回调里结算过了。</p>
     */
    public void confirmSplit(Long id, String splitPayNo, String operator) {
        if (id == null) {
            throw new BusinessException("缺少台账 id");
        }
        PayGroup group = payGroupMapper.selectById(id);
        if (group == null) {
            throw new BusinessException("支付单不存在", 404);
        }
        if (group.getState() == null || group.getState() != PayGroup.STATE_PAID) {
            throw new BusinessException("只有已支付的合并单才能确认分账");
        }
        if (group.getSplitState() != null && group.getSplitState() == PayGroup.SPLIT_SUCCESS) {
            throw new BusinessException("该笔分账已确认，请勿重复操作");
        }
        payGroupMapper.update(null, new LambdaUpdateWrapper<PayGroup>()
                .eq(PayGroup::getId, id)
                .ne(PayGroup::getSplitState, PayGroup.SPLIT_SUCCESS)
                .set(PayGroup::getSplitState, PayGroup.SPLIT_SUCCESS)
                .set(PayGroup::getSplitTime, LocalDateTime.now())
                .set(splitPayNo != null, PayGroup::getSplitPayNo, splitPayNo)
                .set(PayGroup::getSplitError, null)
                .set(PayGroup::getUpdateTime, LocalDateTime.now()));
        log.info("合并支付分账手工确认, payNo={}, 门店应分={}, 操作人={}", group.getPayNo(),
                group.getSplitAmount(), operator);
    }

    private static BigDecimal nvl(BigDecimal value) {
        return value == null ? BigDecimal.ZERO : value;
    }

    /** 可空数字参数：前端清空筛选会传空串，必须按「不过滤」处理，否则查不到任何数据。 */
    private static Integer optionalInt(Object value) {
        String text = stringValue(value);
        if (text == null) {
            return null;
        }
        try {
            return Integer.valueOf(text.trim());
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private static LocalDateTime parseTime(Object value) {
        String text = stringValue(value);
        if (text == null) {
            return null;
        }
        try {
            if (text.length() == 10) {
                return LocalDate.parse(text).atStartOfDay();
            }
            return LocalDateTime.parse(text.replace(' ', 'T'));
        } catch (Exception e) {
            return null;
        }
    }

    /** 关闭超时未支付的合并单（定时任务调用）。 */
    public int closeExpired() {
        LocalDateTime deadline = LocalDateTime.now().minusMinutes(EXPIRE_MINUTES);
        List<PayGroup> expired = payGroupMapper.selectList(new LambdaQueryWrapper<PayGroup>()
                .select(PayGroup::getId, PayGroup::getCardOrderSn)
                .eq(PayGroup::getState, PayGroup.STATE_UNPAID)
                .lt(PayGroup::getCreateTime, deadline)
                .isNotNull(PayGroup::getCardOrderSn));
        int closed = payGroupMapper.update(null, new LambdaUpdateWrapper<PayGroup>()
                .eq(PayGroup::getState, PayGroup.STATE_UNPAID)
                .lt(PayGroup::getCreateTime, deadline)
                .set(PayGroup::getState, PayGroup.STATE_CLOSED)
                .set(PayGroup::getUpdateTime, LocalDateTime.now()));
        for (PayGroup group : expired) {
            memberCardOrderMapper.update(null, new LambdaUpdateWrapper<MemberCardOrder>()
                    .eq(MemberCardOrder::getOrderSn, group.getCardOrderSn())
                    .eq(MemberCardOrder::getState, MemberCardOrder.STATE_UNPAID)
                    .set(MemberCardOrder::getState, MemberCardOrder.STATE_CLOSED)
                    .set(MemberCardOrder::getUpdateTime, LocalDateTime.now()));
        }
        return closed;
    }

    // ==================== 工具 ====================

    private boolean brandCardPaymentServiceTestMode() {
        return Boolean.parseBoolean(System.getProperty("fullyu.test-mode", "false"))
                || "true".equalsIgnoreCase(System.getenv("FULLYU_TEST_MODE"));
    }

    private static int toCents(BigDecimal yuan) {
        if (yuan == null) {
            return 0;
        }
        return yuan.multiply(BigDecimal.valueOf(100)).setScale(0, RoundingMode.HALF_UP).intValue();
    }

    private static String stringValue(Object value) {
        if (value == null) {
            return null;
        }
        String text = String.valueOf(value).trim();
        return text.isEmpty() ? null : text;
    }

    private static Long longValue(Object value) {
        String text = stringValue(value);
        if (text == null) {
            return null;
        }
        try {
            return Long.parseLong(text);
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private static int intValue(Object value, int defaultValue) {
        String text = stringValue(value);
        if (text == null) {
            return defaultValue;
        }
        try {
            return Integer.parseInt(text);
        } catch (NumberFormatException e) {
            return defaultValue;
        }
    }
}