package com.macro.mall.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.macro.mall.common.exception.BusinessException;
import com.macro.mall.entity.Customer;
import com.macro.mall.entity.CustomerMemberCard;
import com.macro.mall.entity.MemberCardConfig;
import com.macro.mall.entity.MemberCardOrder;
import com.macro.mall.mapper.CustomerMemberCardMapper;
import com.macro.mall.mapper.MemberCardConfigMapper;
import com.macro.mall.mapper.MemberCardOrderMapper;
import com.macro.mall.service.base.BaseService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.CollectionUtils;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Random;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * 会员卡服务（月卡 / 年卡 / 后台自定义发卡）。
 *
 * <p>测试环境通过 JVM 参数 {@code -Dfullyu.test-mode=true} 识别：开卡直接记为已支付并立即生效，
 * 不会调用任何真实支付通道；非测试环境在支付接入前明确拒绝开通，避免产生免费会员卡。</p>
 *
 * <p>会员卡一经开通不退，接口层不再提供退款能力，历史退款数据仅保留展示。</p>
 *
 * @date 2026/11/07
 */
@Service
public class MemberCardService extends BaseService<CustomerMemberCardMapper, CustomerMemberCard> {

    public static final String TYPE_MONTH = "month";
    public static final String TYPE_YEAR = "year";
    public static final String TYPE_CUSTOM = "custom";

    private static final DateTimeFormatter CARD_NO_FORMAT = DateTimeFormatter.ofPattern("yyyyMMddHHmmss");
    private static final Random RANDOM = new Random();

    @Autowired
    private MemberCardConfigMapper configMapper;

    @Autowired
    private CustomerService customerService;

    @Autowired
    private MemberCardOrderMapper orderMapper;

    @Override
    protected QueryWrapper<CustomerMemberCard> buildWrapper(Map<String, Object> params, QueryWrapper<CustomerMemberCard> queryWrapper) {
        queryWrapper.orderByDesc("create_time");
        return queryWrapper;
    }

    /**
     * 当前环境是否处于测试模式。测试模式不允许发起真实支付，会员卡开卡直接生效。
     */
    public boolean isTestMode() {
        return Boolean.parseBoolean(System.getProperty("fullyu.test-mode", "false"))
                || "true".equalsIgnoreCase(System.getenv("FULLYU_TEST_MODE"));
    }

    /**
     * 全部在售产品，按 sort 倒序，推荐产品优先。
     */
    public List<MemberCardConfig> listActiveConfigs() {
        LambdaQueryWrapper<MemberCardConfig> lqw = new LambdaQueryWrapper<>();
        lqw.eq(MemberCardConfig::getStatus, 1);
        lqw.orderByDesc(MemberCardConfig::getSort);
        lqw.orderByDesc(MemberCardConfig::getRecommend);
        lqw.orderByAsc(MemberCardConfig::getId);
        List<MemberCardConfig> list = configMapper.selectList(lqw);
        return CollectionUtils.isEmpty(list) ? defaultConfigs() : list;
    }

    /**
     * 配置表未初始化时的兜底产品，保证小程序不白屏。
     */
    public List<MemberCardConfig> defaultConfigs() {
        List<MemberCardConfig> list = new ArrayList<>();
        list.add(buildDefaultYear());
        list.add(buildDefaultMonth());
        return list;
    }

    private MemberCardConfig buildDefaultYear() {
        MemberCardConfig config = baseDefault(TYPE_YEAR, "Full愈年卡", new BigDecimal("299.00"),
                new BigDecimal("0.7550"), new BigDecimal("0.8500"), 365, 30);
        config.setRecommend(1);
        config.setSort(2);
        return config;
    }

    private MemberCardConfig buildDefaultMonth() {
        MemberCardConfig config = baseDefault(TYPE_MONTH, "Full愈月卡", new BigDecimal("45.00"),
                new BigDecimal("0.9400"), new BigDecimal("0.9700"), 30, 7);
        config.setRecommend(0);
        config.setSort(1);
        return config;
    }

    private MemberCardConfig baseDefault(String cardType, String cardName, BigDecimal price,
                                         BigDecimal advanceRate, BigDecimal sameDayRate,
                                         int validDays, int remindDays) {
        MemberCardConfig config = new MemberCardConfig();
        config.setId(0L);
        config.setCardType(cardType);
        config.setCardName(cardName);
        config.setPrice(price);
        config.setAdvanceRate(advanceRate);
        config.setSameDayRate(sameDayRate);
        config.setValidDays(validDays);
        config.setRenewalRemindDays(remindDays);
        config.setBasePrice(new BigDecimal("396.00"));
        config.setSampleMinutes(60);
        config.setStatus(1);
        config.setPurchaseNotice("有效期内，Full愈轻疗全部项目可用会员价：提前一天及以上预约享会员价，当日预约享当日会员价。会员卡开通后不可退，权益不折现、不转让。");
        config.setBenefitDesc("全业务线会员权益：轻疗项目会员价、在场课程优惠报课与好友免单、时叙每杯茶饮立减。");
        config.setTerms("1. 会员卡为虚拟权益产品，开通即生效，不支持退款、转让或折现。\n"
                + "2. 会员权益仅在有效期内有效，到期未续费自动失效。\n"
                + "3. 会员价不与券包、积分、活动价等其他优惠叠加，同一笔消费按最优价结算。\n"
                + "4. 好友免单、课程优惠等跨品牌权益以对应门店当期规则为准。\n"
                + "5. 如遇不可抗力或门店调整，Full愈保留在法律允许范围内解释与调整权益的权利。");
        return config;
    }

    /**
     * 默认产品：推荐的年卡；配置缺失时返回内置年卡。
     */
    public MemberCardConfig getActiveConfig() {
        List<MemberCardConfig> list = listActiveConfigs();
        for (MemberCardConfig config : list) {
            if (TYPE_YEAR.equals(config.getCardType())) {
                return config;
            }
        }
        return list.isEmpty() ? buildDefaultYear() : list.get(0);
    }

    /**
     * 按产品类型取配置，找不到时回落到内置产品。
     */
    public MemberCardConfig getConfigByType(String cardType) {
        String type = normalizeType(cardType);
        for (MemberCardConfig config : listActiveConfigs()) {
            if (type.equals(normalizeType(config.getCardType()))) {
                return config;
            }
        }
        return TYPE_MONTH.equals(type) ? buildDefaultMonth() : buildDefaultYear();
    }

    private String normalizeType(String cardType) {
        if (cardType == null || cardType.trim().isEmpty()) {
            return TYPE_YEAR;
        }
        String type = cardType.trim().toLowerCase();
        if (TYPE_MONTH.equals(type) || TYPE_YEAR.equals(type) || TYPE_CUSTOM.equals(type)) {
            return type;
        }
        return TYPE_YEAR;
    }

    /**
     * 小程序会员中心首屏配置。
     */
    public Map<String, Object> configView() {
        List<MemberCardConfig> configs = listActiveConfigs();
        MemberCardConfig recommended = getActiveConfig();
        List<Map<String, Object>> products = new ArrayList<>();
        for (MemberCardConfig config : configs) {
            products.add(productView(config));
        }
        Map<String, Object> view = new LinkedHashMap<>();
        view.put("products", products);
        view.put("recommendedType", normalizeType(recommended.getCardType()));
        view.put("defaultType", TYPE_YEAR);
        view.put("benefits", benefitViews());
        view.put("terms", recommended.getTerms());
        view.put("testMode", isTestMode());
        // 兼容旧版小程序字段
        view.put("cardName", recommended.getCardName());
        view.put("price", recommended.getPrice());
        view.put("advanceRate", recommended.getAdvanceRate());
        view.put("sameDayRate", recommended.getSameDayRate());
        view.put("validDays", recommended.getValidDays());
        view.put("renewalRemindDays", recommended.getRenewalRemindDays());
        view.put("purchaseNotice", recommended.getPurchaseNotice());
        view.put("benefitDesc", recommended.getBenefitDesc());
        view.put("advanceDiscountText", discountText(recommended.getAdvanceRate()));
        view.put("sameDayDiscountText", discountText(recommended.getSameDayRate()));
        return view;
    }

    private Map<String, Object> productView(MemberCardConfig config) {
        Map<String, Object> view = new LinkedHashMap<>();
        view.put("id", config.getId());
        view.put("cardType", normalizeType(config.getCardType()));
        view.put("cardName", config.getCardName());
        view.put("price", config.getPrice());
        view.put("advanceRate", config.getAdvanceRate());
        view.put("sameDayRate", config.getSameDayRate());
        view.put("advanceDiscountText", discountText(config.getAdvanceRate()));
        view.put("sameDayDiscountText", discountText(config.getSameDayRate()));
        view.put("validDays", config.getValidDays());
        view.put("renewalRemindDays", config.getRenewalRemindDays());
        view.put("recommend", config.getRecommend() == null ? 0 : config.getRecommend());
        view.put("sort", config.getSort() == null ? 0 : config.getSort());
        view.put("basePrice", config.getBasePrice());
        view.put("sampleMinutes", config.getSampleMinutes());
        view.put("purchaseNotice", config.getPurchaseNotice());
        view.put("benefitDesc", config.getBenefitDesc());
        view.put("payback", paybackView(config));
        return view;
    }

    /**
     * 回本测算：按样例项目原价与会员价计算单次省下多少、来几次回本。
     */
    private Map<String, Object> paybackView(MemberCardConfig config) {
        BigDecimal basePrice = config.getBasePrice() == null ? new BigDecimal("396.00") : config.getBasePrice();
        int minutes = config.getSampleMinutes() == null ? 60 : config.getSampleMinutes();
        BigDecimal rate = config.getAdvanceRate() == null ? BigDecimal.ONE : config.getAdvanceRate();
        BigDecimal price = config.getPrice() == null ? BigDecimal.ZERO : config.getPrice();
        BigDecimal memberPrice = basePrice.multiply(rate).setScale(0, RoundingMode.HALF_UP);
        BigDecimal save = basePrice.subtract(memberPrice);
        int visits;
        if (save.compareTo(BigDecimal.ZERO) > 0 && price.compareTo(BigDecimal.ZERO) > 0) {
            visits = price.divide(save, 0, RoundingMode.CEILING).intValue();
        } else {
            visits = 0;
        }
        Map<String, Object> view = new LinkedHashMap<>();
        view.put("sampleMinutes", minutes);
        view.put("basePrice", basePrice);
        view.put("memberPrice", memberPrice);
        view.put("save", save);
        view.put("visits", visits);
        view.put("text", String.format("以 %d 分钟项目为例，原价 %s 元，会员价 %s 元，单次省 %s 元，来 %d 次即回本",
                minutes, plain(basePrice), plain(memberPrice), plain(save), visits));
        return view;
    }

    private List<Map<String, Object>> benefitViews() {
        List<Map<String, Object>> list = new ArrayList<>();
        list.add(benefit("轻疗 · 所有项目会员价", "有效期内轻疗全部项目按会员价结算，提前预约与当日预约分别享对应折扣。", "spa"));
        list.add(benefit("时叙 · 每杯茶饮立减", "到店购买时叙茶饮，每杯按会员价立减，不限杯数。", "tea"));
        list.add(benefit("在场 · 课程优惠报课", "在场课程按会员优惠价报名，并享好友免单权益。", "course"));
        list.add(benefit("全场通用 · 不与其它优惠叠加", "同一笔消费只按最优会员价结算，不与券包、积分、活动价叠加。", "rule"));
        return list;
    }

    private Map<String, Object> benefit(String title, String desc, String code) {
        Map<String, Object> view = new LinkedHashMap<>();
        view.put("title", title);
        view.put("desc", desc);
        view.put("code", code);
        return view;
    }

    /**
     * 个人中心 / 会员中心所需的完整信息。
     */
    public Map<String, Object> info(Long customerId) {
        MemberCardConfig recommended = getActiveConfig();
        Map<String, Object> view = configView();
        view.put("authorized", customerId != null);

        List<CustomerMemberCard> periods = customerId == null
                ? new ArrayList<>()
                : listByCustomer(customerId);

        LocalDateTime now = LocalDateTime.now();
        CustomerMemberCard current = null;
        CustomerMemberCard pending = null;
        CustomerMemberCard latestExpired = null;
        for (CustomerMemberCard period : periods) {
            if (period.getStatus() != null && period.getStatus() == CustomerMemberCard.STATUS_REFUNDED) {
                continue;
            }
            LocalDateTime start = period.getStartTime();
            LocalDateTime end = period.getEndTime();
            if (start != null && end != null && !now.isBefore(start) && now.isBefore(end)) {
                current = period;
            } else if (start != null && now.isBefore(start)) {
                if (pending == null) {
                    pending = period;
                }
            } else if (end != null && !now.isBefore(end)) {
                if (latestExpired == null) {
                    latestExpired = period;
                }
            }
        }

        MemberCardConfig currentConfig = current == null
                ? recommended
                : getConfigByType(current.getCardType());
        int remindDays = currentConfig.getRenewalRemindDays() == null
                ? 30 : currentConfig.getRenewalRemindDays();

        view.put("hasCard", current != null);
        view.put("state", resolveState(current, pending, latestExpired, remindDays));
        view.put("remainingDays", current == null ? 0 : remainingDays(current.getEndTime(), now));
        view.put("renewalRemindDays", remindDays);
        view.put("renewType", currentConfig.getCardType());
        view.put("renewPrice", currentConfig.getPrice());
        view.put("canRenew", true);
        view.put("current", current == null ? null : cardView(current, now, true));
        view.put("pending", pending == null ? null : cardView(pending, now, false));
        view.put("expired", latestExpired == null ? null : cardView(latestExpired, now, false));
        final CustomerMemberCard activeCard = current;
        view.put("periods", periods.stream().map(item -> cardView(item, now, item == activeCard)).collect(Collectors.toList()));
        return view;
    }

    /**
     * 开通 / 续费会员卡。
     *
     * <p>测试模式：生成开卡支付单（已支付）与权益期，立即生效，不产生真实扣款。
     * 非测试模式：支付通道尚未接入，直接拒绝。</p>
     */
    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> purchase(Long customerId, String cardType, Map<String, Object> params) {
        if (customerId == null) {
            throw new BusinessException("请先登录");
        }
        if (!isTestMode()) {
            throw new BusinessException("会员卡支付通道尚未接入，请到门店开通");
        }
        Map<String, Object> form = params == null ? new HashMap<>() : params;
        String type = normalizeType(cardType != null ? cardType : stringValue(form.get("cardType")));
        if (!Boolean.parseBoolean(String.valueOf(form.getOrDefault("agreeTerms", "false")))) {
            throw new BusinessException("请先阅读并同意会员卡购买条款");
        }
        MemberCardConfig config = getConfigByType(type);
        if (config.getStatus() != null && config.getStatus() == 0) {
            throw new BusinessException("该会员卡暂未开放");
        }
        lockCustomer(customerId);
        LocalDateTime now = LocalDateTime.now();
        List<CustomerMemberCard> periods = lockedPeriods(customerId);
        LocalDateTime startTime = nextPeriodStart(periods, now);
        MemberCardOrder order = new MemberCardOrder();
        order.setOrderSn("MC" + now.format(CARD_NO_FORMAT) + String.format("%04d", RANDOM.nextInt(10000)));
        order.setCustomerId(customerId);
        order.setConfigId(config.getId());
        order.setCardType(type);
        order.setAmount(config.getPrice());
        order.setState(MemberCardOrder.STATE_PAID);
        order.setPayType(99);
        order.setPayTime(now);
        applyProfile(order, form);
        if (orderMapper.insert(order) != 1) throw new BusinessException("开卡订单保存失败");

        CustomerMemberCard card = createCard(customerId, config, startTime, config.getValidDays(),
                config.getPrice(), order.getId(), 1, periods.size() + 1, null);
        card.setRemark("测试环境自动开通，未发生真实支付");
        if (!save(card)) throw new BusinessException("会员权益保存失败");

        order.setCardId(card.getId());
        if (orderMapper.updateById(order) != 1) throw new BusinessException("开卡订单关联失败");

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("orderSn", order.getOrderSn());
        result.put("cardId", card.getId());
        result.put("cardType", type);
        result.put("testMode", true);
        result.put("info", info(customerId));
        return result;
    }

    /**
     * 支付成功后按 CRM 卡期写入本地权益期快照。
     *
     * <p>卡期以 CRM 返回的 validFrom/validUntil 为准，续费时 CRM 已把新卡期排在旧卡之后；
     * 本地只做展示与结算快照，重复回调由调用方按支付单状态拦截。</p>
     */
    @Transactional(rollbackFor = Exception.class)
    public CustomerMemberCard issuePaidCard(Long customerId, String cardType, BigDecimal amount,
                                            Long payOrderId, LocalDate validFrom, LocalDate validUntil,
                                            String productName) {
        if (customerId == null) {
            throw new BusinessException("请先登录");
        }
        lockCustomer(customerId);
        MemberCardConfig config = getConfigByType(cardType);
        List<CustomerMemberCard> periods = lockedPeriods(customerId);
        LocalDateTime start = validFrom == null
                ? nextPeriodStart(periods, LocalDateTime.now())
                : validFrom.atStartOfDay();
        LocalDateTime end = validUntil == null
                ? start.plusDays(config.getValidDays() == null ? 365 : config.getValidDays())
                : validUntil.atTime(23, 59, 59);
        int validDays = (int) Math.max(1, ChronoUnit.DAYS.between(start.toLocalDate(), end.toLocalDate()) + 1);
        CustomerMemberCard card = createCard(customerId, config, start, validDays, amount,
                payOrderId, 1, periods.size() + 1, null);
        card.setEndTime(end);
        card.setValidDays(validDays);
        if (productName != null && !productName.trim().isEmpty()) {
            card.setCardName(productName.trim());
        }
        card.setRemark("小程序支付开通");
        if (!save(card)) {
            throw new BusinessException("会员权益保存失败");
        }
        return card;
    }

    private LocalDateTime nextPeriodStart(List<CustomerMemberCard> periods, LocalDateTime now) {
        LocalDateTime end = now;
        for (CustomerMemberCard period : periods) {
            if ((Integer.valueOf(CustomerMemberCard.STATUS_ACTIVE).equals(period.getStatus())
                    || Integer.valueOf(CustomerMemberCard.STATUS_PENDING).equals(period.getStatus()))
                    && period.getEndTime() != null && period.getEndTime().isAfter(end)) {
                end = period.getEndTime();
            }
        }
        return end;
    }

    /** 同一客户的购买、后台发卡和耗尽赠送使用同一数据库行锁。调用方须处于事务内。 */
    public void lockCustomer(Long customerId) {
        if (customerId == null || customerService.getOne(new LambdaQueryWrapper<Customer>()
                .eq(Customer::getId, customerId).last("FOR UPDATE")) == null) {
            throw new BusinessException("客户不存在");
        }
    }

    @Transactional(rollbackFor = Exception.class)
    public CustomerMemberCard grantPrepaidReward(com.macro.mall.entity.Order source, int months) {
        if (source == null || source.getId() == null || months < 1 || months > 120) {
            throw new BusinessException("赠送会员月数需在1到120之间");
        }
        lockCustomer(source.getCustomerId());
        CustomerMemberCard existing = getOne(new LambdaQueryWrapper<CustomerMemberCard>()
                .eq(CustomerMemberCard::getRewardSourceOrderId, source.getId()));
        if (existing != null) return existing;
        List<CustomerMemberCard> periods = lockedPeriods(source.getCustomerId());
        LocalDateTime begin = nextPeriodStart(periods, LocalDateTime.now());
        LocalDateTime end = begin.plusMonths(months);
        MemberCardConfig config = getConfigByType(TYPE_MONTH);
        CustomerMemberCard card = createCard(source.getCustomerId(), config, begin,
                (int) ChronoUnit.DAYS.between(begin, end), BigDecimal.ZERO, null, 3,
                periods.size() + 1, "PREPAID-" + source.getId());
        card.setEndTime(end);
        card.setRewardSourceOrderId(source.getId());
        card.setRemark("预付券包实际用完赠送" + months + "个月；购买订单#" + source.getId());
        if (!save(card)) throw new BusinessException("赠送会员权益保存失败");
        return card;
    }

    private void applyProfile(MemberCardOrder order, Map<String, Object> form) {
        String contactName = stringValue(form.get("contactName"));
        if (contactName != null && !contactName.trim().isEmpty()) {
            order.setContactName(contactName.trim());
        }
        String gender = stringValue(form.get("contactGender"));
        if ("1".equals(gender) || "2".equals(gender)) {
            order.setContactGender(Integer.valueOf(gender));
        }
        String wechat = stringValue(form.get("contactWechat"));
        if (wechat != null && !wechat.trim().isEmpty()) {
            order.setContactWechat(wechat.trim());
        }
        String birthday = stringValue(form.get("contactBirthday"));
        if (birthday != null && !birthday.trim().isEmpty()) {
            LocalDate date = toDate(birthday);
            if (date != null) {
                order.setContactBirthday(date);
            }
        }
        String joinGroup = stringValue(form.get("joinGroup"));
        order.setJoinGroup("0".equals(joinGroup) ? 0 : 1);
    }

    public List<CustomerMemberCard> listByCustomer(Long customerId) {
        LambdaQueryWrapper<CustomerMemberCard> lqw = new LambdaQueryWrapper<>();
        lqw.eq(CustomerMemberCard::getCustomerId, customerId);
        lqw.orderByAsc(CustomerMemberCard::getStartTime);
        return normalizeStatus(list(lqw));
    }

    /**
     * 写入新时段前的当前读：RR事务的普通读可能沿用加客户锁之前的快照，看不到并发已提交的时段。
     * customer_id有索引，且所有写入方先锁客户行，锁范围只落在该客户的时段上。
     */
    public List<CustomerMemberCard> lockedPeriods(Long customerId) {
        return normalizeStatus(list(new LambdaQueryWrapper<CustomerMemberCard>()
                .eq(CustomerMemberCard::getCustomerId, customerId)
                .orderByAsc(CustomerMemberCard::getStartTime)
                .last("FOR UPDATE")));
    }

    private List<CustomerMemberCard> normalizeStatus(List<CustomerMemberCard> list) {
        LocalDateTime now = LocalDateTime.now();
        list.forEach(item -> {
            if (item.getStatus() != null && item.getStatus() == CustomerMemberCard.STATUS_ACTIVE
                    && item.getEndTime() != null && !now.isBefore(item.getEndTime())) {
                item.setStatus(CustomerMemberCard.STATUS_EXPIRED);
            }
            if (item.getStatus() != null && item.getStatus() == CustomerMemberCard.STATUS_PENDING
                    && item.getStartTime() != null && !now.isBefore(item.getStartTime())) {
                item.setStatus(now.isBefore(item.getEndTime()) ? CustomerMemberCard.STATUS_ACTIVE : CustomerMemberCard.STATUS_EXPIRED);
            }
        });
        return list;
    }

    private String resolveState(CustomerMemberCard current, CustomerMemberCard pending,
                                CustomerMemberCard expired, int remindDays) {
        if (current != null) {
            long days = remainingDays(current.getEndTime(), LocalDateTime.now());
            return days <= remindDays ? "expiring" : "active";
        }
        if (pending != null) {
            return "pending";
        }
        if (expired != null) {
            return "expired";
        }
        return "none";
    }

    private Map<String, Object> cardView(CustomerMemberCard card, LocalDateTime now, boolean isCurrent) {
        Map<String, Object> view = new LinkedHashMap<>();
        view.put("id", card.getId());
        view.put("cardNo", card.getCardNo());
        view.put("cardNoTail", card.getCardNo() == null ? "" : card.getCardNo().substring(Math.max(0, card.getCardNo().length() - 4)));
        view.put("cardType", normalizeType(card.getCardType()));
        view.put("cardName", card.getCardName());
        view.put("validDays", card.getValidDays());
        view.put("periodNo", card.getPeriodNo());
        view.put("startTime", card.getStartTime() == null ? null : card.getStartTime().toString().replace('T', ' '));
        view.put("endTime", card.getEndTime() == null ? null : card.getEndTime().toString().replace('T', ' '));
        view.put("advanceRate", card.getAdvanceRate());
        view.put("sameDayRate", card.getSameDayRate());
        view.put("amount", card.getAmount());
        view.put("status", card.getStatus());
        view.put("statusText", statusText(card.getStatus()));
        view.put("remainingDays", remainingDays(card.getEndTime(), now));
        view.put("current", isCurrent);
        view.put("remark", card.getRemark());
        return view;
    }

    private String statusText(Integer status) {
        if (status == null) {
            return "";
        }
        switch (status) {
            case CustomerMemberCard.STATUS_PENDING:
                return "待生效";
            case CustomerMemberCard.STATUS_ACTIVE:
                return "生效中";
            case CustomerMemberCard.STATUS_EXPIRED:
                return "已到期";
            case CustomerMemberCard.STATUS_REFUNDED:
                return "已终止";
            default:
                return "";
        }
    }

    private long remainingDays(LocalDateTime endTime, LocalDateTime now) {
        if (endTime == null) {
            return 0;
        }
        long days = ChronoUnit.DAYS.between(now, endTime);
        if (days < 0) {
            return 0;
        }
        return days + 1;
    }

    private String discountText(BigDecimal rate) {
        if (rate == null) {
            return "";
        }
        BigDecimal discount = rate.multiply(BigDecimal.TEN);
        return discount.stripTrailingZeros().toPlainString() + " 折";
    }

    private String plain(BigDecimal value) {
        if (value == null) {
            return "0";
        }
        return value.stripTrailingZeros().toPlainString();
    }

    /**
     * 当前生效的权益期。按时间判定，不依赖 status 是否已被任务刷新。
     */
    public CustomerMemberCard getActiveCard(Long customerId) {
        if (customerId == null) {
            return null;
        }
        LocalDateTime now = LocalDateTime.now();
        LambdaQueryWrapper<CustomerMemberCard> lqw = new LambdaQueryWrapper<>();
        lqw.eq(CustomerMemberCard::getCustomerId, customerId);
        lqw.ne(CustomerMemberCard::getStatus, CustomerMemberCard.STATUS_REFUNDED);
        lqw.le(CustomerMemberCard::getStartTime, now);
        lqw.gt(CustomerMemberCard::getEndTime, now);
        lqw.orderByDesc(CustomerMemberCard::getStartTime);
        lqw.last("limit 1");
        List<CustomerMemberCard> list = list(lqw);
        return CollectionUtils.isEmpty(list) ? null : list.get(0);
    }

    /**
     * 后台分页：客户关键词、卡类型、状态、开通渠道、到期区间。
     */
    public Map<String, Object> adminPage(Map<String, Object> params) {
        scanStatus();
        Map<String, Object> result = new HashMap<>();
        int page = parseInt(params.get("page"), 1);
        int size = parseInt(params.get("size"), 20);
        LambdaQueryWrapper<CustomerMemberCard> lqw = new LambdaQueryWrapper<>();
        Object keyword = params.get("keyword");
        if (keyword == null || keyword.toString().trim().isEmpty()) {
            keyword = params.get("phone");
        }
        if (keyword != null && !keyword.toString().trim().isEmpty()) {
            List<Long> customerIds = customerService.findIdListByPhoneOrName(keyword.toString().trim());
            if (CollectionUtils.isEmpty(customerIds)) {
                result.put("list", new ArrayList<>());
                result.put("total", 0L);
                result.put("pageNum", page);
                result.put("pageSize", size);
                return result;
            }
            lqw.in(CustomerMemberCard::getCustomerId, customerIds);
        }
        if (params.get("customerId") != null && !"".equals(params.get("customerId"))) {
            lqw.eq(CustomerMemberCard::getCustomerId, Long.valueOf(params.get("customerId").toString()));
        }
        if (params.get("cardType") != null && !"".equals(params.get("cardType"))) {
            lqw.eq(CustomerMemberCard::getCardType, normalizeType(params.get("cardType").toString()));
        }
        if (params.get("status") != null && !"".equals(params.get("status"))) {
            lqw.eq(CustomerMemberCard::getStatus, Integer.valueOf(params.get("status").toString()));
        }
        if (params.get("channel") != null && !"".equals(params.get("channel"))) {
            lqw.eq(CustomerMemberCard::getChannel, Integer.valueOf(params.get("channel").toString()));
        }
        if (params.get("expiring") != null && Boolean.parseBoolean(params.get("expiring").toString())) {
            int remindDays = getActiveConfig().getRenewalRemindDays() == null ? 30 : getActiveConfig().getRenewalRemindDays();
            lqw.eq(CustomerMemberCard::getStatus, CustomerMemberCard.STATUS_ACTIVE);
            lqw.le(CustomerMemberCard::getEndTime, LocalDateTime.now().plusDays(remindDays));
        }
        if (params.get("endFrom") != null && !"".equals(params.get("endFrom"))) {
            lqw.ge(CustomerMemberCard::getEndTime, toDateTime(params.get("endFrom").toString(), false));
        }
        if (params.get("endTo") != null && !"".equals(params.get("endTo"))) {
            lqw.le(CustomerMemberCard::getEndTime, toDateTime(params.get("endTo").toString(), true));
        }
        lqw.orderByDesc(CustomerMemberCard::getCreateTime);
        com.github.pagehelper.PageHelper.startPage(page, size);
        List<CustomerMemberCard> list = list(lqw);
        com.github.pagehelper.PageInfo<CustomerMemberCard> pageInfo = new com.github.pagehelper.PageInfo<>(list);
        LocalDateTime now = LocalDateTime.now();
        pageInfo.getList().forEach(item -> decorate(item, now));
        fillCustomers(pageInfo.getList());
        result.put("list", pageInfo.getList());
        result.put("total", pageInfo.getTotal());
        result.put("pageNum", pageInfo.getPageNum());
        result.put("pageSize", pageInfo.getPageSize());
        return result;
    }

    /**
     * 后台详情：权益期 + 开卡支付单 + 客户信息。
     */
    public Map<String, Object> adminDetail(Long id) {
        CustomerMemberCard card = getById(id);
        if (card == null) {
            throw new BusinessException("会员卡不存在");
        }
        decorate(card, LocalDateTime.now());
        fillCustomers(java.util.Collections.singletonList(card));
        LambdaQueryWrapper<MemberCardOrder> lqw = new LambdaQueryWrapper<>();
        lqw.eq(MemberCardOrder::getCardId, id);
        lqw.orderByDesc(MemberCardOrder::getId);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("card", card);
        result.put("orders", orderMapper.selectList(lqw));
        result.put("customer", customerService.getById(card.getCustomerId()));
        return result;
    }

    /**
     * 后台手工发卡，支持单个或批量、指定卡类型与有效期，金额允许为 0（赠送）。
     */
    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> adminIssue(Map<String, Object> params, Long operatorId) {
        List<Long> customerIds = resolveCustomerIds(params);
        customerIds.sort(Long::compareTo);
        if (customerIds.isEmpty()) {
            throw new BusinessException("请选择要发卡的客户");
        }
        String type = normalizeType(stringValue(params.get("cardType")));
        MemberCardConfig config = getConfigByType(type);
        int validDays = config.getValidDays() == null ? 365 : config.getValidDays();
        Object validParam = params.get("validDays");
        if (validParam != null && !validParam.toString().trim().isEmpty()) {
            try {
                validDays = Integer.parseInt(validParam.toString().trim());
            } catch (NumberFormatException e) {
                throw new BusinessException("有效期天数格式不正确");
            }
            if (validDays <= 0 || validDays > 3650) {
                throw new BusinessException("有效期天数需在 1 到 3650 天之间");
            }
        }
        BigDecimal amount = config.getPrice() == null ? BigDecimal.ZERO : config.getPrice();
        Object amountParam = params.get("amount");
        if (amountParam != null && !amountParam.toString().trim().isEmpty()) {
            try {
                amount = new BigDecimal(amountParam.toString().trim());
            } catch (NumberFormatException e) {
                throw new BusinessException("开卡金额格式不正确");
            }
            if (amount.compareTo(BigDecimal.ZERO) < 0) {
                throw new BusinessException("开卡金额不能为负数");
            }
        }
        LocalDateTime startTime = null;
        Object start = params.get("startTime");
        if (start != null && !start.toString().trim().isEmpty()) {
            startTime = toDateTime(start.toString().replace('T', ' ').trim(), false);
            if (startTime == null) {
                throw new BusinessException("开始时间格式不正确");
            }
        }
        String batchNo = "B" + LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyyMMddHHmmss"))
                + String.format("%03d", RANDOM.nextInt(1000));

        List<Map<String, Object>> results = new ArrayList<>();
        int success = 0;
        for (Long customerId : customerIds) {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("customerId", customerId);
            try {
                Customer customer = customerService.getById(customerId);
                if (customer == null) {
                    row.put("success", false);
                    row.put("message", "客户不存在");
                    results.add(row);
                    continue;
                }
                row.put("customerName", customer.getNickname());
                row.put("phone", customer.getPhone());
                lockCustomer(customerId);
                LocalDateTime begin = startTime;
                List<CustomerMemberCard> periods = lockedPeriods(customerId);
                if (begin == null) begin = nextPeriodStart(periods, LocalDateTime.now());
                MemberCardOrder order = new MemberCardOrder();
                order.setOrderSn("MC" + begin.format(CARD_NO_FORMAT) + String.format("%04d", RANDOM.nextInt(10000)));
                order.setCustomerId(customerId);
                order.setConfigId(config.getId());
                order.setCardType(type);
                order.setAmount(amount);
                order.setState(MemberCardOrder.STATE_PAID);
                order.setPayType(100);
                order.setPayTime(LocalDateTime.now());
                if (orderMapper.insert(order) != 1) throw new BusinessException("开卡订单保存失败");

                CustomerMemberCard card = createCard(customerId, config, begin, validDays, amount,
                        order.getId(), 2, periods.size() + 1, batchNo);
                card.setOperatorId(operatorId);
                card.setRemark("后台发卡" + (amount.compareTo(BigDecimal.ZERO) == 0 ? "（赠送）" : ""));
                if (!save(card)) throw new BusinessException("会员权益保存失败");

                order.setCardId(card.getId());
                if (orderMapper.updateById(order) != 1) throw new BusinessException("开卡订单关联失败");

                row.put("success", true);
                row.put("cardId", card.getId());
                row.put("cardNo", card.getCardNo());
                row.put("startTime", card.getStartTime().toString().replace('T', ' '));
                row.put("endTime", card.getEndTime().toString().replace('T', ' '));
                success++;
            } catch (Exception e) {
                // 写入错误必须离开事务以触发整批回滚，不能留下有支付单无权益的半条记录。
                throw new BusinessException("批量发卡未保存，请核对后重试（客户#" + customerId + "）");
            }
            results.add(row);
        }
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("batchNo", batchNo);
        result.put("total", customerIds.size());
        result.put("successCount", success);
        result.put("failCount", customerIds.size() - success);
        result.put("results", results);
        return result;
    }

    private CustomerMemberCard createCard(Long customerId, MemberCardConfig config, LocalDateTime startTime,
                                          int validDays, BigDecimal amount, Long payOrderId,
                                          int channel, int periodNo, String batchNo) {
        CustomerMemberCard card = new CustomerMemberCard();
        card.setCardNo("FY" + startTime.format(CARD_NO_FORMAT) + String.format("%04d", RANDOM.nextInt(10000)));
        card.setCustomerId(customerId);
        card.setCardType(normalizeType(config.getCardType()));
        card.setCardName(config.getCardName());
        card.setValidDays(validDays);
        card.setBatchNo(batchNo);
        card.setPeriodNo(periodNo);
        card.setStartTime(startTime);
        card.setEndTime(startTime.plusDays(validDays));
        card.setAdvanceRate(config.getAdvanceRate());
        card.setSameDayRate(config.getSameDayRate());
        card.setAmount(amount);
        card.setPayOrderId(payOrderId);
        card.setChannel(channel);
        card.setStatus(LocalDateTime.now().isBefore(startTime) ? CustomerMemberCard.STATUS_PENDING : CustomerMemberCard.STATUS_ACTIVE);
        return card;
    }

    private List<Long> resolveCustomerIds(Map<String, Object> params) {
        Set<Long> ids = new LinkedHashSet<>();
        addId(ids, params.get("customerId"));
        addIds(ids, params.get("customerIds"));
        Object phones = params.get("phones");
        if (phones != null) {
            for (String phone : String.valueOf(phones).split("[,，;；\\s]+")) {
                if (phone.trim().isEmpty()) {
                    continue;
                }
                Customer customer = customerService.getByPhone(phone.trim());
                if (customer != null) {
                    ids.add(customer.getId());
                }
            }
        }
        return new ArrayList<>(ids);
    }

    private void addId(Set<Long> ids, Object value) {
        if (value == null) {
            return;
        }
        String text = value.toString().trim();
        if (text.isEmpty() || "null".equals(text)) {
            return;
        }
        try {
            ids.add(Long.valueOf(text));
        } catch (NumberFormatException ignored) {
            // 忽略非法 id
        }
    }

    private void addIds(Set<Long> ids, Object value) {
        if (value == null) {
            return;
        }
        if (value instanceof Iterable) {
            for (Object item : (Iterable<?>) value) {
                addId(ids, item);
            }
            return;
        }
        for (String text : value.toString().split("[,，;；\\s]+")) {
            addId(ids, text);
        }
    }

    /**
     * 保存会员卡产品配置（新增或更新）。
     */
    @Transactional(rollbackFor = Exception.class)
    public MemberCardConfig updateConfig(MemberCardConfig form) {
        if (form.getPrice() == null || form.getPrice().compareTo(BigDecimal.ZERO) < 0) {
            throw new BusinessException("会员卡价格不能为空或负数");
        }
        if (form.getAdvanceRate() == null || form.getAdvanceRate().compareTo(BigDecimal.ZERO) <= 0
                || form.getAdvanceRate().compareTo(BigDecimal.ONE) >= 0) {
            throw new BusinessException("提前预约折扣率需在 0 到 1 之间");
        }
        if (form.getSameDayRate() == null || form.getSameDayRate().compareTo(BigDecimal.ZERO) <= 0
                || form.getSameDayRate().compareTo(BigDecimal.ONE) >= 0) {
            throw new BusinessException("当日预约折扣率需在 0 到 1 之间");
        }
        if (form.getValidDays() == null || form.getValidDays() <= 0) {
            throw new BusinessException("有效期天数必须大于 0");
        }
        MemberCardConfig config = null;
        if (form.getId() != null && form.getId() > 0) {
            config = configMapper.selectById(form.getId());
        }
        if (config == null) {
            config = getActiveConfig();
        }
        if (config.getId() == null || config.getId() == 0L) {
            config = new MemberCardConfig();
            config.setStatus(1);
        }
        if (form.getCardName() != null && !form.getCardName().trim().isEmpty()) {
            config.setCardName(form.getCardName().trim());
        }
        config.setCardType(normalizeType(form.getCardType() == null ? config.getCardType() : form.getCardType()));
        config.setPrice(form.getPrice());
        config.setAdvanceRate(form.getAdvanceRate());
        config.setSameDayRate(form.getSameDayRate());
        config.setValidDays(form.getValidDays());
        config.setRenewalRemindDays(form.getRenewalRemindDays() == null ? 30 : form.getRenewalRemindDays());
        config.setRecommend(form.getRecommend() == null ? 0 : form.getRecommend());
        config.setSort(form.getSort() == null ? 0 : form.getSort());
        config.setBasePrice(form.getBasePrice() == null ? new BigDecimal("396.00") : form.getBasePrice());
        config.setSampleMinutes(form.getSampleMinutes() == null ? 60 : form.getSampleMinutes());
        config.setPurchaseNotice(form.getPurchaseNotice());
        config.setBenefitDesc(form.getBenefitDesc());
        config.setTerms(form.getTerms());
        config.setStatus(form.getStatus() == null ? 1 : form.getStatus());
        if (config.getId() == null) {
            configMapper.insert(config);
        } else {
            configMapper.updateById(config);
        }
        return config;
    }

    /**
     * 即将到期的生效卡（供首页待办 / 后台筛选）。
     */
    public List<CustomerMemberCard> expiringList(Integer days) {
        int range = days == null || days <= 0
                ? (getActiveConfig().getRenewalRemindDays() == null ? 30 : getActiveConfig().getRenewalRemindDays())
                : days;
        LocalDateTime now = LocalDateTime.now();
        LambdaQueryWrapper<CustomerMemberCard> lqw = new LambdaQueryWrapper<>();
        lqw.eq(CustomerMemberCard::getStatus, CustomerMemberCard.STATUS_ACTIVE);
        lqw.gt(CustomerMemberCard::getEndTime, now);
        lqw.le(CustomerMemberCard::getEndTime, now.plusDays(range));
        lqw.orderByAsc(CustomerMemberCard::getEndTime);
        List<CustomerMemberCard> list = list(lqw);
        list.forEach(item -> decorate(item, now));
        fillCustomers(list);
        return list;
    }

    /**
     * 每日扫描：到期待生效转生效、生效转过期。
     */
    @Transactional(rollbackFor = Exception.class)
    public int scanStatus() {
        LocalDateTime now = LocalDateTime.now();
        LambdaQueryWrapper<CustomerMemberCard> activating = new LambdaQueryWrapper<>();
        activating.eq(CustomerMemberCard::getStatus, CustomerMemberCard.STATUS_PENDING);
        activating.le(CustomerMemberCard::getStartTime, now);
        activating.gt(CustomerMemberCard::getEndTime, now);
        int activated = 0;
        for (CustomerMemberCard card : list(activating)) {
            card.setStatus(CustomerMemberCard.STATUS_ACTIVE);
            updateById(card);
            activated++;
        }
        LambdaQueryWrapper<CustomerMemberCard> expiring = new LambdaQueryWrapper<>();
        expiring.eq(CustomerMemberCard::getStatus, CustomerMemberCard.STATUS_ACTIVE);
        expiring.le(CustomerMemberCard::getEndTime, now);
        int expired = 0;
        for (CustomerMemberCard card : list(expiring)) {
            card.setStatus(CustomerMemberCard.STATUS_EXPIRED);
            updateById(card);
            expired++;
        }
        return activated + expired;
    }

    /**
     * 配置页三个小指标。
     */
    public Map<String, Object> stats() {
        LocalDateTime now = LocalDateTime.now();
        LocalDateTime monthStart = now.withDayOfMonth(1).withHour(0).withMinute(0).withSecond(0).withNano(0);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("activeCount", count(new LambdaQueryWrapper<CustomerMemberCard>()
                .eq(CustomerMemberCard::getStatus, CustomerMemberCard.STATUS_ACTIVE)
                .gt(CustomerMemberCard::getEndTime, now)));
        result.put("monthNew", count(new LambdaQueryWrapper<CustomerMemberCard>()
                .ge(CustomerMemberCard::getCreateTime, monthStart)));
        result.put("expiringCount", count(new LambdaQueryWrapper<CustomerMemberCard>()
                .eq(CustomerMemberCard::getStatus, CustomerMemberCard.STATUS_ACTIVE)
                .gt(CustomerMemberCard::getEndTime, now)
                .le(CustomerMemberCard::getEndTime, now.plusDays(30))));
        return result;
    }

    private void fillCustomers(List<CustomerMemberCard> list) {
        if (CollectionUtils.isEmpty(list)) {
            return;
        }
        List<Long> ids = list.stream().map(CustomerMemberCard::getCustomerId).distinct().collect(Collectors.toList());
        Map<Long, Customer> map = customerService.getCustomerMapByIdList(ids);
        if (map == null) {
            return;
        }
        list.forEach(item -> {
            Customer customer = map.get(item.getCustomerId());
            if (customer != null) {
                item.setCustomerNickname(customer.getNickname());
                item.setCustomerPhone(customer.getPhone());
            }
        });
    }

    private void decorate(CustomerMemberCard card, LocalDateTime now) {
        card.setRemainingDays(remainingDays(card.getEndTime(), now));
        boolean current = card.getStartTime() != null && card.getEndTime() != null
                && !now.isBefore(card.getStartTime()) && now.isBefore(card.getEndTime())
                && (card.getStatus() == null || card.getStatus() != CustomerMemberCard.STATUS_REFUNDED);
        card.setCurrent(current);
        card.setStatusText(statusText(card.getStatus()));
        if (card.getCardType() == null) {
            card.setCardType(TYPE_YEAR);
        }
        if (card.getCardName() == null) {
            card.setCardName(TYPE_MONTH.equals(card.getCardType()) ? "Full愈月卡" : "Full愈年卡");
        }
    }

    private String stringValue(Object value) {
        return value == null ? null : value.toString();
    }

    private LocalDate toDate(String text) {
        if (text == null) {
            return null;
        }
        String value = text.trim();
        if (value.isEmpty()) {
            return null;
        }
        try {
            return LocalDate.parse(value.length() > 10 ? value.substring(0, 10) : value);
        } catch (Exception e) {
            return null;
        }
    }

    private LocalDateTime toDateTime(String text, boolean endOfDay) {
        if (text == null) {
            return null;
        }
        String value = text.trim();
        try {
            if (value.length() == 10) {
                LocalDate date = LocalDate.parse(value);
                return endOfDay ? date.atTime(23, 59, 59) : date.atStartOfDay();
            }
            return LocalDateTime.parse(value.replace(' ', 'T'));
        } catch (Exception e) {
            return null;
        }
    }

    private int parseInt(Object value, int defaultValue) {
        if (value == null) {
            return defaultValue;
        }
        try {
            return Integer.parseInt(value.toString());
        } catch (NumberFormatException e) {
            return defaultValue;
        }
    }
}
