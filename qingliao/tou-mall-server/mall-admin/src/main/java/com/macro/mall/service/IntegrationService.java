package com.macro.mall.service;

import com.alibaba.fastjson2.JSONArray;
import com.alibaba.fastjson2.JSONObject;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.macro.mall.common.exception.BusinessException;
import com.macro.mall.crm.CrmSyncService;
import com.macro.mall.entity.Customer;
import com.macro.mall.entity.CustomerCoupon;
import com.macro.mall.entity.Integration;
import com.macro.mall.entity.Order;
import com.macro.mall.enums.IntegrationState;
import com.macro.mall.enums.IntegrationType;
import com.macro.mall.enums.OrderPayType;
import com.macro.mall.enums.OrderState;
import com.macro.mall.mapper.CustomerMassagistRelationMapper;
import com.macro.mall.mapper.IntegrationMapper;
import com.macro.mall.service.base.BaseService;
import com.macro.mall.service.base.WrapperBuilder;
import com.macro.mall.service.serviceStatistics.StatisticsService;
import com.macro.mall.utils.DateUtil;
import com.macro.mall.utils.ExcelUtil;
import lombok.extern.slf4j.Slf4j;
import org.apache.commons.lang3.math.NumberUtils;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.util.CollectionUtils;
import org.springframework.util.ObjectUtils;
import org.springframework.util.StringUtils;
import org.springframework.web.multipart.MultipartFile;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.Month;
import java.time.temporal.TemporalAdjusters;
import java.util.*;
import java.util.stream.Collectors;

/**
 * 积分 服务类
 *
 * @author ST
 * @date 2025/06/04
 */
@Service
@Slf4j
public class IntegrationService extends BaseService<IntegrationMapper, Integration> {
    @Autowired
    CustomerService customerService;
    @Autowired
    OrderService orderService;
    @Autowired
    CustomerCouponService customerCouponService;
    @Autowired
    WxMpTemplateMessageService wxMpTemplateMessageService;
    @Autowired
    private CustomerMassagistRelationMapper customerMassagistRelationMapper;
    @Autowired
    private StatisticsService statisticsService;
    @Autowired
    @Lazy
    private CrmSyncService crmSyncService;

    @Override
    protected QueryWrapper<Integration> buildWrapper(Map<String, Object> params, QueryWrapper<Integration> queryWrapper) {
        if(params.get("statemini")!=null&&params.get("statemini").equals("3")){
            queryWrapper.and(wrapper -> wrapper.eq("state", 2).or().eq("type", 0)).ne("state", 0);
        }
        return WrapperBuilder.init(queryWrapper, params)
                .like("comment")
                .equal("customer_id")
                .equal("type")
                .in("state")
                .getQueryWrapper();
    }

    /**
     * 添加积分
     *
     * @param score
     * @param customerId
     */
    public void addIntegration(Long score, Long orderId, Long customerId, String comment) {
        addIntegration(score, orderId, customerId, comment, null);
    }

    /**
     * 添加积分。ref 是会员中心的幂等键：有稳定业务键（抽奖订单、拉新关系）时由调用方给出，
     * 否则留空，落库后用本地影子记录 id 生成，重复执行不会重复入账。
     */
    public void addIntegration(Long score, Long orderId, Long customerId, String comment, String ref) {
        JSONObject jsonObject = new JSONObject();
        jsonObject.put("customerId", customerId);
        jsonObject.put("orderId", orderId);
        jsonObject.put("score", score);
        jsonObject.put("comment", comment);
        jsonObject.put("type", IntegrationType.ADD.getValue());
        if (StringUtils.hasText(ref)) {
            jsonObject.put("ref", ref);
        }
        addIntegrationBatch(Collections.singletonList(jsonObject));
    }

    /**
     * 添加积分
     *
     * @param jsonObjectList
     */
    private void addIntegrationBatch(List<JSONObject> jsonObjectList) {
        if (CollectionUtils.isEmpty(jsonObjectList)) {
            return;
        }
        LocalDate today = LocalDate.now();
        LocalDate endTime;
        if (today.getMonthValue() < Month.NOVEMBER.getValue()) {
            endTime = LocalDate.of(today.getYear() + 1, 1, 1);
        } else {
            endTime = LocalDate.of(today.getYear() + 2, 1, 1);
        }
        List<Integration> integrationsToSave = new ArrayList<>();
        List<String> refs = new ArrayList<>();
        jsonObjectList.forEach(data -> {
            Long customerId = data.getLong("customerId");
            Long newCustomerId = data.getLong("newCustomerId");
            Long orderId = data.getLong("orderId");
            Long categoryId = data.getLong("categoryId");
            Long score = data.getLong("score");
            String comment = data.getString("comment");
            Integer type = data.getInteger("type");
            if (IntegrationType.SUBTRACT.getValue().equals(type)) {
                Integration integration = useIntegration(score, customerId, comment);
                if (integration == null) {
                    log.warn("积分不足，customerId={}", customerId);
                }
                return;
            }
            Integration integration = new Integration();
            integration.setOrderId(orderId);
            integration.setScore(score);
            integration.setNormalScore(score);
            integration.setType(type);
            integration.setCategoryId(categoryId);
            integration.setCustomerId(customerId);
            if (newCustomerId != null) {
                integration.setNewCustomerId(newCustomerId);
            }
            integration.setEndTime(endTime);
            integration.setComment(comment);
            integrationsToSave.add(integration);
            refs.add(data.getString("ref"));
        });
        if (CollectionUtils.isEmpty(integrationsToSave)) {
            return;
        }
        saveBatch(integrationsToSave);
        if (crmSyncService.isActive()) {
            creditCrm(integrationsToSave, refs);
        }
//        handleChangeIntegrationNotice(integrationsToSave);
    }

    /**
     * 会员中心开启时，本地行只是留痕与幂等锚点，真正入账以 CRM 为准。
     * 入账失败的本地行立即删除，避免本地账本出现会员中心不存在的积分。
     */
    private void creditCrm(List<Integration> rows, List<String> refs) {
        for (int i = 0; i < rows.size(); i++) {
            Integration row = rows.get(i);
            String ref = refs.get(i);
            if (!StringUtils.hasText(ref)) {
                ref = "ql-add:" + row.getId();
            }
            Customer customer = customerService.getById(row.getCustomerId());
            if (customer == null) {
                abortCrmCredits(rows, i);
                throw new BusinessException("客户不存在，积分入账失败");
            }
            try {
                crmSyncService.earn(customer, row.getScore(), row.getComment(), ref);
            } catch (RuntimeException e) {
                abortCrmCredits(rows, i);
                throw e;
            }
            compensateOnRollback(customer, row.getScore(), "本地事务回滚，撤销积分入账",
                    "ql-add-rollback:" + row.getId(), false);
        }
    }

    /** 批量入账中途失败：把已经入账的行冲回，再删除本地影子行，避免只入了一半。 */
    private void abortCrmCredits(List<Integration> rows, int creditedCount) {
        for (int i = 0; i < creditedCount; i++) {
            Integration row = rows.get(i);
            Customer customer = customerService.getById(row.getCustomerId());
            if (customer == null) {
                continue;
            }
            try {
                crmSyncService.consume(customer, row.getScore(), "积分批量入账失败，撤销",
                        "ql-add-abort:" + row.getId());
            } catch (RuntimeException e) {
                log.error("会员中心批量入账回滚失败，需人工核对，integrationId={}，原因={}",
                        row.getId(), e.getMessage());
            }
        }
        removeByIds(rows.stream().map(Integration::getId).collect(Collectors.toList()));
    }

    /**
     * 外部账本已成功、本地事务最终回滚时，用另一条幂等 ref 反向冲正。
     * 只登记在写成功之后，写失败不会触发误冲正。
     */
    private void compensateOnRollback(Customer customer, long points, String reason, String ref, boolean earn) {
        if (!TransactionSynchronizationManager.isSynchronizationActive()) {
            return;
        }
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCompletion(int status) {
                if (status != TransactionSynchronization.STATUS_ROLLED_BACK) {
                    return;
                }
                try {
                    if (earn) {
                        crmSyncService.earn(customer, points, reason, ref);
                    } else {
                        crmSyncService.consume(customer, points, reason, ref);
                    }
                } catch (RuntimeException e) {
                    log.error("会员中心积分冲正失败，需人工核对，ref={}，原因={}", ref, e.getMessage());
                }
            }
        });
    }

    /**
     * 使用积分抵扣
     *
     * @param score
     * @param customerId
     */
    @Transactional(rollbackFor = Exception.class)
    public Integration useIntegration(Long score, Long customerId, String comment) {
        if (crmSyncService.isActive()) {
            return useIntegrationInCrm(score, customerId, comment);
        }
        String lockKey = "lock:" + customerId;
        synchronized (lockKey.intern()) {
            List<JSONObject> jsonObjectList = new ArrayList<>();
            List<Integration> useList = new ArrayList<>();
            Long useScore = 0L;
            LambdaQueryWrapper<Integration> lqw = new LambdaQueryWrapper<>();
            lqw.eq(Integration::getCustomerId, customerId);
            lqw.eq(Integration::getType, IntegrationType.ADD.getValue());
            lqw.eq(Integration::getState, IntegrationState.EFFECTIVE.getValue());
            lqw.orderByAsc(Integration::getEndTime);
            List<Integration> list = list(lqw);
            for (Integration integration : list) {
                useList.add(integration);
                if (!getIntegrationState(integration)) {
                    integration.setState(IntegrationState.EXPIRE.getValue());
                } else {
                    if (integration.getNormalScore() > score) {
                        JSONObject jsonObject = new JSONObject();
                        jsonObject.put("id", integration.getId());
                        jsonObject.put("useScore", score);
                        jsonObjectList.add(jsonObject);
                        integration.setNormalScore(integration.getNormalScore() - score);
                        useScore += score;
                        break;
                    } else if (score.equals(integration.getNormalScore())) {
                        JSONObject jsonObject = new JSONObject();
                        jsonObject.put("id", integration.getId());
                        jsonObject.put("useScore", score);
                        jsonObjectList.add(jsonObject);
                        integration.setNormalScore(0L);
                        integration.setState(IntegrationState.INVALID.getValue());
                        useScore += score;
                        break;
                    } else {
                        Long normalScore = integration.getNormalScore();
                        JSONObject jsonObject = new JSONObject();
                        jsonObject.put("id", integration.getId());
                        jsonObject.put("useScore", normalScore);
                        jsonObjectList.add(jsonObject);
                        useScore += normalScore;
                        score -= normalScore;
                        integration.setNormalScore(0L);
                        integration.setState(IntegrationState.INVALID.getValue());
                    }
                }
            }
            if (useScore == 0) {
                return null;
            }
            updateBatchById(useList);

            Integration newIntegration = new Integration();
            newIntegration.setType(IntegrationType.SUBTRACT.getValue());
            newIntegration.setScore(useScore);
            newIntegration.setCustomerId(customerId);
            newIntegration.setComment(comment);
            newIntegration.setUseMap(JSONObject.toJSONString(jsonObjectList));
            save(newIntegration);
            return newIntegration;
        }
    }

    /**
     * 会员中心开启时的扣减：余额以 CRM 为准，按可用余额封顶；本地落一条影子记录留痕并从其 id 生成幂等键。
     * CRM 扣减失败不留下“像扣过”的本地记录；事务回滚时用反向 ref 冲正已扣积分。
     */
    private Integration useIntegrationInCrm(Long score, Long customerId, String comment) {
        String lockKey = "lock:" + customerId;
        synchronized (lockKey.intern()) {
            Customer customer = customerService.getById(customerId);
            if (customer == null) {
                throw new BusinessException("客户不存在，无法使用积分");
            }
            long balance = crmSyncService.balanceOf(customer);
            long need = score == null ? 0L : score;
            long useScore = Math.min(need, balance);
            if (useScore <= 0) {
                return null;
            }
            Integration row = new Integration();
            row.setType(IntegrationType.SUBTRACT.getValue());
            row.setScore(useScore);
            row.setCustomerId(customerId);
            row.setComment(comment);
            save(row);
            try {
                crmSyncService.consume(customer, useScore, comment, "ql-deduct:" + row.getId());
            } catch (BusinessException e) {
                removeById(row.getId());
                if (e.getStatus() == 422) {
                    throw new PointsBalanceChangedException("积分余额已变化，请刷新后重试");
                }
                throw e;
            } catch (RuntimeException e) {
                removeById(row.getId());
                throw e;
            }
            compensateOnRollback(customer, useScore, "本地事务回滚，返还抵扣积分",
                    "ql-deduct-rollback:" + row.getId(), true);
            return row;
        }
    }

    /**
     * 订单超时或取消积分返还
     *
     * @param orderId
     */
    @Transactional(rollbackFor = Exception.class)
    public void revocationIntegration(Long orderId, Long customerId) {
        if (crmSyncService.isActive()) {
            revocationIntegrationInCrm(orderId, customerId);
            return;
        }
        String lockKey = "lock:" + customerId;
        synchronized (lockKey.intern()) {
            LambdaQueryWrapper<Integration> lqw = new LambdaQueryWrapper<>();
            lqw.eq(Integration::getOrderId, orderId);
            lqw.eq(Integration::getState, IntegrationState.EFFECTIVE.getValue());
            Integration integration = getOnlyOne(lqw);
            if (integration == null) {
                return;
            }
            String useMap = integration.getUseMap();
            if (StringUtils.hasText(useMap)) {
                List<JSONObject> jsonObjectList = JSONArray.parseArray(useMap, JSONObject.class);
                Map<Long, Long> map = jsonObjectList.stream().collect(Collectors.toMap(s -> s.getLong("id"), s -> s.getLong("useScore")));
                Set<Long> integrationIds = map.keySet();
                List<Integration> integrationList = listByIds(integrationIds);
                integrationList.forEach(s -> {
                    long score = s.getNormalScore() + map.getOrDefault(s.getId(), 0L);
                    if (score > s.getScore()) {
                        score = s.getScore();
                    }
                    s.setNormalScore(score);
                    s.setState(IntegrationState.EFFECTIVE.getValue());
                    if (!getIntegrationState(s)) {
                        s.setState(IntegrationState.EXPIRE.getValue());
                    }
                });
                updateBatchById(integrationList);
            }
            integration.setState(IntegrationState.INVALID.getValue());
            integration.setComment("订单已取消或退款");
            updateById(integration);
        }
    }

    /**
     * 会员中心开启时的返还：找到该订单仍有效的抵扣影子记录，按记录 id 生成幂等键往 CRM 回补。
     * 影子记录置为无效，重复回调直接跳过，不会重复返还。
     */
    private void revocationIntegrationInCrm(Long orderId, Long customerId) {
        String lockKey = "lock:" + customerId;
        synchronized (lockKey.intern()) {
            LambdaQueryWrapper<Integration> lqw = new LambdaQueryWrapper<>();
            lqw.eq(Integration::getOrderId, orderId);
            lqw.eq(Integration::getType, IntegrationType.SUBTRACT.getValue());
            lqw.eq(Integration::getState, IntegrationState.EFFECTIVE.getValue());
            Integration row = getOnlyOne(lqw);
            if (row == null) {
                return;
            }
            long points = row.getScore() == null ? 0L : row.getScore();
            if (points > 0) {
                Customer customer = customerService.getById(customerId);
                if (customer == null) {
                    throw new BusinessException("客户不存在，无法返还积分");
                }
                crmSyncService.earn(customer, points, "订单取消或退款返还", "ql-revoke:" + row.getId());
                compensateOnRollback(customer, points, "本地事务回滚，撤销积分返还",
                        "ql-revoke-rollback:" + row.getId(), false);
            }
            row.setState(IntegrationState.INVALID.getValue());
            row.setComment("订单已取消或退款");
            updateById(row);
        }
    }

    /**
     * 获取客户积分（会员中心开启时以 CRM 为准）
     *
     * @param customerId
     */
    public Long getIntegrationByCustomerId(Long customerId) {
        if (crmSyncService.isActive()) {
            Map<Long, Long> map = getIntegrationByCustomerList(Collections.singletonList(customerId));
            return map.getOrDefault(customerId, 0L);
        }
        return getLocalIntegrationByCustomerId(customerId);
    }

    /**
     * 获取客户积分（会员中心开启时以 CRM 为准）
     *
     * @param customerIdList
     */
    public Map<Long, Long> getIntegrationByCustomerList(List<Long> customerIdList) {
        if (crmSyncService.isActive()) {
            Map<Long, Long> balances = new HashMap<>();
            if (CollectionUtils.isEmpty(customerIdList)) {
                return balances;
            }
            for (Long customerId : customerIdList) {
                Customer customer = customerService.getById(customerId);
                if (customer != null) {
                    balances.put(customerId, crmSyncService.balanceOf(customer));
                }
            }
            return balances;
        }
        return getLocalIntegrationByCustomerList(customerIdList);
    }

    /**
     * 本地账本余额，仅用于历史积分迁移与对账，不能当作会员可用余额。
     */
    public Long getLocalIntegrationByCustomerId(Long customerId) {
        Map<Long, Long> map = getLocalIntegrationByCustomerList(Collections.singletonList(customerId));
        return map.getOrDefault(customerId, 0L);
    }

    /**
     * 本地账本余额，仅用于历史积分迁移与对账，不能当作会员可用余额。
     *
     * @param customerIdList
     */
    public Map<Long, Long> getLocalIntegrationByCustomerList(List<Long> customerIdList) {
        LambdaQueryWrapper<Integration> lqw = new LambdaQueryWrapper<>();
        if (!CollectionUtils.isEmpty(customerIdList)) {
            lqw.in(Integration::getCustomerId, customerIdList);
        }
        lqw.eq(Integration::getType, IntegrationType.ADD.getValue());
        lqw.eq(Integration::getState, IntegrationState.EFFECTIVE.getValue());
        lqw.orderByAsc(Integration::getEndTime);
        List<Integration> list = list(lqw);
        if (CollectionUtils.isEmpty(list)) {
            return new HashMap<>();
        }
        List<Integration> updList = new ArrayList<>();
        list.forEach(s -> {
            if (!getIntegrationState(s)) {
                s.setState(IntegrationState.EXPIRE.getValue());
                updList.add(s);
            }
        });
        if (!CollectionUtils.isEmpty(updList)) {
            updateBatchById(updList);
        }
        return list.stream().filter(s -> IntegrationState.EFFECTIVE.getValue().equals(s.getState())).collect(Collectors.groupingBy(Integration::getCustomerId, Collectors.collectingAndThen(Collectors.toList(), v -> v.stream().mapToLong(Integration::getNormalScore).sum())));
    }

    /**
     * 获取积分状态
     *
     * @param integration
     * @return
     */
    private boolean getIntegrationState(Integration integration) {
        LocalDate today = LocalDate.now();
        return (integration.getEndTime() == null || integration.getEndTime().isAfter(today)) && integration.getNormalScore() != 0;
    }

    //抽奖概率规则使用的参数
    private static final Random random = new Random();
    private static final BigDecimal HUNDRED = new BigDecimal("100");
    private static final BigDecimal THREE_HUNDRED = new BigDecimal("300");

    @Transactional(rollbackFor = Exception.class)
    public Long prizeDraw(Long orderId) {
        LambdaQueryWrapper<Integration> lqw = new LambdaQueryWrapper<>();
        lqw.eq(Integration::getOrderId, orderId);
        lqw.eq(Integration::getType, IntegrationType.ADD.getValue());
        lqw.isNull(Integration::getNewCustomerId);
        Integration onlyOne = getOnlyOne(lqw);
        if (!ObjectUtils.isEmpty(onlyOne)) {
            throw new BusinessException("此订单已经抽过奖，不允许重复参与");
        }
        Order order = orderService.getById(orderId);
        if (ObjectUtils.isEmpty(order)) {
            throw new BusinessException("此订单不存在，无法参与抽奖");
        }
        if (!OrderState.PAID_COMMENTED.getValue().equals(order.getState()) && !OrderState.PAID_NOT_COMMENT.getValue().equals(order.getState())) {
            throw new BusinessException("此订单未付款，无法参与抽奖");
        }
        BigDecimal payAmount = BigDecimal.ZERO;
        if (OrderPayType.WECHAT.getValue().equals(order.getPayType())) {
            payAmount = order.getPayAmount();
        } else if (OrderPayType.COUPON.getValue().equals(order.getPayType())) {
            List<CustomerCoupon> customerCoupons = customerCouponService.listByUseOrderId(order.getId());
            payAmount = customerCoupons.stream().map(CustomerCoupon::getAmount).reduce(BigDecimal.ZERO, BigDecimal::add);
        }
        Long customerId = order.getCustomerId();
        Long points = getPoints(payAmount);
        // 一单只能抽一次，用订单号做稳定幂等键，重复提交不会重复入账
        addIntegration(points, orderId, customerId, "评价抽奖", "ql-draw:" + orderId);
        return points;
    }

    public static Long getPoints(BigDecimal payAmount) {
        int randomPercent = random.nextInt(100);
        if (payAmount.compareTo(THREE_HUNDRED) > 0) {
            if (randomPercent < 50) {
                return 10L;
            } else if (randomPercent < 90) {
                return 6L;
            } else {
                return 3L;
            }
        } else if (payAmount.compareTo(HUNDRED) >= 0) {
            if (randomPercent < 10) {
                return 10L;
            } else if (randomPercent < 60) {
                return 6L;
            } else if (randomPercent < 90) {
                return 3L;
            } else {
                return 1L;
            }
        } else {
            if (randomPercent < 10) {
                return 6L;
            } else if (randomPercent < 40) {
                return 3L;
            } else {
                return 1L;
            }
        }
    }

    /**
     * 下发拉新积分（20分，暂未明确过期时间）
     *
     * @param customerId    推荐人id
     * @param newCustomerId 被推荐的新客户id
     * @param orderId       新客户消费的订单id
     */
    public void addReferrerScore(Long customerId, Long newCustomerId, Long orderId) {
        JSONObject jsonObject = new JSONObject();
        jsonObject.put("customerId", customerId);
        jsonObject.put("newCustomerId", newCustomerId);
        jsonObject.put("orderId", orderId);
        addReferrerScoreBatch(Collections.singletonList(jsonObject));
    }

    /**
     * 批量下发拉新积分
     *
     * @param dataList
     */
    public void addReferrerScoreBatch(List<JSONObject> dataList) {
        if (CollectionUtils.isEmpty(dataList)) {
            return;
        }
        LambdaQueryWrapper<Integration> queryWrapper = new LambdaQueryWrapper<>();
        queryWrapper.eq(Integration::getType, IntegrationType.ADD.getValue());
        List<JSONObject> finalDataList = dataList;
        queryWrapper.and(lqw -> finalDataList.forEach(s -> {
            Long customerId = s.getLong("customerId");
            Long newCustomerId = s.getLong("newCustomerId");
            lqw.or(v -> v.eq(Integration::getCustomerId, customerId).eq(Integration::getNewCustomerId, newCustomerId));
        }));
        List<Integration> list = list(queryWrapper);
        Set<String> existingKeys = list.stream()
                .map(integration -> integration.getCustomerId() + "-" + integration.getNewCustomerId())
                .collect(Collectors.toSet());
        Set<String> distinctKeys = new HashSet<>();
        dataList = dataList.stream().filter(s -> {
            String key = s.getLong("customerId") + "-" + s.getLong("newCustomerId");
            if (distinctKeys.contains(key)) {
                return false;
            }
            distinctKeys.add(key);
            s.put("score", 20L);
            s.put("comment", "邀请新客奖励");
            s.put("type", IntegrationType.ADD.getValue());
            s.put("ref", "ql-referrer:" + s.getLong("customerId") + "-" + s.getLong("newCustomerId"));
            return !existingKeys.contains(key);
        }).collect(Collectors.toList());
        addIntegrationBatch(dataList);
    }

    /**
     * 加上订单id
     *
     * @param id
     * @param orderId
     */
    public void setOrderId(Long id, Long orderId) {
        LambdaUpdateWrapper<Integration> luw = new LambdaUpdateWrapper<>();
        luw.eq(Integration::getId, id);
        luw.set(Integration::getOrderId, orderId);
        update(luw);
    }

    /**
     * 导入
     *
     * @param file
     */
    public void importAdd(MultipartFile file) {
        List<Map<Integer, String>> mapList = ExcelUtil.doReadExcelMapList(file, 0, 0);
        Integer phoneKey = null;
        Integer scoreKey = null;
        Integer commentKey = null;
        List<JSONObject> jsonObjectList = new ArrayList<>();
        for (int i = 0; i < mapList.size(); i++) {
            Map<Integer, String> map = mapList.get(i);
            if (i == 0) {
                for (Integer key : map.keySet()) {
                    String value = map.get(key);
                    if ("手机号".equals(value)) {
                        phoneKey = key;
                    } else if ("变动积分数".equals(value)) {
                        scoreKey = key;
                    } else if ("变动原因".equals(value)) {
                        commentKey = key;
                    }
                }
                if (phoneKey == null) {
                    throw new BusinessException("未检测到[手机号]列存在，导入失败");
                }
                if (scoreKey == null) {
                    throw new BusinessException("未检测到[变动积分数]列存在，导入失败");
                }
                if (commentKey == null) {
                    throw new BusinessException("未检测到[变动原因]列存在，导入失败");
                }
                continue;
            }

            String phone = map.get(phoneKey);
            String score = map.get(scoreKey);
            String comment = map.get(commentKey);
            if (StringUtils.isEmpty(phone) || StringUtils.isEmpty(score) || StringUtils.isEmpty(comment)) {
                continue;
            }
            try {
                Customer customer = customerService.getByPhone(phone);
                if (ObjectUtils.isEmpty(customer)) {
                    customer = customerService.initCustomer(phone);
                    customerService.save(customer);
                }
                if (!NumberUtils.isCreatable(score)) {
                    score = score.replaceAll("积分", "");
                }
                JSONObject jsonObject = new JSONObject();
                jsonObject.put("customerId", customer.getId());
                jsonObject.put("comment", comment);
                Integer intScore = Integer.parseInt(score);
                if (intScore > 0) {
                    jsonObject.put("type", IntegrationType.ADD.getValue());
                    jsonObject.put("score", intScore);
                } else if (intScore < 0) {
                    jsonObject.put("type", IntegrationType.SUBTRACT.getValue());
                    jsonObject.put("score", intScore * -1);
                } else {
                    throw new BusinessException("积分异常");
                }
                jsonObjectList.add(jsonObject);
            } catch (Exception e) {
                log.error("积分赠予失败，phone={}，msg={}", phone, e.getMessage());
            }
        }
        if (CollectionUtils.isEmpty(jsonObjectList)) {
            return;
        }
        addIntegrationBatch(jsonObjectList);
    }

    /**
     * 积分变动通知
     *
     * @param list
     */
    public void handleChangeIntegrationNotice(List<Integration> list) {
        List<Long> customerIdList = list.stream().map(Integration::getCustomerId).collect(Collectors.toList());
        Map<Long, Long> integrationMap = getIntegrationByCustomerList(customerIdList);
        list.forEach(s -> {
            if (!IntegrationType.ADD.getValue().equals(s.getType())) {
                return;
            }
            Long customerId = s.getCustomerId();
            Map<String, String> map = new HashMap<>();
            map.put("", DateUtil.toStandString(s.getCreateTime()));
            map.put("", "+" + s.getScore());
            map.put("", s.getComment());
            map.put("", String.valueOf(integrationMap.get(customerId)));
            map.put("", "可在购买卡券时无门槛使用，1积分=1元钱");
            wxMpTemplateMessageService.handleChangeIntegrationNotice(map, customerId);
        });
    }

    /****
     * 获取客户即将失效的积分
     */
    public  long getInvalidIntegration(long customerId) {
        // 会员中心不按自然年过期，本地过期时间不再代表可用余额的有效期
        if (crmSyncService.isActive()) {
            return 0L;
        }
        LambdaQueryWrapper<Integration> lqw = new LambdaQueryWrapper<>();
        lqw.eq(Integration::getCustomerId,customerId);
        lqw.eq(Integration::getType, IntegrationType.ADD.getValue());
        lqw.eq(Integration::getState, IntegrationState.EFFECTIVE.getValue());
        lqw.orderByAsc(Integration::getEndTime);
        List<Integration> list = list(lqw);
        if (CollectionUtils.isEmpty(list)) {
            return 0L;
        }
        List<Integration> updList = new ArrayList<>();
        list.forEach(s -> {
            if (!getIntegrationNowEndTime(s)) {
                updList.add(s);
            }
        });
        return updList.stream()
                .filter(s -> IntegrationState.EFFECTIVE.getValue().equals(s.getState()))
                .mapToLong(Integration::getNormalScore)
                .sum(); // 将 long 转换为 int
    }

    /**
     * 获取今年过期时间的积分
     *
     * @param integration
     * @return
     */
    private boolean getIntegrationNowEndTime(Integration integration) {
        LocalDate today = LocalDate.now();
        LocalDate nextYearFirstDay = today.plusYears(1).withDayOfYear(1);
        return (integration.getEndTime() == null || integration.getEndTime().isAfter(nextYearFirstDay)) && integration.getNormalScore() != 0;
    }
    //检查4月8号之后注册的会员是否赠送了66积分
    public Integration checkIntegrationExist66(Long score, Long customerId, String comment) {
        LambdaQueryWrapper<Integration> lqw = new LambdaQueryWrapper<>();
        lqw.eq(Integration::getScore, score);
        lqw.eq(Integration::getCustomerId, customerId);
        lqw.eq(Integration::getComment, comment);
        return getOnlyOne(lqw);
    }

}