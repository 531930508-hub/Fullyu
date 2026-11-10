package com.macro.mall.service;

import cn.hutool.core.util.ObjUtil;
import com.alibaba.fastjson2.JSONArray;
import com.alibaba.fastjson2.JSONObject;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.github.pagehelper.PageInfo;
import com.macro.mall.common.exception.BusinessException;
import com.macro.mall.consts.NormalConst;
import com.macro.mall.dto.UpdateCustomerCouponDto;
import com.macro.mall.entity.*;
import com.macro.mall.enums.*;
import com.macro.mall.mapper.CustomerCouponMapper;
import com.macro.mall.service.base.BaseService;
import com.macro.mall.service.base.WrapperBuilder;
import com.macro.mall.utils.DateUtil;
import org.apache.poi.hpsf.Decimal;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.CollectionUtils;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * 客户券 服务类
 *
 * @author ST
 * @date 2025/06/03
 */
@Service
public class CustomerCouponService extends BaseService<CustomerCouponMapper, CustomerCoupon> {
    @Autowired
    @Lazy
    ProductService productService;
    @Autowired
    @Lazy
    CouponService couponService;
    @Autowired
    @Lazy
    OrderService orderService;
    @Autowired
    @Lazy
    private GiveGiftService giveGiftService;
    @Autowired
    @Lazy
    WxMpTemplateMessageService wxMpTemplateMessageService;
    @Autowired
    @Lazy
    PrepaidMemberRewardService prepaidMemberRewardService;

    @Override
    protected QueryWrapper<CustomerCoupon> buildWrapper(Map<String, Object> params, QueryWrapper<CustomerCoupon> queryWrapper) {
        Object lxT = params.get("lxt");//这个条件是合并数据用的
        if (lxT != null) {
            queryWrapper.eq("old_data", params.get("old_data"));
            queryWrapper.eq("hebing_status", params.get("hebing_status"));
            Object customerId=params.get("customer_id");
            if (customerId != null) {
                queryWrapper.eq("customer_id", params.get("customer_id"));
            }else{
                queryWrapper.isNotNull("customer_id");
                queryWrapper.notIn("customer_id",0);
            }
            queryWrapper.orderByAsc("customer_id");
        }else{
            queryWrapper.orderByAsc("CASE WHEN state = 1 THEN 0 ELSE 1 END");
            queryWrapper.orderByAsc("end_time");
        }
        Object effectiveObj = params.get("effective");
        if (effectiveObj != null) {
            queryWrapper.ge("end_time", LocalDate.now());
        }

        return WrapperBuilder.init(queryWrapper, params)
                .equal("customer_id")
                .in("state")
                .in("use_type")
                .getQueryWrapper();
    }

    /**
     * 分页
     *
     * @return
     */
    public PageInfo pageInfo(Map<String, Object> params) {
        PageInfo<CustomerCoupon> page = page(params);
        buildCoupon(page.getList());
        return page;
    }

    /**
     * 生成客户券(仅限客户自己买的调用)
     */
    @Transactional(rollbackFor = Exception.class)
    public void buildCouponList(Long orderId, Long productId, Long customerId, Boolean isGift, Integer quantity, BigDecimal payAmount) {
        List<JSONObject> jsonObjectList = productService.getProductContent(productId);
        if (CollectionUtils.isEmpty(jsonObjectList)) {
            return;
        }
        Product product = productService.getById(productId);
        // 多实例下JVM锁无效：用订单行条件更新领取"发券权"。UPDATE是当前读，不受RR快照影响；
        // 并发回调会在行锁上排队，前者提交后后者匹配0行，直接视为已发放。
        boolean claimed = orderService.update(new LambdaUpdateWrapper<Order>()
                .setSql("coupon_issued = 1")
                .eq(Order::getId, orderId)
                .apply("coupon_issued = 0"));
        if (!claimed) {
            log.warn("订单：" + orderId + "，券包已发放或订单不存在，忽略重复支付回调");
            return;
        }
        Order sourceOrder = orderService.getOne(new LambdaQueryWrapper<Order>()
                .eq(Order::getId, orderId).last("FOR UPDATE"));
        if (product == null || sourceOrder == null) throw new BusinessException("券包购买订单不存在");
        int months = product.getRewardMemberMonths() == null ? 0 : product.getRewardMemberMonths();
        if (months < 0 || months > 120) throw new BusinessException("赠送会员配置不正确");
        sourceOrder.setRewardMemberMonths(Integer.valueOf(1).equals(product.getType()) ? months : 0);
        if (!orderService.updateById(sourceOrder)) throw new BusinessException("保存券包权益快照失败");
        Map<Long, Coupon> validDateMap = couponService.getCouponMap(jsonObjectList.stream().map(s -> s.getLong("couponId")).collect(Collectors.toList()));
        List<CustomerCoupon> list = new ArrayList<>();
        jsonObjectList.forEach(jsonObject -> {
            Long couponId = jsonObject.getLong("couponId");
            if (couponId == null) {
                return;
            }
            Integer size = jsonObject.getInteger("size");
            int couponSize = size * quantity;
            Coupon coupon = validDateMap.get(couponId);
            if (NormalState.INVALID.getValue().equals(coupon.getState())) {
                log.warn("订单：" + orderId + ",添加权益卡失败,[" + coupon.getTitle() + "]已下架");
                return;
            }
            BigDecimal amount = BigDecimal.ZERO;
            if (coupon.getUseType() == 0 && !BigDecimal.ZERO.equals(payAmount)) {
                amount = payAmount.divide(BigDecimal.valueOf(couponSize), 2, BigDecimal.ROUND_DOWN);
            }
            List<CustomerCoupon> customerCouponList = buildBatch(couponSize, couponId, customerId, CustomerCouponType.PAID, coupon.getValidDate(), orderId, amount, isGift);
            if (CollectionUtils.isEmpty(customerCouponList)) {
                return;
            }
            list.addAll(customerCouponList);
        });
        if (CollectionUtils.isEmpty(list) || !saveBatch(list)) throw new BusinessException("购买券包权益保存失败");

        if (Boolean.TRUE.equals(isGift)) {
            giveGiftService.createGift(list, orderId, customerId);
        }
    }

    /**
     * 修改客户券状态
     *
     * @param idList
     * @param state
     */
    public List<CustomerCoupon> changeCouponStateBatch(List<Long> idList, Integer state) {
        if (CollectionUtils.isEmpty(idList)) {
            return Collections.emptyList();
        }
        List<CustomerCoupon> customerCouponList = listByIds(idList);
        if (CouponState.GIVE.getValue().equals(state)) {
            customerCouponList = customerCouponList.stream().filter(s -> CouponState.EFFECTIVE.getValue().equals(s.getState())).collect(Collectors.toList());
        }
        customerCouponList.forEach(s -> s.setState(state));
        updateBatchById(customerCouponList);
        return customerCouponList;
    }

    /**
     * 改变客户券归属
     *
     * @param idList
     * @param customerId
     */
    public void changeCustomerIdBatch(List<Long> idList, Long customerId) {
        changeCustomerIdBatch(idList, customerId, false);
    }

    public void changeCustomerIdBatch(List<Long> idList, Long customerId, Boolean isRecv) {
        List<CustomerCoupon> customerCouponList = listByIds(idList);
        customerCouponList.forEach(s -> {
            s.setCustomerId(customerId);
            if (isRecv) {
                s.setIsCanGift(false);
            }
        });
        verifyEndTime(customerCouponList);
    }

    /**
     * 使用客户券
     *
     * @param couponSize 使用券张数
     * @return 使用情况 券id
     */
    public List<Long> useCoupon(Integer couponSize, Long customerId, Long orderId) {
        if (couponSize == 0) {
            return new ArrayList<>();
        }
        LambdaQueryWrapper<CustomerCoupon> lqw = new LambdaQueryWrapper<>();
        lqw.eq(CustomerCoupon::getCustomerId, customerId);
        lqw.eq(CustomerCoupon::getUseType, CouponUseType.CASH.getValue());
        lqw.eq(CustomerCoupon::getState, CouponState.EFFECTIVE.getValue());
        lqw.ge(CustomerCoupon::getEndTime, LocalDate.now());
        lqw.orderByAsc(Arrays.asList(CustomerCoupon::getEndTime, CustomerCoupon::getOrderId));
        List<CustomerCoupon> availableCouponList = list(lqw);
        if (CollectionUtils.isEmpty(availableCouponList) || availableCouponList.size() < couponSize) {
            throw new BusinessException("券包不足");
        }
        List<CustomerCoupon> userCoupons = availableCouponList.subList(0, couponSize);
        LocalDateTime now = LocalDateTime.now();
        userCoupons.forEach(s -> {
            s.setState(CouponState.INVALID.getValue());
            s.setUseOrder(orderId);
            s.setUseTime(now);
            s.setIsCanGift(false);
        });
        if (!updateBatchById(userCoupons)) throw new BusinessException("券包消费状态保存失败");
        return userCoupons.stream().map(CustomerCoupon::getId).collect(Collectors.toList());
    }

    /**
     * 根据使用的订单赠券
     *
     * @param orderIdList
     */
    @Transactional(rollbackFor = Exception.class)
    public void giveCouponOrderIdList(List<Long> orderIdList) {
        if (CollectionUtils.isEmpty(orderIdList)) {
            return;
        }
        prepaidMemberRewardService.onCompletedOrders(orderIdList);
        LambdaQueryWrapper<CustomerCoupon> lqw = new LambdaQueryWrapper<>();
        lqw.eq(CustomerCoupon::getUseType, CouponUseType.CASH.getValue());
        lqw.eq(CustomerCoupon::getState, CouponState.INVALID.getValue());
        lqw.isNotNull(CustomerCoupon::getOrderId);
        lqw.in(CustomerCoupon::getUseOrder, orderIdList);
        lqw.select(CustomerCoupon::getOrderId, CustomerCoupon::getCustomerId);
        List<CustomerCoupon> userCouponList = list(lqw);
        if (CollectionUtils.isEmpty(userCouponList)) {
            return;
        }
        Map<Long, List<CustomerCoupon>> listMap = userCouponList.stream().collect(Collectors.groupingBy(CustomerCoupon::getOrderId));
        List<CustomerCoupon> customerCoupons = new ArrayList<>();
        listMap.forEach((k, v) -> {
            if (CollectionUtils.isEmpty(v)) {
                return;
            }
            CustomerCoupon customerCoupon = v.get(0);
            Long customerId = customerCoupon.getCustomerId();
            List<Long> orderIds = v.stream().filter(s -> s.getOrderId() != null).map(CustomerCoupon::getOrderId).distinct().collect(Collectors.toList());
            Integer couponNumber = verifyGiveCouponOrderIdList(orderIds);
            if (couponNumber == 0) {
                return;
            }
            customerCoupons.addAll(buildBatch(couponNumber, customerId, CustomerCouponType.VIP));
        });
        if (CollectionUtils.isEmpty(customerCoupons)) {
            return;
        }
        saveBatch(customerCoupons);
    }

    /**
     * 校验订单下的会员券是否在一个月内用完
     *
     * @param orderIdList 已用券的订单idList
     */
    private Integer verifyGiveCouponOrderIdList(List<Long> orderIdList) {
        if (CollectionUtils.isEmpty(orderIdList)) {
            return 0;
        }
        LambdaQueryWrapper<CustomerCoupon> lqw = new LambdaQueryWrapper<>();
        lqw.in(CustomerCoupon::getOrderId, orderIdList);
        List<CustomerCoupon> list = list(lqw);
        List<CustomerCoupon> vipCardList = list.stream()
                .filter(s -> (CouponState.EFFECTIVE.getValue().equals(s.getState()) || CouponState.EXPIRE.getValue().equals(s.getState())) && CouponUseType.VIP.getValue().equals(s.getUseType()))
                .collect(Collectors.toList());
        if (CollectionUtils.isEmpty(vipCardList)) {
            return 0;
        }
        Set<Long> vipCardOrderIdSet = vipCardList.stream().map(CustomerCoupon::getOrderId).collect(Collectors.toSet());
        //去掉会员卡记录
        list = list.stream().filter(s -> vipCardOrderIdSet.contains(s.getOrderId()) && !CouponUseType.VIP.getValue().equals(s.getUseType())).collect(Collectors.toList());
        //检查会员卡下边的卡卷是否有未使用的状态
        Set<Long> noFinishOrderIdSet = list.stream().filter(s -> CouponState.EFFECTIVE.getValue().equals(s.getState())).map(CustomerCoupon::getOrderId).collect(Collectors.toSet());
        //
        List<Long> useOrderIdList = list.stream().filter(s -> !noFinishOrderIdSet.contains(s.getOrderId())).map(CustomerCoupon::getUseOrder).distinct().collect(Collectors.toList());
        //检查是否有未完成的卡卷订单
        Map<Long, Integer> orderStateMap = orderService.getOrderStateMapByIdList(useOrderIdList);
        list.forEach(s -> {
            Integer orderState = orderStateMap.getOrDefault(s.getUseOrder(), null);
            if (AppointmentState.FINISHED.getValue().equals(orderState)) {
                return;
            }
            noFinishOrderIdSet.add(s.getOrderId());
        });
        vipCardOrderIdSet.removeAll(noFinishOrderIdSet);
        if (CollectionUtils.isEmpty(vipCardOrderIdSet)) {
            return 0;
        }
        LocalDate now = LocalDate.now();
        Set<Long> finishOrderIdSet = list.stream()
                .filter(s -> vipCardOrderIdSet.contains(s.getOrderId()))
                .collect(Collectors.groupingBy(CustomerCoupon::getOrderId))
                .values().stream()
                .map(group -> group.stream()
                        .filter(coupon -> coupon.getUseTime() != null)
                        .min(Comparator.comparing(CustomerCoupon::getUseTime))
                        .filter(coupon -> {
                            LocalDate firstUseDate = DateUtil.stringToLocalDate(DateUtil.toYYYYMMDD(coupon.getUseTime()));
                            return DateUtil.diffDays(firstUseDate, now) < 30;
                        })
                        .orElse(null))
                .filter(Objects::nonNull)
                .map(CustomerCoupon::getOrderId)
                .collect(Collectors.toSet());
        if (CollectionUtils.isEmpty(finishOrderIdSet)) {
            return 0;
        }
        List<CustomerCoupon> couponList = vipCardList.stream()
                .filter(s -> finishOrderIdSet.contains(s.getOrderId()))
                .collect(Collectors.toList());
        Integer sum = couponList.stream()
                .filter(Objects::nonNull)
                .map(CustomerCoupon::getMinutes).reduce(0, Integer::sum);
        couponList.forEach(s -> s.setState(CouponState.INVALID.getValue()));
        updateBatchById(couponList);
        if (sum == 0) {
            return 0;
        }
        return sum / NormalConst.PER_COUPON_COST_MINUTES;
    }

    /**
     * 送券
     *
     * @param couponNumber
     * @param customerId
     * @param type
     * @param couponId
     * @param giftCustomerCouponId
     * @param startTime
     * @param endTime
     */
    @Transactional(rollbackFor = Exception.class)
    public void giveCoupon(Integer couponNumber, Long customerId, CustomerCouponType type, Long couponId, Long giftCustomerCouponId, LocalDate startTime, LocalDate endTime) {
        giveCoupon(couponNumber, customerId, type, couponId, giftCustomerCouponId, startTime, endTime, BigDecimal.ZERO);
    }

    @Transactional(rollbackFor = Exception.class)
    public void giveCoupon(Integer couponNumber, Long customerId, CustomerCouponType type, Long couponId, Long giftCustomerCouponId, LocalDate startTime, LocalDate endTime, BigDecimal couponAmount) {
        int count = couponNumber == null ? 1 : couponNumber;
        BigDecimal unitAmount = couponAmount == null ? BigDecimal.ZERO : couponAmount;
        if (count < 1 || count > 10000 || unitAmount.signum() < 0
                || unitAmount.stripTrailingZeros().scale() > 2
                || unitAmount.compareTo(new BigDecimal("99999999.99")) > 0)
            throw new BusinessException("赠券数量或单券价值不正确");
        List<CustomerCoupon> list = buildBatch(count, couponId, customerId, type, null, null, unitAmount, false);
        if (CollectionUtils.isEmpty(list)) throw new BusinessException("赠券权益未生成");
        list.forEach(s -> {
            s.setGiftCustomerCouponId(giftCustomerCouponId);
            s.setStartTime(startTime);
            s.setEndTime(endTime);
        });
        if (!saveBatch(list)) throw new BusinessException("赠券权益保存失败");
    }

    /**
     * 送券
     *
     * @param couponNumber
     * @param customerId
     * @param type
     */
    public void giveCoupon(Integer couponNumber, Long customerId, CustomerCouponType type) {
        if (couponNumber == null) {
            couponNumber = 1;
        }
        List<CustomerCoupon> list = buildBatch(couponNumber, NormalConst.GIVE_COUPON_ID, customerId, type, NormalConst.GIVE_COUPON_VALID_DATE, null, BigDecimal.ZERO, false);
        if (CollectionUtils.isEmpty(list)) {
            return;
        }
        saveBatch(list);
    }

    public void giveCoupon(GiftCard giftCard) {
        BigDecimal amount = giftCard.getAmount();
        Integer number = giftCard.getNumber();
        if (amount != null && amount.compareTo(BigDecimal.ZERO) > 0) {
            amount = amount.divide(BigDecimal.valueOf(number), 2, BigDecimal.ROUND_DOWN);
        }
        List<CustomerCoupon> list = buildBatch(number, giftCard.getCouponId(), giftCard.getCustomerId(), CustomerCouponType.GIFT_CARD, giftCard.getValidDate(), null, amount, false);
        if (CollectionUtils.isEmpty(list)) {
            return;
        }
        saveBatch(list);
    }

    /**
     * 批量生成送券列表
     *
     * @param couponNumber
     * @param customerId
     * @param type
     */
    public List<CustomerCoupon> buildBatch(Integer couponNumber, Long customerId, CustomerCouponType type) {
        if (couponNumber == null) {
            couponNumber = 1;
        }
        return buildBatch(couponNumber, NormalConst.GIVE_COUPON_ID, customerId, type, NormalConst.GIVE_COUPON_VALID_DATE, null, BigDecimal.ZERO, false);
    }

    /**
     * 批量生成券
     *
     * @param couponNumber
     * @param couponId
     * @param customerId
     * @param type
     * @param validDate
     * @param orderId
     * @param amount
     * @param isGift
     */
    public List<CustomerCoupon> buildBatch(Integer couponNumber, Long couponId, Long customerId, CustomerCouponType type, Integer validDate, Long orderId, BigDecimal amount, Boolean isGift) {
        Coupon coupon = couponService.getById(couponId);
        if (coupon == null) throw new BusinessException("赠券对应的券不存在");
        Order order = orderId == null ? null : orderService.getById(orderId);
        LocalDate today = LocalDate.now();
        List<CustomerCoupon> list = new ArrayList<>();
        for (int i = 0; i < couponNumber; i++) {
            CustomerCoupon customerCoupon = new CustomerCoupon();
            if (orderId != null) {
                customerCoupon.setOrderId(orderId);
            }
            if (amount != null) {
                customerCoupon.setAmount(amount);
            }
            if (!isGift) {
                if (customerId != null) {
                    customerCoupon.setCustomerId(customerId);
                }
            } else {
                customerCoupon.setState(CouponState.GIVE.getValue());
            }
            //给会员卡增加封面，从订单表里读取cardimage
            if(!Objects.isNull(order)){
                customerCoupon.setCardimage(order.getCardimage());
            }
            customerCoupon.setType(type.getValue());
            customerCoupon.setCouponId(coupon.getId());
            customerCoupon.setUseType(coupon.getUseType());
            customerCoupon.setIsCanGift(isGift);
            customerCoupon.setStartTime(today);
            customerCoupon.setMinutes(coupon.getMinutes());
            if (validDate == null || validDate == -1 || validDate == 0 || validDate > 10000) {
                customerCoupon.setEndTime(LocalDate.of(9999, 12, 31));
            } else {
                customerCoupon.setEndTime(today.plusDays(validDate - 1));
            }
            list.add(customerCoupon);
        }
        return list;
    }

    public List<CustomerCoupon> listByOrderId(Long orderId) {
        LambdaQueryWrapper<CustomerCoupon> lqw = new LambdaQueryWrapper<>();
        lqw.eq(CustomerCoupon::getOrderId, orderId);
        return list(lqw);
    }

    public void buildCoupon(List<CustomerCoupon> customerCoupons) {
        if (CollectionUtils.isEmpty(customerCoupons)) {
            return;
        }
        List<Long> couponIds = customerCoupons.stream().filter(e -> !ObjUtil.isEmpty(e.getCouponId())).map(CustomerCoupon::getCouponId).collect(Collectors.toList());
        if (CollectionUtils.isEmpty(couponIds)) {
            return;
        }
        List<Coupon> couponList = couponService.listByIds(couponIds);
        if (CollectionUtils.isEmpty(couponList)) {
            return;
        }
        Map<Long, Coupon> couponMap = couponList.stream().collect(Collectors.toMap(Coupon::getId, Function.identity()));
        customerCoupons.forEach(e -> {
            e.setCode(String.format("%010d", e.getId()));
            Long couponId = e.getCouponId();
            if (!ObjUtil.isEmpty(couponId)) {
                Coupon coupon = couponMap.get(couponId);
                e.setCoupon(coupon);
                e.setCouponTitle(coupon.getTitle());
            }
            e.setTypeLabel(CustomerCouponType.valueToLabel(e.getType()));
        });

    }

    /**
     * 代金券数量
     *
     * @param customerIdList
     * @return
     */
    public Map<Long, Integer> getCouponCountMap(List<Long> customerIdList) {
        if (CollectionUtils.isEmpty(customerIdList)) {
            return Collections.emptyMap();
        }
        LambdaQueryWrapper<CustomerCoupon> lqw = new LambdaQueryWrapper<>();
        lqw.in(CustomerCoupon::getCustomerId, customerIdList);
        lqw.eq(CustomerCoupon::getUseType, CouponUseType.CASH.getValue());
        lqw.eq(CustomerCoupon::getState, CouponState.EFFECTIVE.getValue());
        lqw.ge(CustomerCoupon::getEndTime, LocalDate.now());
        List<CustomerCoupon> list = list(lqw);
        if (CollectionUtils.isEmpty(list)) {
            return Collections.emptyMap();
        }
        return list.stream().collect(Collectors.groupingBy(CustomerCoupon::getCustomerId, Collectors.collectingAndThen(Collectors.toList(), List::size)));
    }

    /**
     * 代金券数量
     *
     * @param customerId
     * @return
     */
    public Integer getCouponCountByCustomerId(Long customerId) {
        if (customerId == null) {
            return 0;
        }
        Map<Long, Integer> map = getCouponCountMap(Collections.singletonList(customerId));
        return map.getOrDefault(customerId, 0);
    }

    /**
     * 订单退款时，回退优惠券
     *
     * @param order
     */
    public void handleRefund(Order order) {
        if (order == null) {
            throw new BusinessException("订单不存在");
        }
        String useCouponMap = order.getUseCouponMap();
        List<Long> idList = JSONArray.parseArray(useCouponMap, Long.class);
        List<CustomerCoupon> couponList = listByIds(idList);
        verifyEndTime(couponList);
    }

    /**
     * 验证是否过期
     *
     * @param couponList
     */
    public void verifyEndTime(List<CustomerCoupon> couponList) {
        if (CollectionUtils.isEmpty(couponList)) {
            throw new BusinessException("优惠券不存在");
        }
        LocalDate today = LocalDate.now();
        couponList.forEach(s -> {
            LocalDate endTime = s.getEndTime();
            if (endTime != null && endTime.isBefore(today)) {
                s.setState(CouponState.EXPIRE.getValue());
            } else {
                s.setState(CouponState.EFFECTIVE.getValue());
            }
        });
        updateBatchById(couponList);
    }

    public List<CustomerCoupon> listByUseOrderId(Long id) {
        LambdaQueryWrapper<CustomerCoupon> lqw = new LambdaQueryWrapper<>();
        lqw.eq(CustomerCoupon::getUseOrder, id);
        return list(lqw);
    }

    /**
     * 定时验证券是否过期
     */
    public void verifyEndTimeScheduled() {
        LocalDate today = LocalDate.now();
        LambdaUpdateWrapper<CustomerCoupon> luw = new LambdaUpdateWrapper<>();
        luw.eq(CustomerCoupon::getState, CouponState.EFFECTIVE.getValue());
        luw.isNotNull(CustomerCoupon::getEndTime);
        luw.lt(CustomerCoupon::getEndTime, today);
        luw.set(CustomerCoupon::getState, CouponState.EXPIRE.getValue());
        update(luw);
    }

    /**
     * 获取vip等级
     *
     * @param customerIdList
     * @return
     */
    public Map<Long, String> getCustomerVipLevelMap(List<Long> customerIdList) {
        if (CollectionUtils.isEmpty(customerIdList)) {
            return Collections.emptyMap();
        }
        LambdaQueryWrapper<CustomerCoupon> lqw = new LambdaQueryWrapper<>();
        lqw.select(CustomerCoupon::getCustomerId, CustomerCoupon::getCouponId);
        lqw.in(CustomerCoupon::getCustomerId, customerIdList);
        lqw.eq(CustomerCoupon::getUseType, CouponUseType.VIP.getValue());
        // lqw.ge(CustomerCoupon::getEndTime, LocalDate.now());
       // lqw.in(CustomerCoupon::getState, Arrays.asList(CouponState.INVALID.getValue(), CouponState.EFFECTIVE.getValue()));//获取未使用和已使用的会员卡
        lqw.in(CustomerCoupon::getState, Arrays.asList( CouponState.EFFECTIVE.getValue()));//只获取未使用的会员卡
        List<CustomerCoupon> list = list(lqw);
        if (CollectionUtils.isEmpty(list)) {
            return null;
        }
        Map<Long, Coupon> levelMap = couponService.getCouponLevelMap();
        return list.stream().filter(s -> {
            s.setCoupon(levelMap.getOrDefault(s.getCouponId(), null));
            return s.getCoupon() != null;
        }).collect(Collectors.groupingBy(
                CustomerCoupon::getCustomerId,
                Collectors.collectingAndThen(
                        Collectors.minBy(Comparator.comparingInt(s -> s.getCoupon().getVipLevel())),
                        maxCoupon -> maxCoupon.map(coupon -> coupon.getCoupon().getTitle()).orElse(null)
                )
        ));
    }

    /**
     * 获取vip等级
     *
     * @param customerId
     * @return
     */
    public String getVipLevelByCustomerId(Long customerId) {
        Map<Long, String> map = getCustomerVipLevelMap(Collections.singletonList(customerId));
        return map.getOrDefault(customerId, null);
    }

    /**
     * 订单优惠券使用金额
     *
     * @param orderIdList
     */
    public Map<Long, BigDecimal> getOrderCouponAmountMap(List<Long> orderIdList) {
        if (CollectionUtils.isEmpty(orderIdList)) {
            return Collections.emptyMap();
        }
        LambdaQueryWrapper<CustomerCoupon> lqw = new LambdaQueryWrapper<>();
        lqw.eq(CustomerCoupon::getState, 0);
        lqw.in(CustomerCoupon::getUseOrder, orderIdList);
        lqw.isNotNull(CustomerCoupon::getAmount);
        lqw.gt(CustomerCoupon::getAmount, BigDecimal.ZERO);
        lqw.select(CustomerCoupon::getAmount, CustomerCoupon::getUseOrder);
        List<CustomerCoupon> list = list(lqw);
        if (CollectionUtils.isEmpty(list)) {
            return Collections.emptyMap();
        }
        return list.stream().collect(Collectors.groupingBy(CustomerCoupon::getUseOrder, Collectors.mapping(CustomerCoupon::getAmount, Collectors.reducing(BigDecimal.ZERO, BigDecimal::add))));
    }

    /**
     * 订单优惠券使用金额
     *
     * @param orderId
     */
    public BigDecimal getCouponAmountByOrderId(Long orderId) {
        if (orderId == null) {
            return BigDecimal.ZERO;
        }
        Map<Long, BigDecimal> map = getOrderCouponAmountMap(Collections.singletonList(orderId));
        return map.getOrDefault(orderId, BigDecimal.ZERO);
    }

    /**
     * 批量修改
     *
     * @param updateCustomerCouponDto
     */
    public void updateBatch(UpdateCustomerCouponDto updateCustomerCouponDto) {
        List<Long> idList = updateCustomerCouponDto.getCustomerCouponIdList();
        if (CollectionUtils.isEmpty(idList)) {
            return;
        }
        changeCouponStateBatch(idList, updateCustomerCouponDto.getState());
    }

    /**
     * 无效券
     *
     * @param id
     */
    public void invalid(Long id) {
        changeCouponStateBatch(Collections.singletonList(id), CouponState.CANCEL.getValue());
    }

    /**
     * 送券过期通知
     */
    public void sendCouponExpiredNotice() {
        LocalDate now = LocalDate.now();
        LocalDate endTime = DateUtil.addDate(now, 7);
        String chineseDay = DateUtil.toChineseDay(DateUtil.toYYYYMMDD(endTime));

        LambdaQueryWrapper<CustomerCoupon> lqw = new LambdaQueryWrapper<>();
        lqw.eq(CustomerCoupon::getUseType, CouponUseType.CASH.getValue());
        lqw.eq(CustomerCoupon::getState, CouponState.EFFECTIVE.getValue());
        lqw.ne(CustomerCoupon::getType, CustomerCouponType.PAID.getValue());
        lqw.eq(CustomerCoupon::getEndTime, endTime);
        List<CustomerCoupon> list = list(lqw);
        if (CollectionUtils.isEmpty(list)) {
            return;
        }
        Map<String, Long> couponCountMap = list.stream()
                .collect(Collectors.groupingBy(
                        coupon -> coupon.getCustomerId() + "-" + coupon.getType(),
                        Collectors.counting()
                ));
        couponCountMap.forEach((key, count) -> {
            String[] parts = key.split("-");
            Long customerId = Long.valueOf(parts[0]);
            Integer type = Integer.valueOf(parts[1]);

            Map<String, String> map = new HashMap<>();
            map.put("first", "您有优惠券即将到期");
            map.put("keyword1", CustomerCouponType.valueToLabel(type));
            map.put("keyword2", String.valueOf(count));
            map.put("keyword3", chineseDay);
            map.put("remark", "您的赠券7天后到期，请及时到小程序预约相愈哦");

            wxMpTemplateMessageService.handleSendCouponExpiredNotice(map, customerId);
        });
    }

    /**
     * 会员权益通知
     */
    public void membershipRightsNotice() {
        LambdaQueryWrapper<CustomerCoupon> lqw = new LambdaQueryWrapper<>();
        lqw.eq(CustomerCoupon::getUseType, CouponUseType.VIP.getValue());
        lqw.in(CustomerCoupon::getState, Arrays.asList(CouponState.EFFECTIVE.getValue(), CouponState.EXPIRE.getValue()));
        lqw.gt(CustomerCoupon::getMinutes, 0);
        List<CustomerCoupon> vipCardList = list(lqw);
        if (CollectionUtils.isEmpty(vipCardList)) {
            return;
        }
        List<Long> orderIdList = vipCardList.stream().map(CustomerCoupon::getOrderId).collect(Collectors.toList());
        LambdaQueryWrapper<CustomerCoupon> lqw2 = new LambdaQueryWrapper<>();
        lqw2.in(CustomerCoupon::getOrderId, orderIdList);
        List<CustomerCoupon> list = list(lqw2);
        list = list.stream().filter(s -> !CouponUseType.VIP.getValue().equals(s.getUseType())).collect(Collectors.toList());
        Set<Long> noFinishOrderIdSet = list.stream().filter(s -> CouponState.EFFECTIVE.getValue().equals(s.getState())).map(CustomerCoupon::getOrderId).collect(Collectors.toSet());
        LocalDate now = LocalDate.now();
        Map<Long, Long> daysUsedMap = list.stream()
                .filter(s -> noFinishOrderIdSet.contains(s.getOrderId()))
                .collect(Collectors.groupingBy(CustomerCoupon::getOrderId))
                .entrySet().stream()
                .map(entry -> {
                    Long orderId = entry.getKey();
                    List<CustomerCoupon> couponGroup = entry.getValue();
                    LocalDateTime firstUseTime = couponGroup.stream()
                            .filter(coupon -> coupon.getUseTime() != null)
                            .min(Comparator.comparing(CustomerCoupon::getUseTime))
                            .map(CustomerCoupon::getUseTime)
                            .orElse(null);
                    LocalDate firstUseDate = DateUtil.stringToLocalDate(DateUtil.toYYYYMMDD(firstUseTime));
                    long daysUsed = (firstUseTime != null) ? DateUtil.diffDays(firstUseDate, now) : 0L;
                    return daysUsed < 30 ? new AbstractMap.SimpleEntry<>(orderId, daysUsed) : null;
                })
                .filter(Objects::nonNull)
                .collect(Collectors.toMap(AbstractMap.SimpleEntry::getKey, AbstractMap.SimpleEntry::getValue));

        Set<Long> normalOrderIdSet = daysUsedMap.keySet();
        List<CustomerCoupon> noticeCustomerList = new ArrayList<>();
        List<CustomerCoupon> expireList = new ArrayList<>();
        vipCardList.forEach(s -> {
            Long orderId = s.getOrderId();
            if (!normalOrderIdSet.contains(orderId)) {
                s.setMinutes(0);
                expireList.add(s);
                return;
            }
            Long time = daysUsedMap.getOrDefault(orderId, null);
            if (time == null) {
                return;
            }
            if (30L - time == 7) {
                noticeCustomerList.add(s);
            }
        });
        updateBatchById(expireList);
        if (CollectionUtils.isEmpty(noticeCustomerList)) {
            return;
        }
        List<Long> couponIds = noticeCustomerList.stream().map(CustomerCoupon::getCouponId).distinct().collect(Collectors.toList());
        List<Coupon> couponList = couponService.listByIds(couponIds);
        Map<Long, String> couponMap = new HashMap<>();
        if (!CollectionUtils.isEmpty(couponList)) {
            couponMap = couponList.stream().collect(Collectors.toMap(Coupon::getId, Coupon::getTitle));
        }
        LocalDate endTime = DateUtil.addDate(now, 7);
        String chineseDay = DateUtil.toChineseDay(DateUtil.toYYYYMMDD(endTime));
        Map<Long, String> finalCouponMap = couponMap;
        noticeCustomerList.forEach(s -> {
            String couponTitle = finalCouponMap.getOrDefault(s.getCouponId(), "大Fu翁");
            Map<String, String> map = new HashMap<>();
            map.put("", couponTitle);
            map.put("", "会员限时消费赠券");
            map.put("", chineseDay);
            map.put("", "Fu翁大人，赠券等你好久啦。用完存货，即解锁赠券哦！");
            wxMpTemplateMessageService.handleMembershipRightsNotice(map, s.getCustomerId());
        });
    }

    /****
     * 小程序获取用户所有代金券数量
     * @param customerId
     * @return
     */
    public Object getUserAllCouponCount(Long customerId) {
        if (customerId == null) {
            return 0;
        }
        Map<Long, Integer> map = getUserAllCouponCountMap(Collections.singletonList(customerId));
        return map.getOrDefault(customerId, 0);
    }
    /**
     * 小程序获取用户所有代金券数量
     *
     * @param customerIdList
     * @return
     */
    public Map<Long, Integer> getUserAllCouponCountMap(List<Long> customerIdList) {
        if (CollectionUtils.isEmpty(customerIdList)) {
            return Collections.emptyMap();
        }
        LambdaQueryWrapper<CustomerCoupon> lqw = new LambdaQueryWrapper<>();
        lqw.in(CustomerCoupon::getCustomerId, customerIdList);
        lqw.ne(CustomerCoupon::getUseType, CouponUseType.VIP.getValue());
        lqw.notIn(CustomerCoupon::getState, 4,5);
        List<CustomerCoupon> list = list(lqw);
        if (CollectionUtils.isEmpty(list)) {
            return Collections.emptyMap();
        }
        return list.stream().collect(Collectors.groupingBy(CustomerCoupon::getCustomerId, Collectors.collectingAndThen(Collectors.toList(), List::size)));
    }

    /**
     * 小程序获取用户最先试用的会员卡
     * @param customerId
     * @return
     */

    public Object getUserLastoneCoupon(Long customerId) {
        Map<String,String> singleCoupon=new HashMap<>();
        //会员卡名称
        String productName="";
        if (customerId == null) {
            singleCoupon.put("data","0");
            singleCoupon.put("percentageStr","0%");
            singleCoupon.put("couponTitle","");
            singleCoupon.put("couponComment","");
            return null;
        }
        LambdaQueryWrapper<CustomerCoupon> lqw = new LambdaQueryWrapper<>();
        lqw.eq(CustomerCoupon::getCustomerId, customerId);
        lqw.orderByAsc(CustomerCoupon::getCreateTime);
        List<CustomerCoupon> listAll= list(lqw);
        List<CustomerCoupon> list = list(lqw).stream().filter(s->s.getUseType()==CouponUseType.VIP.getValue()&&(s.getState().equals(0)||s.getState().equals(1)||s.getState().equals(2))).collect(Collectors.toList());
        if(list.size()>0){
            CustomerCoupon customerCoupon=new  CustomerCoupon();
            List<CustomerCoupon> list1=list.stream().filter(t->t.getState()==1||t.getState().equals(2)).collect(Collectors.toList());
            if(list1.size()>0){
                for (CustomerCoupon customerCoupon1:list1){
                    List<CustomerCoupon> list2=listAll.stream().filter(t->t.getState().equals(1)&&t.getOrderId()!=null&&t.getOrderId().equals(customerCoupon1.getOrderId())).collect(Collectors.toList());
                    if(list2.size()>0){
                        customerCoupon=customerCoupon1;
                        break;
                    }
                }
                if(customerCoupon!=null&&customerCoupon.getId()!=null){
                    singleCoupon.put("data", "2");//有卡未使用完
                    //查询权益卡是否有赠券
                    Coupon coupon = couponService.getById(customerCoupon.getCouponId());
                    //查询权益的名称，也就是产品名

                    if(customerCoupon.getOrderId()!=null&&customerCoupon.getOrderId()!=0){
                        Order order= orderService.getById(customerCoupon.getOrderId());
                        if(order!=null){
                            productName=order.getProductTitle();
                        }
                    }

                    if(coupon!=null&&coupon.getMinutes()==0){//标识没有赠券
                        singleCoupon.put("percentageStr","0%");
                        singleCoupon.put("couponTitle",productName);
                        singleCoupon.put("couponComment","");
                        singleCoupon.put("data","4");//4标识卡卷未有赠送券
                    }
                    else{
                        //标识有赠券
                        long orderId = customerCoupon.getOrderId();
                        int allCouponCount = listAll.stream().filter(s -> s.getOrderId() != null && s.getOrderId() == orderId && s.getUseType() != CouponUseType.VIP.getValue()).collect(Collectors.toList()).size();
                        int couponCount = listAll.stream().filter(s -> s.getOrderId() != null && s.getOrderId() == orderId && s.getUseType() != CouponUseType.VIP.getValue() && s.getState() == 0).collect(Collectors.toList()).size();
                        if(couponCount!=0){
                            //获取第一次使用的记录
                            List<CustomerCoupon> firstUserList=  listAll.stream().filter(s -> s.getOrderId() != null && s.getOrderId() == orderId && s.getUseType() != CouponUseType.VIP.getValue() && s.getState() == 0).collect(Collectors.toList());
                            //按使用时间排序
                            firstUserList.sort(Comparator.comparing(CustomerCoupon::getUseTime));
                            CustomerCoupon firstUser=firstUserList.get(0);

                            LocalDate endTime =firstUser.getUseTime().plusDays(30).toLocalDate();
                            DateTimeFormatter formatter = DateTimeFormatter.ofPattern("MM月dd日");
                            String formattedDate = endTime.format(formatter);
                            singleCoupon.put("datetimeStop", "时间截止到" + formattedDate);
                            LocalDate today = LocalDate.now();
                            long daysRemaining = DateUtil.diffDays(today, endTime);
                            if (daysRemaining <= 0) {
                                daysRemaining = 0;
                            }
                            String percentageStr = "100%";
                            if (coupon != null) {
                                singleCoupon.put("couponTitle", productName);
                                if (daysRemaining == 0) {
                                    singleCoupon.put("couponComment", coupon.getComment());
                                } else {
                                    singleCoupon.put("couponComment", coupon.getComment());
                                    double result = ((double) daysRemaining / 30) * 100;
                                    percentageStr = String.format("%.2f%%", 100-result);
                                }
                            }
                            singleCoupon.put("percentageStr", percentageStr);
                            singleCoupon.put("datetimeCount", "还剩" + daysRemaining + "天");

                            singleCoupon.put("couponUserCount", "已用" + couponCount + "/" + allCouponCount);
                            singleCoupon.put("couponUserShengYuCount", "剩余" + (allCouponCount-couponCount) + "次");
                        }
                        else{
                            //标识卡未被使用
                            singleCoupon.put("percentageStr","0%");
                            singleCoupon.put("couponTitle",productName);
                            singleCoupon.put("couponComment", coupon.getComment());
                            singleCoupon.put("data","3");//3标识有卡未被使用
                            singleCoupon.put("couponUserShengYuCount", "剩余" + (allCouponCount-couponCount) + "次");
                            singleCoupon.put("couponUserCount", "已用" + couponCount + "/" + allCouponCount);
                        }
                    }
                }else{
                    customerCoupon=list1.stream().filter(t->t.getState()==1||t.getState().equals(2)).collect(Collectors.toList()).get(list1.size()-1);
                    if(!Objects.isNull(customerCoupon)) {
                        //已经使用完了
                        Order order = orderService.getById(customerCoupon.getOrderId());
                        singleCoupon.put("orderProductId", order.getProductId().toString());
                        singleCoupon.put("data", "1");
                    }
                }

            }else{
                customerCoupon=list.stream().filter(t->t.getState()==0).findFirst().orElse(null);
                if(!Objects.isNull(customerCoupon)) {
                    //已经使用完了
                    Order order = orderService.getById(customerCoupon.getOrderId());
                    singleCoupon.put("orderProductId", order.getProductId().toString());
                    singleCoupon.put("data", "1");
                }
            }

        }else {
            //从来没有购买过
            singleCoupon.put("percentageStr","0%");
            singleCoupon.put("couponTitle","");
            singleCoupon.put("couponComment","");
            singleCoupon.put("data","0");
        }
        return singleCoupon;
    }

    /**
     * 小程序二次修改会员卡封面
     */
    public void updateCardImage(Long orderId, String cardSelectUrl, long customerId) {
        LambdaQueryWrapper<CustomerCoupon> lqw = new LambdaQueryWrapper<>();
        lqw.eq(CustomerCoupon::getOrderId, orderId);
        List<CustomerCoupon> customerCouponList = list(lqw);
        if (customerCouponList.size()>0) {
            customerCouponList.stream().forEach(s -> {
                s.setCardimage(cardSelectUrl);
            });
            updateBatchById(customerCouponList);
        }
    }
    /**
     *  获取用户的会员卡列表，并清除关系，变为分享朋友状态
     */
    public List<CustomerCoupon> getShareCardListAndUpdate(long orderId) {
        LambdaQueryWrapper<CustomerCoupon> lqw = new LambdaQueryWrapper<>();
        lqw.eq(CustomerCoupon::getOrderId, orderId);
        List<CustomerCoupon> customerCouponList = list(lqw);
        if (customerCouponList.size() > 0) {
            customerCouponList.stream().forEach(s -> {
                s.setCustomerId(0L);
                s.setState(3);
                s.setIsCanGift(true);
            });
        }
        updateBatchById(customerCouponList);
        return customerCouponList;
    }

    /**
     * 获取用户的未使用的会员卡列表state=1未使用，=0已使用
     * @param customerId
     * @return
     */
    public List<CustomerCoupon> getGroupCard(Long customerId,Integer state) {
        LambdaQueryWrapper<CustomerCoupon> lqw = new LambdaQueryWrapper<>();
        lqw.eq(CustomerCoupon::getCustomerId, customerId);
        /*lqw.in(CustomerCoupon::getState, 1,3);
        lqw.eq(CustomerCoupon::getUseType, CouponUseType.VIP.getValue());*/
        lqw.orderByDesc(CustomerCoupon::getCreateTime);
        lqw.orderByDesc(CustomerCoupon::getState);
        List<CustomerCoupon> list= list(lqw);
        BuilderCustomerCoupon(list,state);
        return  list.stream().filter(t->(t.getState()==state||t.getState().equals(2))&&t.getUseType()==CouponUseType.VIP.getValue()).collect(Collectors.toList());
    }

    private void BuilderCustomerCoupon(List<CustomerCoupon> list,Integer state) {
        list.stream().filter(t->(t.getState()==state||t.getState().equals(2))&&t.getUseType()==CouponUseType.VIP.getValue()).forEach(s -> {
            s.setDisplayStatuName("展开");
            Coupon coupon = couponService.getById(s.getCouponId());
            if (coupon != null)
                s.setCoupon(coupon);
            Order order = orderService.getById(s.getOrderId());
            if (order != null)
            {
                Product product= productService.getById(order.getProductId());
                s.setProduct(product);
            }
            long orderId=s.getOrderId();
            List<CustomerCoupon> customerCouponList=list.stream().filter(t->t.getOrderId()!=null
                    &&t.getOrderId().equals(orderId)&&t.getUseType()!=2).sorted(Comparator.comparing(CustomerCoupon::getState).reversed()).sorted(Comparator.comparing(CustomerCoupon::getAmount).reversed()).collect(Collectors.toList());
            if(s.getCardimage()!=null){
                s.setCardimage(s.getCardimage().split("\\?")[0]);
            }
            s.setAmount(order.getPayAmount());
            s.setAllCount(customerCouponList.size());
            s.setUserCount(customerCouponList.stream().filter(t->t.getState()==0).collect(Collectors.toList()).size());
            //去除已使用完券包
            if(customerCouponList.stream().filter(t->t.getState()==1).collect(Collectors.toList()).size()==0){
                s.setState(10);//去除已使用完券包
            }
            s.setCustomerCouponList(customerCouponList);
        });
    }
    /**
     * 获取用户赠送的会员卡列表state=1已领取，=0未领取
     * @param customerId
     * @return
     */
    public List<CustomerCoupon> getShareGroupCard(Long customerId,Integer state) {
        LambdaQueryWrapper<CustomerCoupon> lqw = new LambdaQueryWrapper<>();
        lqw.orderByDesc(CustomerCoupon::getCreateTime);
        lqw.orderByDesc(CustomerCoupon::getState);
        List<CustomerCoupon> list= list(lqw);

        return  BuilderCustomerCouponTwo(list,customerId,state);
    }
    private List<CustomerCoupon> BuilderCustomerCouponTwo(List<CustomerCoupon> list,long customerId,Integer state) {
        List<Long> orderIds =giveGiftService.list().stream().filter(s->s.getCustomerId().equals(customerId)&&s.getState().equals(state)).map(GiveGift::getOrderId).collect(Collectors.toList());

        List<CustomerCoupon> filteredList = list.stream()
                .filter(s -> orderIds.contains(s.getOrderId())&&s.getUseType().equals(CouponUseType.VIP.getValue()))  // 筛选 orderId 在 orderIds 中的记录
                .collect(Collectors.toList());

        filteredList.stream().forEach(s -> {
            Order order = orderService.getById(s.getOrderId());
            if (order != null)
            {
                Product product= productService.getById(order.getProductId());
                s.setProduct(product);
            }
            long orderId=s.getOrderId();
            List<CustomerCoupon> customerCouponList=list.stream().filter(t->t.getOrderId()!=null&&t.getOrderId().equals(orderId)&&t.getUseType()!=2).collect(Collectors.toList());
            if(s.getCardimage()!=null){
                s.setCardimage(s.getCardimage().split("\\?")[0]);
            }
            s.setAmount(order.getPayAmount());
            s.setAllCount(customerCouponList.size());
            s.setUserCount(customerCouponList.stream().filter(t->t.getState().equals(0)).collect(Collectors.toList()).size());
            s.setCustomerCouponList(customerCouponList);
        });
        return filteredList;
    }

    /**
     * 查找的单张卷
     * @param customerId
     * @param state
     * @return
     */
    public List<CustomerCoupon> getSingleCard(Long customerId, Integer state) {
        LambdaQueryWrapper<CustomerCoupon> lqw = new LambdaQueryWrapper<>();
        lqw.eq(CustomerCoupon::getCustomerId, customerId);
        lqw.in(CustomerCoupon::getState, state);
        lqw.orderByAsc(CustomerCoupon::getCreateTime);
        List<CustomerCoupon> list= list(lqw);

        LambdaQueryWrapper<CustomerCoupon> lqw2 = new LambdaQueryWrapper<>();
        lqw2.eq(CustomerCoupon::getCustomerId, customerId);
        lqw2.in(CustomerCoupon::getUseType, 2);
        List<CustomerCoupon> list2= list(lqw2);

        List<CustomerCoupon> realList=new ArrayList<>();
        list.stream().forEach(s->{
            if(s.getOrderId()!=null&&s.getOrderId()!=0){
                long orderId=s.getOrderId();
                  List<CustomerCoupon> checkData= list2.stream().filter(t->t.getOrderId()!=null&&t.getOrderId().equals(orderId)).collect(Collectors.toList());
                  if(checkData.size()==0){
                      realList.add(s);
                  }
            }else {
                realList.add(s);
            }
        });
        return realList.stream().sorted(Comparator.comparing(CustomerCoupon::getAmount).reversed()).collect(Collectors.toList());
    }

    public PageInfo gethebingData(Map<String, Object> params) {
        params.put("lxt","luxin");
        params.put("useType",0);
        params.put("oldData",1);
        params.put("hebingStatus",2);
        params.put("state","1,3");
        params.put("order","-create_time");
//        params.put("size",10000);
        PageInfo<CustomerCoupon> page = page(params);
        buildCoupon(page.getList());
        return page;
    }
    @Transactional(rollbackFor = Exception.class)
    public PageInfo gethebingExct(Map<String, Object> params) {
        params.put("lxt","luxin");
        params.put("useType",0);
        params.put("oldData",1);
        params.put("hebingStatus",2);
        params.put("state","1,3");
        params.put("order","-create_time");
        params.put("size",10000);
        PageInfo<CustomerCoupon> page = page(params);
        buildCoupon(page.getList());

        //查询所有会员卡
        LambdaQueryWrapper<CustomerCoupon> par=new LambdaQueryWrapper<CustomerCoupon>();
        par.eq(CustomerCoupon::getUseType,2);
        List<CustomerCoupon> memberCardList=list(par);
        List<CustomerCoupon> list=page.getList();
        int aa=list.size();
        if(list.size()>0){
            Map<Long,List<CustomerCoupon>> list2=list.stream().collect(Collectors.groupingBy(CustomerCoupon::getCustomerId));
            list2.forEach((k,v)->{
                long customerid=k;
                List<CustomerCoupon> customerCoupons=v;
              if(customerCoupons.size()>1) {
                  int a=0;
                  for (int i = 0; i < customerCoupons.size(); i++) {
                      CustomerCoupon customerCoupon = customerCoupons.get(i);
                      if(customerCoupons.size()!=i+1){
                          i=i+1;
                          CustomerCoupon customerCoupon2 = customerCoupons.get(i);
                          boolean ckExist1=false;
                          if(customerCoupon.getOrderId()!=null){
                              ckExist1=memberCardList.stream().filter(t->t.getOrderId()!=null&&t.getOrderId().equals(customerCoupon.getOrderId())).collect(Collectors.toList()).size()>0;
                          }
                          boolean ckExist2=false;
                          if(customerCoupon2.getOrderId()!=null){
                              ckExist2=memberCardList.stream().filter(t->t.getOrderId()!=null&&t.getOrderId().equals(customerCoupon2.getOrderId())).collect(Collectors.toList()).size()>0;
                          }
                          if((ckExist1==false&&ckExist2==false)||(ckExist1==true&&ckExist2==true)){
                              customerCoupon.setAmount(customerCoupon.getAmount().add(customerCoupon2.getAmount()));
                              customerCoupon.setHebingId(customerCoupon2.getId());
                              customerCoupon.setHebingStatus(1);
                              updateById(customerCoupon);
                              removeById(customerCoupon2.getId());
                          }else{
                              if(ckExist1==true&&ckExist2==false){
                                  customerCoupon.setAmount(customerCoupon.getAmount().add(customerCoupon2.getAmount()));
                                  customerCoupon.setHebingId(customerCoupon2.getId());
                                  customerCoupon.setHebingStatus(1);
                                  updateById(customerCoupon);
                                  removeById(customerCoupon2.getId());
                              }
                              if(ckExist1==false&&ckExist2==true){
                                  customerCoupon2.setAmount(customerCoupon.getAmount().add(customerCoupon2.getAmount()));
                                  customerCoupon2.setHebingId(customerCoupon.getId());
                                  customerCoupon2.setHebingStatus(1);
                                  updateById(customerCoupon2);
                                  removeById(customerCoupon.getId());
                              }
                          }
                      }
                  }
              }
            });
        }
        return page;

    }
    //todo  需要做检查合并后的会员卡是否还有券，没有券了执行奖励

}