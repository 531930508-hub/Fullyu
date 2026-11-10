package com.macro.mall.service;

import cn.hutool.core.bean.BeanUtil;
import cn.hutool.core.date.DateTime;
import cn.hutool.core.util.ObjUtil;
import cn.hutool.core.util.StrUtil;
import cn.hutool.crypto.SecureUtil;
import cn.hutool.crypto.symmetric.AES;
import com.alibaba.fastjson2.JSON;
import com.alibaba.fastjson2.JSONArray;
import com.alibaba.fastjson2.JSONObject;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.github.pagehelper.PageInfo;
import com.google.common.collect.Lists;
import com.macro.mall.common.exception.ApiException;
import com.macro.mall.common.exception.BusinessException;
import com.macro.mall.common.exception.MyOptimisticLockException;
import com.macro.mall.common.service.RedisService;
import com.macro.mall.component.RabbitMqSender;
import com.macro.mall.consts.NormalConst;
import com.macro.mall.consts.RedisKey;
import com.macro.mall.dto.*;
import com.macro.mall.entity.*;
import com.macro.mall.enums.*;
import com.macro.mall.mapper.OrderMapper;
import com.macro.mall.membercard.calc.MemberCardPriceEngine;
import com.macro.mall.membercard.dto.MemberCardPriceOption;
import com.macro.mall.pay.PayService;
import com.macro.mall.service.approval.RefundApplyService;
import com.macro.mall.service.base.BaseService;
import com.macro.mall.service.base.WrapperBuilder;
import com.macro.mall.service.shop.BedService;
import com.macro.mall.service.shop.ShopService;
import com.macro.mall.utils.*;
import lombok.extern.slf4j.Slf4j;
import org.apache.logging.log4j.util.Strings;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.BeanUtils;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.CollectionUtils;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.RequestBody;

import java.io.IOException;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.text.DecimalFormat;
import java.text.SimpleDateFormat;
import java.time.Duration;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.function.Function;
import java.util.stream.Collectors;
import java.util.stream.Stream;

/**
 * 订单 service
 */
@Service
@Slf4j
public class OrderService extends BaseService<OrderMapper, Order> {
    private static final Logger LOGGER = LoggerFactory.getLogger(Order.class);
    @Autowired
    @Lazy
    CustomerCouponService customerCouponService;
    @Autowired
    @Lazy
    CustomerService customerService;
    @Autowired
    @Lazy
    OrderDetailService orderDetailService;
    @Autowired
    @Lazy
    IntegrationService integrationService;
    @Autowired
    private RabbitMqSender rabbitMqSender;
    @Autowired
    MassagistService massagistService;
    @Autowired
    PrintUtil printUtil;
    @Autowired
    @Lazy
    BedService bedService;
    @Autowired
    @Lazy
    MassagistSchedulesService massagistSchedulesService;
    @Autowired
    @Lazy
    ShopService shopService;
    @Autowired
    private RedisService redisService;
    @Autowired
    private PayService payService;
    @Autowired
    ProjectService projectService;
    @Autowired
    ProductService productService;
    @Autowired
    @Lazy
    private OrderService self;
    @Autowired
    @Lazy
    private GiveGiftService giveGiftService;
    @Autowired
    RedisUtil redisUtil;
    @Autowired
    OrderPrintRecordService orderPrintRecordService;
    @Autowired
    @Lazy
    RefundApplyService refundApplyService;
    @Autowired
    OrderDiscountService orderDiscountService;
    @Autowired
    ControllerLogService controllerLogService;
    @Autowired
    @Lazy
    WxMpTemplateMessageService wxMpTemplateMessageService;
    @Autowired
    @Lazy
    CustomerMassagistBlockService customerMassagistBlockService;

    @Autowired
    @Lazy
    MemberCardService memberCardService;

    @Autowired
    PrintUtilNew printUtilNew;
    @Autowired
    GiveTempGiftService giveTempGiftService;
    @Autowired
    private GiveGiftHistoryService giveGiftHistoryService;

    @Override
    protected QueryWrapper<Order> buildWrapper(Map<String, Object> params, QueryWrapper<Order> queryWrapper) {
        return WrapperBuilder.init(queryWrapper, params)
                .like("code")
                .equal("pay_type")
                .equal("type")
                .in("state")
                .in("customer_id")
                .in("appointment_state")
                .equal("refund_state")
                .equal("appointment_type")
                .like("coupon_code")
                .like("product_title")
                .like("comment")
                .in("id")
                .equal("shop_id")
                .getQueryWrapper();
    }

    /**
     * 创建订单
     *
     * @param orderDetailDto
     * @param isManage       true是管理端;false是小程序端
     * @return
     */
    @Transactional(rollbackFor = Exception.class)
    public Long buildOrder(OrderDetailDto orderDetailDto, Integer overTimeSeconds, boolean isManage) {
        synchronized (NormalConst.bookingLockKey.intern()) {
            Integer appointmentType = orderDetailDto.getAppointmentType();
            if (!isManage) {
                Integer type = orderDetailDto.getType();
                if (type != null && type == 0) {
                    LocalDateTime startTime = orderDetailDto.getStartTime();
                    String currentDateCode = DateUtil.getCurrentDateCode();
                    String startDate = DateUtil.toYYYYMMDD(startTime);
                    if (currentDateCode.compareTo(startDate) > 0) {
                        throw new BusinessException("只能约今天及以后的日期");
                    }

                }
            }
            Product product = productService.getProductLimit(orderDetailDto.getProductId());
            if (product == null) {
                throw new BusinessException("产品不存在");
            }

            Order order = new Order();
            BeanUtils.copyProperties(orderDetailDto, order);
            order.setProductTitle(product.getTitle());
            BigDecimal totalAmount = calculateTotalAmount(orderDetailDto, product.getAmount());
            order.setTotalAmount(totalAmount);
            order.setPayAmount(totalAmount);
            Integration integration = null;
            if (OrderType.PRODUCT.getValue().equals(orderDetailDto.getType())) {
                if (!isManage && AppointmentType.HAND.getValue().equals(appointmentType)) {
//                    Long count = countByCustomerId(orderDetailDto.getCustomerId());
                    Long count = countByCustomerIdNew(orderDetailDto.getCustomerId());
                    OrderDiscount orderDiscount = orderDiscountService.getDiscountByCount(count + 1, orderDetailDto.getShopId(), orderDetailDto.getDurationMinutes(), product.getAmount());
                    //查询此人是否有积分，如果有就不走折扣
                    Long customerIntegration = integrationService.getIntegrationByCustomerId(orderDetailDto.getCustomerId());

                    // 根据最小值 判断是否用积分支付 luxin20260903
                    //计算用积分支付的金额
                    BigDecimal integrationAmount =totalAmount.subtract(BigDecimal.valueOf(customerIntegration));
                    //获取折扣的支付金额
                    BigDecimal payAmount = totalAmount;

                    if (orderDiscount != null) {
                        Integer discount = orderDiscount.getDiscount();
                        Integer discountType = orderDiscount.getType();
                        payAmount = calculateDiscountPayAmount(discountType, discount, order.getTotalAmount(), orderDetailDto.getPersonCount());
                    }
                    //比较integrationAmount和payAmount的大小
                    if (integrationAmount.compareTo(payAmount) >= 0) {
                        //标识折扣合适
                        customerIntegration= 0L;//默认积分为0表示走折扣
                        order.setUseIntegrationState(0);
                    }else{
                        order.setUseIntegrationState(1);
                    }//新增的结束

                    //去掉新增的代码需要把注释的代码释放
                    if (orderDiscount != null&&customerIntegration==0L) {
                        Integer discount = orderDiscount.getDiscount();
                        Integer discountType = orderDiscount.getType();
                        order.setDiscount(discount);
                        order.setDiscountType(discountType);
                        //BigDecimal payAmount = calculateDiscountPayAmount(discountType, discount, order.getTotalAmount(), orderDetailDto.getPersonCount());
                        order.setPayAmount(payAmount);
                    }
                }

            } else if (OrderType.COUPON.getValue().equals(orderDetailDto.getType())) {
                if (orderDetailDto.getIsUseIntegration()) {
                    BigDecimal roundedAmount = totalAmount.setScale(0, RoundingMode.CEILING);
                    Long needIntegration = Long.parseLong(roundedAmount.toString());
                    integration = integrationService.useIntegration(needIntegration, orderDetailDto.getCustomerId(), "积分抵扣");
                    if (integration != null) {
                        integration.setOrderId(order.getId());
                        integrationService.updateById(integration);
                        BigDecimal integrationAmount = BigDecimal.valueOf(integration.getScore());
                        if (integrationAmount.compareTo(totalAmount) < 0) {
                            order.setPayAmount(totalAmount.subtract(integrationAmount));
                            order.setIntegrationAmount(integrationAmount);
                        } else {
                            order.setPayAmount(BigDecimal.ZERO);
                            order.setIntegrationAmount(totalAmount);
                        }
                    }
                }
            }
            order.setOverTimeSeconds(overTimeSeconds);
            save(order);
            fillOrderCode(order);
            Long orderId = order.getId();
            if (OrderType.PRODUCT.getValue().equals(order.getType())) {
                orderDetailDto.setOrderId(orderId);
                orderDetailService.createDetail(orderDetailDto, isManage, true);
            }
            if (integration != null) {
                integrationService.setOrderId(integration.getId(), orderId);
            }
            if (BigDecimal.ZERO.compareTo(order.getPayAmount()) == 0) {
                finishPay(order);
                /*int a=0;
                int b=1/0;*/
                return orderId;
            }
            if (overTimeSeconds == null) {
                return orderId;
            }
            try {
                rabbitMqSender.sendOrderCancelMessage(orderId, overTimeSeconds * 1000);
            } catch (Exception e) {
                e.printStackTrace();
            }
            return orderId;
        }
    }

    /**
     * 计算总金额
     *
     * @param orderDetailDto
     * @param productAmount
     * @return
     */
    private BigDecimal calculateTotalAmount(OrderDetailDto orderDetailDto, BigDecimal productAmount) {
        if (OrderType.PRODUCT.getValue().equals(orderDetailDto.getType())) {
            Integer minutes = orderDetailDto.getDurationMinutes();
            int totalDuration = orderDetailDto.getPersonCount() * minutes;
            int costCouponCount = totalDuration / NormalConst.PER_COUPON_COST_MINUTES + ((totalDuration % NormalConst.PER_COUPON_COST_MINUTES) != 0 ? 1 : 0);
            return productAmount.multiply(BigDecimal.valueOf(costCouponCount));
        } else {
            return productAmount.multiply(BigDecimal.valueOf(orderDetailDto.getQuantity()));
        }
    }

    /**
     * 计算折扣
     *
     * @param type
     * @param discount
     * @param totalAmount
     * @param personCount
     * @return
     */
    private BigDecimal calculateDiscountPayAmount(Integer type, Integer discount, BigDecimal totalAmount, Integer personCount) {
        BigDecimal orderDiscount = BigDecimal.valueOf(discount).divide(BigDecimal.valueOf(100), 2, RoundingMode.HALF_UP);
        if (type == 1) {
            return orderDiscount.multiply(totalAmount);
        } else {
            BigDecimal bigDecimal=orderDiscount.multiply(BigDecimal.valueOf(personCount));
            if(bigDecimal.compareTo(totalAmount)<0){
                return bigDecimal;
            }else {
                return totalAmount;
            }
        }
    }

    /**
     * 获取疗愈师列表（含空闲状态排序）
     *
     * @param shopId
     * @param startTime
     * @param durationMinutes
     * @param personCount
     * @return
     */
    public List<Massagist> findAvailableMassagistList(Long shopId, LocalDateTime startTime, Integer durationMinutes, Integer personCount) {
        return findAvailableMassagistList(shopId, startTime, durationMinutes, personCount, null);
    }

    /**
     * @param phone 可选。后台建单时按手机号识别客户，给已设为暂别的疗愈师打提示标记（不从列表剔除）。
     */
    public List<Massagist> findAvailableMassagistList(Long shopId, LocalDateTime startTime, Integer durationMinutes, Integer personCount, String phone) {
        if (shopId == null) {
            shopId = 1L;
        }
        String key = "lockKey" + shopId;
        synchronized (key.intern()) {
            Shop shop = shopService.findAvailableById(shopId);
            if (shop == null) {
                throw new BusinessException("抱歉，店铺不可用");
            }
            String date = DateUtil.toYYYYMMDD(startTime);
            List<MassagistSchedules> allMassagistList = massagistSchedulesService.simpleListByDateAndShopId(date, shopId);
            if (CollectionUtils.isEmpty(allMassagistList)) {
                log.error("查询到店时间失败，没有疗愈师排班数据，date={}", date);
                //throw new BusinessException("抱歉，没有排班数据");
            }
            List<Massagist> resultList = new ArrayList<>();
            List<Massagist> massagistList = massagistService.listByShopId(shopId);
            Map<Long, Massagist> massagistMap = massagistList.stream().collect(Collectors.toMap(Massagist::getId, Function.identity()));
            List<OrderDetail> detailList = orderDetailService.getBaseMapper().findSimpleListByStartDateAndShop(date, shopId);

            //luxin删除
           /* if (CollectionUtils.isEmpty(detailList) && personCount == 1) {
                allMassagistList.stream().forEach(s -> {
                    Massagist massagist = massagistMap.get(s.getMassagistId());
                    if (massagist != null) {
                        resultList.add(massagist);
                    }
                });
                return resultList;
            }*/
            Map<Long, List<OrderDetail>> massagistDetailMap = new HashMap<>(detailList.size());
            detailList.forEach(d -> {
                List<OrderDetail> massagistDetailList = massagistDetailMap.get(d.getMassagistId());
                if (massagistDetailList == null) {
                    massagistDetailList = new ArrayList<>();
                }
                massagistDetailList.add(d);
                massagistDetailMap.put(d.getMassagistId(), massagistDetailList);
            });
            LocalDateTime endTime = DateUtil.addTimeByMinutes(startTime, durationMinutes);
            LocalDateTime aEndTime = DateUtil.addTimeByMinutes(endTime, shop.getIntervalMinute());
            List<Long> availableMassagistIdList = new ArrayList<>();
            List<Long> disableMassagistIdList = new ArrayList<>();
            allMassagistList.forEach(m -> {
                /*if (DateUtil.toHHmm(m.getStartTime()).compareTo(DateUtil.toHHmm(startTime)) > 0
                        || DateUtil.toHHmm(m.getEndTime()).compareTo(DateUtil.toHHmm(endTime)) < 0) {
                   // disableMassagistIdList.add(m.getMassagistId());
                }*/
                if (DateUtil.toHHmm(m.getStartTime()).compareTo(DateUtil.toHHmm(endTime)) <= 0
                        &&DateUtil.toHHmm(m.getStartTime()).compareTo(DateUtil.toHHmm(startTime)) >= 0) {
                    // disableMassagistIdList.add(m.getMassagistId()); luxin修改 屏蔽去掉不在工作时间内容的疗愈师
                }
                else {
                    List<OrderDetail> massagistDetailList = massagistDetailMap.get(m.getMassagistId());
                    boolean isAvailable = true;
                    if (CollectionUtils.isEmpty(massagistDetailList)) {
                        isAvailable = true;
                    } else {
                        isAvailable = massagistDetailList.stream().allMatch(d -> {
                            LocalDateTime detailEndTime = d.getEndTime();
                            if(d.getProjectId()!=3){
                                detailEndTime = DateUtil.addTimeByMinutes(detailEndTime, shop.getIntervalMinute());//间隔15分钟；去掉间隔的
                            }
                           // detailEndTime = DateUtil.addTimeByMinutes(detailEndTime, shop.getIntervalMinute());
                            return DateUtil.toHHmm(startTime).compareTo(DateUtil.toHHmm(detailEndTime)) >= 0
                                    || DateUtil.toHHmm(aEndTime).compareTo(DateUtil.toHHmm(d.getStartTime())) <= 0;
                        });
                    }
                    if (isAvailable) {
                        availableMassagistIdList.add(m.getMassagistId());
                    } else {
                        disableMassagistIdList.add(m.getMassagistId());
                    }
                }
            });
            Map<String, Long> sortMap = new HashMap<>();

            //luxin新增
            /*获取技师当天默认接单排序*/
            // List<Long> sortLinkList = massagistSchedulesService.findSortIdList(date, shopId);
            //luxin增加了方法
            List<Long> sortLinkList =orderDetailService.sortMassagist(availableMassagistIdList, startTime, endTime, shopId, personCount);
            sortLinkList.forEach(id -> {
                Massagist massagist = massagistMap.get(id);
                if (massagist != null) {
                    massagist.setAvailable(1);
                    resultList.add(massagist);
                }
                else {
                    massagist.setAvailable(0);
                    resultList.add(massagist);
                }
            });

           /* availableMassagistIdList.forEach(id -> {
                List<OrderDetail> orderDetailList = massagistDetailMap.get(id);
                if (CollectionUtils.isEmpty(orderDetailList)) {
                    sortMap.put("0000:00" + id, id);
                } else {
                    OrderDetail minDetail = orderDetailList.stream().min(Comparator.comparing(OrderDetail::getEndTime)).get();
                    int size = orderDetailList.size();
                    String second;
                    if (size > 9) {
                        second = size + "";
                    } else {
                        second = "0" + size;
                    }
                    if (minDetail != null) {
                        sortMap.put(second + DateUtil.toHHmm(minDetail.getEndTime()) + id, id);
                    } else {
                        sortMap.put(second + "00:00" + id, id);
                    }
                }
            });
            sortMap.keySet().stream().sorted().forEach(time -> {
                Long massagistId = sortMap.get(time);
                Massagist massagist = massagistMap.get(massagistId);
                if (massagist != null) {
                    massagist.setAvailable(1);
                    resultList.add(massagist);
                }
            });
            disableMassagistIdList.forEach(id -> {
                Massagist massagist = massagistMap.get(id);
                if (massagist != null) {
                    massagist.setAvailable(0);
                    resultList.add(massagist);
                }
            });*/
            List<Massagist> result = resultList.stream().distinct().collect(Collectors.toList());
            markBlockedByPhone(phone, result);
            return result;
        }
    }

    /**
     * 后台建单：按手机号识别客户，给已设为暂别的疗愈师打瞬态标记（仅提示，不从列表剔除）。
     */
    private void markBlockedByPhone(String phone, List<Massagist> massagistList) {
        if (StrUtil.isBlank(phone) || CollectionUtils.isEmpty(massagistList)) {
            return;
        }
        Customer customer = customerService.getByPhone(phone.trim());
        if (customer == null) {
            return;
        }
        customerMassagistBlockService.markBlocked(customer.getId(), massagistList);
    }

    /**
     * 获取床位列表(带空闲状态)
     *
     * @param shopId
     * @param startTime
     * @param durationMinutes
     * @return
     */
    public List<Bed> findAvailableBedList(Long shopId, LocalDateTime startTime, Integer durationMinutes, Long projectId) {
        if (shopId == null) {
            shopId = 1L;
        }
        Shop shop = shopService.findAvailableById(shopId);
        if (shop == null) {
            log.error("抱歉，店铺不可用,shopId={}", shopId);
            return Collections.emptyList();
        }
        String date = DateUtil.toYYYYMMDD(startTime);
        Integer bedType = projectService.findTypeById(projectId);
        List<Bed> allBedList = bedService.listByStatusAndTypeAndShopId(NormalState.EFFECTIVE.getValue(), bedType, shopId);
        if (CollectionUtils.isEmpty(allBedList)) {
            log.error("查询到店时间失败，所有床位状态不可用，date={}", date);
            return Collections.emptyList();
        }
        List<OrderDetail> detailList = orderDetailService.getBaseMapper().findSimpleListByStartDateAndShop(date, shopId);
        if (CollectionUtils.isEmpty(detailList)) {
            return allBedList;
        }
        Map<Long, List<OrderDetail>> bedDetailMap = new HashMap<>(detailList.size());
        detailList.forEach(d -> {
            List<OrderDetail> bedDetailList = bedDetailMap.get(d.getBedId());
            if (bedDetailList == null) {
                bedDetailList = new ArrayList<>();
            }
            bedDetailList.add(d);
            bedDetailMap.put(d.getBedId(), bedDetailList);
        });
        LocalDateTime endTime = DateUtil.addTimeByMinutes(startTime, durationMinutes);
        LocalDateTime aEndTime = DateUtil.addTimeByMinutes(endTime, shop.getIntervalMinute());

        allBedList.forEach(bed -> {
            List<OrderDetail> bedDetailList = bedDetailMap.get(bed.getId());
            boolean isAvailable = true;
            if (CollectionUtils.isEmpty(bedDetailList)) {
                isAvailable = true;
            } else {
                isAvailable = bedDetailList.stream().allMatch(d -> {
                    LocalDateTime detailEndTime = DateUtil.addTimeByMinutes(d.getEndTime(), shop.getIntervalMinute());
                    if (DateUtil.toHHmm(startTime).compareTo(DateUtil.toHHmm(detailEndTime)) >= 0
                            || DateUtil.toHHmm(aEndTime).compareTo(DateUtil.toHHmm(d.getStartTime())) <= 0) {
                        return true;
                    }
                    return false;
                });
            }
            if (isAvailable) {
                bed.setAvailable(NormalState.EFFECTIVE.getValue());
            } else {
                bed.setAvailable(NormalState.INVALID.getValue());
            }
        });
        return allBedList;
    }

    /**
     * 完成支付
     *
     * @param order
     */
    @Transactional(rollbackFor = Exception.class)
    public void finishPay(Order order) {
        if (order == null) {
            throw new BusinessException("订单不存在");
        }
        String lockKey = getOrderLockKey(order.getId());
        synchronized (lockKey.intern()) {
            if (!OrderState.NOT_PAY.getValue().equals(order.getState())) {
                switch (order.getState()) {
                    case 1:
                    case 2:
                        throw new BusinessException("订单已完成");
                    case 3:
                        throw new BusinessException("订单已超时");
                    case 4:
                        throw new BusinessException("订单已取消");
                    case 5:
                        throw new BusinessException("订单退款中");
                    case 6:
                        throw new BusinessException("订单已退款");
                    default:
                        throw new BusinessException("订单状态异常");
                }
            }
            Long productId = order.getProductId();
            if (productId != null) {
                productService.addSale(order.getProductId());
            }
            order.setState(OrderState.PAID_NOT_COMMENT.getValue());
            order.setPayTime(LocalDateTime.now());
            if (OrderType.COUPON.getValue().equals(order.getType())) {
                order.setAppointmentState(AppointmentState.FINISHED.getValue());
                afterOrderPaid(order);
            } else if (OrderType.PRODUCT.getValue().equals(order.getType())) {
                order.setAppointmentState(AppointmentState.DOING.getValue());
                handleBookingSuccessNotice(order.getId());
            } else if (OrderType.RECEPTION.getValue().equals(order.getType())) {
                order.setAppointmentState(AppointmentState.DOING.getValue());
            }
            updateById(order);
        }
    }

    /**
     * 确认收款
     *
     * @param orderId
     */
    public void confirmPay(Long orderId, BigDecimal payAmount, String couponCode) {
        String lockKey = getOrderLockKey(orderId);
        synchronized (lockKey.intern()) {
            Order order = getById(orderId);
            if (payAmount != null) {
                order.setPayAmount(payAmount);
            }
            if (couponCode != null) {
                order.setCouponCode(couponCode);
            }
            finishPay(order);
        }
    }

    /**
     * 修改订单评分状态
     *
     * @param id
     */
    public void changeOrderCommentedState(Long id) {
        String lockKey = getOrderLockKey(id);
        synchronized (lockKey.intern()) {
            Order order = getById(id);
            if (order == null) {
                throw new BusinessException("订单不存在");
            } else if (OrderState.CANCELED.getValue().equals(order.getState()) || OrderState.TIMEOUT.getValue().equals(order.getState())) {
                throw new BusinessException("订单已取消");
            } else if (OrderState.REFUNDED.getValue().equals(order.getState()) || OrderState.REFUNDING.getValue().equals(order.getState()) || OrderState.APPROVAL_REFUNDING.getValue().equals(order.getState())) {
                throw new BusinessException("订单已退款");
            } else if (OrderState.NOT_PAY.getValue().equals(order.getState())) {
                throw new BusinessException("订单未付款");
            } else if (OrderState.PAID_COMMENTED.getValue().equals(order.getState())) {
                throw new BusinessException("已经评价过了");
            }
            order.setState(OrderState.PAID_COMMENTED.getValue());
            updateById(order);
        }
    }

    public PageInfo<Order> pageInfo(Map<String, Object> params) {
        handleParams(params);
        PageInfo<Order> page = page(params);
        buildSetCustomerName(page.getList());
        buildCouponAmount(page.getList());
        buildDetail(page.getList());
        buildGift(page.getList());
        return page;
    }


    /**
     * 提前处理特殊查询参数
     * phone 客户手机号查询
     * startAppointmentTime 预约时间关联查询
     *
     * @param params
     */
    private void handleParams(Map<String, Object> params) {
        Object phone = params.get("phone");
        if (phone != null && Strings.isNotBlank(phone.toString())) {
            List<Long> customerIdList = customerService.findIdListByPhoneOrName(phone.toString());
            params.put("customerId", CustomUtil.longList2String(customerIdList));
        }
        Object startAppointmentTime = params.get("startAppointmentTime");
        Object endAppointmentTime = params.get("endAppointmentTime");
        if (startAppointmentTime != null && Strings.isNotBlank(startAppointmentTime.toString())
                && endAppointmentTime != null && Strings.isNotBlank(endAppointmentTime.toString())) {
            List<Long> orderIdListByStartTime = orderDetailService.orderIdListByStartTime(startAppointmentTime, endAppointmentTime);
            if (!CollectionUtils.isEmpty(orderIdListByStartTime)) {
                params.put("id", CustomUtil.longList2String(orderIdListByStartTime));
            }
        }
    }

    public void orderExport(Map<String, Object> params) {
        handleParams(params);
        params.put("all", true);
        Object type = params.get("type");
        if (type == null) {
            throw new BusinessException("导出参数出现问题，无法发起导出");
        }
        List<Order> orderList = listNoPage(params);
        buildSetCustomerName(orderList);
        buildCouponAmount(orderList);
        //buildSetOrderDetail(orderList);

        Integer typeValue = Integer.valueOf(type.toString());
        List<Integer> noPay = Arrays.asList(OrderState.NOT_PAY.getValue(), OrderState.TIMEOUT.getValue(), OrderState.CANCELED.getValue());
        if (OrderType.PRODUCT.getValue().equals(typeValue)) {
            List<Shop> shopList = shopService.list();
            List<Massagist> massagistList =massagistService.list();
            Map<Long, String> idShopMap = shopList.stream().collect(Collectors.toMap(Shop::getId, Shop::getName));
            Map<Long, String> idMassagistMap =massagistList.stream().collect(Collectors.toMap(Massagist::getId, Massagist::getName));
            buildDetail(orderList);
            List<OrderAppointmentDto> orderAppointmentDtoList = orderList.stream().filter(t->t.getOrderDetailList()!=null).map(e -> {
                    OrderAppointmentDto target = new OrderAppointmentDto();
                    BeanUtils.copyProperties(e, target);
                    target.setShopName(idShopMap.get(e.getShopId()));
                    target.setTotalAmount(e.getTotalAmount());
                    if (noPay.contains(e.getState())) {
                        target.setPayAmount(BigDecimal.ZERO);
                    } else {
                        target.setPayAmount(e.getCouponPayAmount());
                    }
                    if (e.getOrderDetailList().size() > 0) {
                        if (e.getOrderDetailList().get(0).getMassagistId() != null && e.getOrderDetailList().get(0).getMassagistId() != 0L) {
                            long massagistId = e.getOrderDetailList().get(0).getMassagistId();
                            String massgistName = idMassagistMap.get(massagistId);
                            target.setMassagistName(massgistName);
                        }
                    }
                    target.setCouponAmount(e.getCouponAmount().longValue());
                    target.setPayTypeStr(OrderPayType.getLabel(e.getPayType()));
                    target.setStateStr(OrderState.getLabel(e.getState()));
                    target.setStartTime(e.getStartTime());
                    target.setDuration(e.getDuration());
                    if (!CollectionUtils.isEmpty(e.getOrderDetailList())) {
                        target.setPersonCount(e.getOrderDetailList().size());
                    } else {
                        target.setPersonCount(1);
                    }
                    target.setAppointmentStateStr(AppointmentState.getLabel(e.getAppointmentState()));
                    target.setAppointmentTypeStr(AppointmentType.getLabel(e.getAppointmentType()));
                    target.setOil(e.getOil());
                    if (StringUtils.hasText(e.getParts())) {
                        try {
                            List<String> strings = JSON.parseArray(e.getParts(), String.class);
                            StringBuilder stringBuilder = new StringBuilder();
                            strings.forEach(s -> stringBuilder.append(s).append(" | "));
                            if (stringBuilder.length() > 0) {
                                stringBuilder.delete(stringBuilder.length() - 3, stringBuilder.length() - 1);
                            }
                            target.setParts(stringBuilder.toString());
                        } catch (Exception exception) {
                            exception.printStackTrace();
                        }
                    }
                    return target;

            }).collect(Collectors.toList());
            ExcelUtil.export(orderAppointmentDtoList, OrderAppointmentDto.class, "普通订单列表.xlsx");
        } else if (OrderType.COUPON.getValue().equals(typeValue)) {
            buildGift(orderList);
            List<OrderCardDto> orderCardDtoList = orderList.stream().map(e -> {
                OrderCardDto target = new OrderCardDto();
                BeanUtils.copyProperties(e, target);
                String totalAmountStr = String.valueOf(e.getTotalAmount());
                target.setTotalAmountStr(totalAmountStr + "元");
                if (noPay.contains(e.getState())) {
                    target.setPayAmountStr("0元");
                } else {
                    String payAmountStr = String.valueOf(e.getPayAmount());
                    target.setPayAmountStr(payAmountStr + "元");
                }
                String integrationAmountStr = String.valueOf(e.getIntegrationAmount());
                target.setIntegrationAmountStr(integrationAmountStr + "元");
                target.setPayTypeStr(OrderPayType.getLabel(e.getPayType()));
                target.setStateStr(OrderState.getLabel(e.getState()));
                Customer toCustomer = e.getToCustomer();
                if (toCustomer != null) {
                    target.setToCustomerPhone(toCustomer.getPhone());
                } else if (!e.getIsGift()) {
                    target.setToCustomerPhone(target.getCustomerPhone());
                }
                return target;
            }).collect(Collectors.toList());
            ExcelUtil.export(orderCardDtoList, OrderCardDto.class, "卡券订单列表.xlsx");
        }
    }

    private void buildSetCustomerName(Order order) {
        if (ObjUtil.isEmpty(order)) {
            return;
        }
        Long customerId = order.getCustomerId();
        if (ObjUtil.isEmpty(customerId)) {
            return;
        }
        Customer customer = customerService.getById(customerId);
        order.setCustomerNickname(customerService.findCustomerNickname(customer));
    }

    /*public void buildSetOrderDetail(List<Order> list) {
        if (CollectionUtils.isEmpty(list)) {
            return;
        }
        list.forEach(e ->
        {
            long orderId= e.getId();
            List<OrderDetail> orderDetailList = orderDetailService.list(new QueryWrapper<OrderDetail>().lambda().eq(OrderDetail::getOrderId, orderId));
            e.setOrderDetailList(orderDetailList);
        });
    }*/

    private void buildSetCustomerName(List<Order> list) {
        if (CollectionUtils.isEmpty(list)) {
            return;
        }
        List<Long> customerIds = list.stream().filter(e -> !ObjUtil.isEmpty(e.getCustomerId())).map(Order::getCustomerId).collect(Collectors.toList());
        if (CollectionUtils.isEmpty(customerIds)) {
            return;
        }
        List<Customer> customers = customerService.listByIds(customerIds);
        Map<Long, Customer> collect = customers.stream().collect(Collectors.toMap(Customer::getId, Function.identity()));
        list.forEach(e -> {
            if (!ObjUtil.isEmpty(e.getCustomerId())) {
                Customer customer = collect.get(e.getCustomerId());
                if (customer != null) {
                    e.setCustomerNickname(customerService.findCustomerNickname(customer));
                    e.setCustomerPhone(customer.getPhone());
                }
            }
        });
    }

    public void buildCouponAmount(List<Order> list) {
        if (CollectionUtils.isEmpty(list)) {
            return;
        }
        List<Long> orderIdList = list.stream().map(Order::getId).collect(Collectors.toList());
        if (CollectionUtils.isEmpty(orderIdList)) {
            return;
        }
        Map<Long, BigDecimal> map = customerCouponService.getOrderCouponAmountMap(orderIdList);
        list.forEach(e -> e.setCouponPayAmount(map.getOrDefault(e.getId(), BigDecimal.ZERO).add(e.getPayAmount())));
    }

    /**
     * k
     * 根据订单id打印小票
     *
     * @param id
     */
    @Transactional(rollbackFor = Exception.class)
    public void printById(Long id) {
        Order order = getById(id);
        if (order == null) {
            throw new BusinessException("订单不存在");
        }
        Integer state = order.getState();
        if (!OrderState.PAID_NOT_COMMENT.getValue().equals(state) && !OrderState.PAID_COMMENTED.getValue().equals(state)) {
            throw new BusinessException("订单状态有误，不可打印");
        }
        if (order.getShopId() == null) {
            throw new BusinessException("订单门店不能为空");
        }
        if (Strings.isBlank(order.getCode())) {
            throw new BusinessException("订单编号不能为空");
        }
        List<OrderDetail> detailList = orderDetailService.listByOrderId(id);
        if (CollectionUtils.isEmpty(detailList)) {
            return;
        }
        OrderDetail orderDetail = detailList.get(0);
        Integer duration = orderDetail.getDuration();
        order.setDuration(duration);
        BigDecimal couponAmount = customerCouponService.getCouponAmountByOrderId(id);
        order.setPayAmount(couponAmount.add(order.getPayAmount()));
        String printContent = printOrder(order);
        orderPrintRecordService.addRecord(id, printContent, order.getShopId());
    }
    public String printOrder(Order order){
        LocalDateTime now = LocalDateTime.now();
        Shop shop= shopService.getById(order.getShopId());
        if(Objects.isNull(shop)){
            throw new BusinessException("此订单未绑定店铺不可打印");
        }

        StringBuilder builder = new StringBuilder();
        builder.append("<C>（"+shop.getName()+"）</C><BR>");
        builder.append("地址："+shop.getAddress()+"<BR>");
        builder.append("<CB>收银单</CB><BR>");
        builder.append("交易编号：");
        builder.append(order.getCode());
        builder.append("<BR>交易日期：");
        builder.append(DateUtil.formatYYYYMMDD2(order.getPayTime()));
        builder.append("<BR>服务明细：");
        builder.append(order.getProductTitle());
        builder.append("<BR>服务时长：");
        builder.append(order.getDuration()+"min");
        builder.append("<BR>交易金额：");
        builder.append(new DecimalFormat("#.0").format(order.getPayAmount()));
        builder.append("元");
        builder.append("<BR>支付方式：");
        builder.append(OrderPayType.getLabel(order.getPayType()));
        builder.append("<BR>打印时间：");
        builder.append(DateUtil.toStandString(now));
        builder.append("<BR><BR><L1>预约请关注微信公众号Full愈</L1>");
        builder.append("<BR><BR>");
//        builder.append("<C><QR>https://mp.weixin.qq.com/mp/profile_ext?action=home&__biz=MzI3ODQ5ODQ2NA==</QR></C>");
        builder.append("<C><QRCODE>http://weixin.qq.com/r/mp/jxYQCBjEIEVfrVxr90Od</QRCODE></C>");
        builder.append("<BR>"+shop.getPrintMarks()+"");
        builder.append("<BR><BR>");
        String s = builder.toString();
        try{
            printUtilNew.print(shop.getPrintSn(),s,1);
        } catch (IOException e) {
            //{"errorcode":1,"errormsg":"打印机编号SN不正确"}
            JSONObject jsonObject = JSONObject.parseObject(e.getMessage());
            throw new BusinessException(jsonObject.getString("errormsg"));
        }
        return s;
    }

    /**
     * 订单编号填充
     *
     * @param order
     * @return
     */
    private void fillOrderCode(Order order) {
        String yearMonth = LocalDate.now().format(DateTimeFormatter.ofPattern("yyyyMMdd"));
        String orderCode = "S" + yearMonth + String.format("%07d", order.getId());
        order.setCode(orderCode);
        updateById(order);
    }

    /**
     * 修改订单
     *
     * @param dto
     */
    @Transactional(rollbackFor = Exception.class)
    public Map<Long, List<OrderDetail>> updateOrder(@RequestBody OrderDetailDto dto) {
        Long orderId = dto.getOrderId();
        String lockKey = getOrderLockKey(orderId);
        Map<Long, List<OrderDetail>> oldOrderDetailMap = new HashMap<>();
        synchronized (lockKey.intern()) {
            Order order = getById(orderId);
            if (AppointmentState.FINISHED.getValue().equals(order.getAppointmentState())) {
                throw new BusinessException("订单已完成，不允许修改");
            } else if (AppointmentState.CANCELED.getValue().equals(order.getAppointmentState())) {
                throw new BusinessException("订单已取消，不允许修改");
            }
            List<OrderDetail> orderDetails = orderDetailService.listByOrderId(orderId);
            oldOrderDetailMap.put(orderId, orderDetails);
            dto.setOldOrderDetails(orderDetails);
            orderDetailService.removeByOrderId(orderId);
            order.setShopId(dto.getShopId());
            if (OrderState.NOT_PAY.getValue().equals(order.getState()) && AppointmentType.AGENT.getValue().equals(order.getAppointmentType())) {
                order.setProductId(dto.getProductId());
                Product product = productService.getById(dto.getProductId());
                if (product == null) {
                    throw new BusinessException("产品不存在");
                }
                BigDecimal totalAmount = calculateTotalAmount(dto, product.getAmount());
                order.setTotalAmount(totalAmount);
                if (!BigDecimal.ZERO.equals(order.getIntegrationAmount())) {
                    order.setPayAmount(totalAmount.subtract(order.getIntegrationAmount()));
                } else {
                    order.setPayAmount(totalAmount);
                }
            }
            updateById(order);
            dto.setOrderId(orderId);
            dto.setCustomerId(order.getCustomerId());
            dto.setAppointmentType(order.getAppointmentType());
            orderDetailService.createDetail(dto, false, false);
        }
        return oldOrderDetailMap;
    }

    @Transactional(rollbackFor = Exception.class)
    public Map<Long, List<OrderDetail>> pcUpdateOrder(@RequestBody OrderDetailDto dto) {
        Long orderId = dto.getOrderId();
        String lockKey = getOrderLockKey(orderId);
        Map<Long, List<OrderDetail>> oldOrderDetailMap = new HashMap<>();
        synchronized (lockKey.intern()) {
            Order order = getById(orderId);

            if (AppointmentState.FINISHED.getValue().equals(order.getAppointmentState())) {
                throw new BusinessException("订单已完成，不允许修改");
            } else if (AppointmentState.CANCELED.getValue().equals(order.getAppointmentState())) {
                throw new BusinessException("订单已取消，不允许修改");
            }
            List<OrderDetail> orderDetails = orderDetailService.listByOrderId(orderId);
            
            if(orderDetails.size()>0) {//只修改支付方式时走这个条件；
                if(!order.getProductTitle().trim().equals("接待")&&dto.getBedIdList().size()==0){
                    throw new BusinessException("请选择床位");
                }
                if (!order.getProductTitle().trim().equals("接待") && orderDetails.get(0).getDuration() == dto.getDurationMinutes()&& orderDetails.get(0).getBedId().equals(dto.getBedIdList().get(0)) && orderDetails.get(0).getStartTime().equals(dto.getStartTime()) && (dto.getMassagistIdList().size()!= 0 && dto.getMassagistIdList().get(0) == orderDetails.get(0).getMassagistId())) {
                    int i = 0;
                    order.setPayType(dto.getPayType());
                    updateById(order);
                    return oldOrderDetailMap;
                }
                if(dto.getMassagistIdList().size()==0){
                   //增加修改信息
                    order.setPayType(dto.getPayType());
                    updateById(order);
                    OrderDetail od=orderDetails.get(0);
                    od.setBedId(dto.getBedIdList().get(0));
                    od.setStartTime(dto.getStartTime());
                    od.setEndTime(dto.getStartTime().plusMinutes(orderDetails.get(0).getDuration()));
                    orderDetailService.updateById(od);
                    orderDetailService.extendShifts(Collections.singletonList(od));
                    return oldOrderDetailMap;
                }

            }
            oldOrderDetailMap.put(orderId, orderDetails);
            dto.setOldOrderDetails(orderDetails);
            orderDetailService.removeByOrderId(orderId);
            order.setPayType(dto.getPayType());
            order.setShopId(dto.getShopId());
            updateById(order);
            dto.setOrderId(orderId);
            dto.setAppointmentType(order.getAppointmentType());
            if (OrderType.RECEPTION.getValue().equals(order.getType())) {
                orderDetailService.createReceptionDetail(dto);
                return oldOrderDetailMap;
            }
            dto.setCustomerId(order.getCustomerId());
            //验证床位是否被占用
            //orderDetailService.createDetail(dto, true, false);
            //不验证床位是否被占
            orderDetailService.createDetail0410(dto, true, false);
        }
        return oldOrderDetailMap;
    }

    /**
     * 小程序取消
     *
     * @param id
     * @param cancelReason
     */
    @Transactional(rollbackFor = Exception.class)
    public void cancelOrder(Long id, String cancelReason) {
        String lockKey = getOrderLockKey(id);
        synchronized (lockKey.intern()) {
            Order order = getById(id);
            if (order == null) {
                throw new BusinessException("订单不存在");
            }
            Integer state = order.getState();
            if (!(OrderState.NOT_PAY.getValue().equals(state) || OrderState.PAID_NOT_COMMENT.getValue().equals(state) || OrderState.PAID_COMMENTED.getValue().equals(state))) {
                throw new BusinessException("订单状态验证不通过，无法取消订单");
            }
            if ((OrderState.PAID_NOT_COMMENT.getValue().equals(state) || OrderState.PAID_COMMENTED.getValue().equals(state)) && !OrderType.RECEPTION.getValue().equals(order.getType())) {

                refundOrder(id, order.getPayAmount(), RefundType.CANCEL.getValue());
                if (!BigDecimal.ZERO.equals(order.getIntegrationAmount())) {
                    integrationService.revocationIntegration(id, order.getCustomerId());
                }
                //确保取消订单状态一旦确定不可以修改，表示订单谁取消的
                if (!ObjUtil.isEmpty(order) && (order.getCancelOrderType()==null||order.getCancelOrderType()==5)) {
                    order.setCancelOrderType(0);
                }
                updateById(order);
                return;
            }
            order.setState(OrderState.CANCELED.getValue());
            order.setAppointmentState(AppointmentState.CANCELED.getValue());
            order.setCancelReason(cancelReason);
            //确保取消订单状态一旦确定不可以修改
            if (!ObjUtil.isEmpty(order) && (order.getCancelOrderType()==null||order.getCancelOrderType()==5)) {
                order.setCancelOrderType(0);
            }
            updateById(order);
            orderDetailService.refundOrder(id, true);
            if (OrderType.RECEPTION.getValue().equals(order.getType())) {
                return;
            }
            if (!OrderState.NOT_PAY.getValue().equals(state)) {
                handleBookingCancelNotice(id);
            }
            if (!BigDecimal.ZERO.equals(order.getIntegrationAmount())) {
                integrationService.revocationIntegration(id, order.getCustomerId());
            }
        }
    }

    @Transactional(rollbackFor = Exception.class)
    public void cancelRefundOrder(Long id, String cancelReason) {
        String lockKey = getOrderLockKey(id);
        synchronized (lockKey.intern()) {
            Order order = getById(id);
            if (order == null) {
                throw new BusinessException("订单不存在");
            }
            if (!OrderState.REFUNDED.getValue().equals(order.getState())) {
                throw new BusinessException("支付状态验证不通过，无法取消订单");
            }
            if (AppointmentState.CANCELED.getValue().equals(order.getAppointmentState())) {
                return;
            }
            //order.setState(OrderState.CANCELED.getValue());
            order.setAppointmentState(AppointmentState.CANCELED.getValue());
            order.setCancelReason(cancelReason);
            order.setCancelOrderType(2);//标识后台取消
            updateById(order);
            orderDetailService.refundOrder(id, true);
            handleBookingCancelNotice(id);
        }
    }

    public Order orderDetail(Long id) {
        Order order = getById(id);
        buildSetCustomerName(order);
        if (OrderType.PRODUCT.getValue().equals(order.getType()) || OrderType.RECEPTION.getValue().equals(order.getType())) {
            List<OrderDetail> orderDetails = orderDetailService.listByOrderId(id);
            orderDetailService.buildBedName(orderDetails);
            orderDetailService.buildProjectTitle(orderDetails);
            order.setOrderDetailList(orderDetails);
            OrderDetail orderDetail = orderDetails.get(0);
            order.setDuration(orderDetail.getDuration());
            order.setStartTime(orderDetail.getStartTime());
            order.setEndTime(orderDetail.getEndTime());
        } else if (OrderType.COUPON.getValue().equals(order.getType())) {
            List<CustomerCoupon> customerCoupons = customerCouponService.listByOrderId(id);
            customerCouponService.buildCoupon(customerCoupons);
            order.setCustomerCouponList(customerCoupons);
        }
        buildCouponAmount(Collections.singletonList(order));
        return order;
    }

    /**
     * 获取订单+详情
     *
     * @param id
     * @return
     */
    public Order infoWithDetail(Long id) {
        Order order = getById(id);
        if (order == null) {
            return order;
        }
        buildDetail(Collections.singletonList(order));
        return order;
    }

    /**
     * 获取订单+详情
     *
     * @param id
     * @return
     */
    public Order infoWithDetailOrSendInfo(Long id) {
        Order order = getById(id);
        if (order == null) {
            return order;
        }
        buildDetailNewSendInfo(Collections.singletonList(order));
        return order;
    }
    private void buildDetailNewSendInfo(List<Order> list) {
        if (CollectionUtils.isEmpty(list)) {
            return;
        }
        List<Long> idList = list.stream().map(Order::getId).collect(Collectors.toList());
        Map<Long, List<OrderDetail>> orderDetialMap = orderDetailService.massagistMapByOrderIdList(idList);
        List<Long> massagistIdList = orderDetialMap.values().stream()
                .flatMap(List::stream).filter(s -> s.getMassagistId() != null).map(OrderDetail::getMassagistId)
                .collect(Collectors.toList());
        if (!CollectionUtils.isEmpty(massagistIdList)) {
            List<Massagist> massagistList = massagistService.listByIds(massagistIdList);
            Map<Long, Massagist> massagistMap = massagistList.stream().collect(Collectors.toMap(Massagist::getId, s -> s));
            orderDetialMap.forEach((k, v) -> v.forEach(s -> {
                Massagist massagist = massagistMap.getOrDefault(s.getMassagistId(), null);
                if (massagist == null) {
                    return;
                }
                s.setMassagist(massagist);
            }));
        }
        list.forEach(s -> {
            s.setUseUserMobile("无");
            if(s.getIsGift()){
                GiveGift gift=giveGiftService.getByOrderId(s.getId());
                if(gift!=null){
                    GiveGiftHistory history=giveGiftHistoryService.getByGiveGiftId(gift.getId());
                    if(history!=null){
                        Customer customer=customerService.getById(history.getToCustomerId());
                        if(customer!=null){
                            s.setUseUserMobile(customer.getPhone().substring(0,3)+"****"+customer.getPhone().substring(7,11));
                            s.setUseUserTime(history.getCreateTime());
                        }
                    }
                }
            }
            List<OrderDetail> orderDetailList = orderDetialMap.getOrDefault(s.getId(), Collections.emptyList());
            if (CollectionUtils.isEmpty(orderDetailList)) {
                return;
            }

            OrderDetail orderDetail = orderDetailList.get(0);
            s.setDuration(orderDetail.getDuration());
            s.setStartTime(orderDetail.getStartTime());
            DateTimeFormatter formatter = DateTimeFormatter.ofPattern("MM月dd日，E，a HH:mm", Locale.CHINA);
            s.setCardimage(formatter.format(orderDetail.getStartTime()));
            s.setEndTime(orderDetail.getEndTime());
            s.setOrderDetailList(orderDetailList);
        });
    }

    /**
     * 小程序获取获取疗愈记录
     *
     * @param params
     * @return
     */
    public PageInfo<Order> pageWithDetail(Map<String, Object> params) {
        PageInfo<Order> page = page(params);
        buildDetail(page.getList());
        return page;
    }

    private void buildDetail(List<Order> list) {
        if (CollectionUtils.isEmpty(list)) {
            return;
        }
        List<Long> idList = list.stream().map(Order::getId).collect(Collectors.toList());
        Map<Long, List<OrderDetail>> orderDetialMap = orderDetailService.massagistMapByOrderIdList(idList);
        List<Long> massagistIdList = orderDetialMap.values().stream()
                .flatMap(List::stream).filter(s -> s.getMassagistId() != null).map(OrderDetail::getMassagistId)
                .collect(Collectors.toList());
        if (!CollectionUtils.isEmpty(massagistIdList)) {
            List<Massagist> massagistList = massagistService.listByIds(massagistIdList);
            Map<Long, Massagist> massagistMap = massagistList.stream().collect(Collectors.toMap(Massagist::getId, s -> s));
            orderDetialMap.forEach((k, v) -> v.forEach(s -> {
                Massagist massagist = massagistMap.getOrDefault(s.getMassagistId(), null);
                if (massagist == null) {
                    return;
                }
                s.setMassagist(massagist);
            }));
        }
        list.forEach(s -> {
            List<OrderDetail> orderDetailList = orderDetialMap.getOrDefault(s.getId(), Collections.emptyList());
            if (CollectionUtils.isEmpty(orderDetailList)) {
                return;
            }

            OrderDetail orderDetail = orderDetailList.get(0);
            s.setDuration(orderDetail.getDuration());
            s.setStartTime(orderDetail.getStartTime());
            DateTimeFormatter formatter = DateTimeFormatter.ofPattern("MM月dd日，E，a HH:mm", Locale.CHINA);
            s.setCardimage(formatter.format(orderDetail.getStartTime()));
            s.setEndTime(orderDetail.getEndTime());
            s.setOrderDetailList(orderDetailList);
        });
    }

    /**
     * 获取到店时间列表
     *
     * @param date            到店日期 yyyy-MM-dd
     * @param personCount     到店人数
     * @param projectId       项目id
     * @param durationMinutes 项目时长（分钟）
     * @return 到店时间，门店列表（门店id、床位id列表、疗愈师id列表）
     */
    public List<JSONObject> findArriveTimeList(String date, Integer personCount, Long projectId, Integer durationMinutes, Long shopId, Long massagistId) {
        return findArriveTimeList(date, personCount, projectId, durationMinutes, shopId, massagistId, null);
    }

    public List<JSONObject> findArriveTimeList(String date, Integer personCount, Long projectId, Integer durationMinutes, Long shopId, Long massagistId, Long customerId) {
        List<Shop> availableShopList = shopService.findAvailableShopList();
        if (CollectionUtils.isEmpty(availableShopList)) {
            log.error("查询到店时间失败，所有门店状态不可用，date={}", date);
            throw new BusinessException("暂无可用门店");
        }
        Integer bedType = projectService.findTypeById(projectId);
        if (bedType == null) {
            throw new BusinessException("项目类型有误");
        }
        List<Bed> allBedList = bedService.listByStatusAndTypeAndShopId(NormalState.EFFECTIVE.getValue(), bedType, shopId);
        if (CollectionUtils.isEmpty(allBedList)) {
            log.error("查询到店时间失败，所有床位状态不可用，date={}", date);
            if(projectId!=3) {//去除掉接待订单的验证
                throw new BusinessException("暂无可用床位");
            }
        }
        //弃用，增加了疗愈师技能判断
        // List<MassagistSchedules> allMassagistList = massagistSchedulesService.simpleListByDateAndShopId(date, shopId);
        //luxin 新增过滤技师是否会这个项目 findListByProjectIdAndShopId
        List<MassagistSchedules> allMassagistList=new ArrayList<>();
        if(projectId!=3){//不等于3标识，不是接待进来的
            allMassagistList = massagistSchedulesService.getBaseMapper().findListByProjectIdAndShopId(shopId,"%"+projectId+"%",date);
        }else{
            allMassagistList = massagistSchedulesService.getBaseMapper().findListByProjectIdAndShopId(shopId,"%%",date);
        }

        if (massagistId != null) {
            allMassagistList = allMassagistList.stream().filter(s -> massagistId.equals(s.getMassagistId())).collect(Collectors.toList());
        }
        //小程序端：客户已设为暂别的疗愈师不参与时段计算；指定了暂别技师时给出柔和提示
        if (customerId != null && projectId != 3) {
            if (massagistId != null && customerMassagistBlockService.isBlocked(customerId, massagistId)) {
                throw new BusinessException("该疗愈师暂不可预约，请选择其他疗愈师");
            }
            List<Long> blockedIdList = customerMassagistBlockService.blockedMassagistIds(customerId);
            if (!CollectionUtils.isEmpty(blockedIdList)) {
                allMassagistList = allMassagistList.stream()
                        .filter(s -> !blockedIdList.contains(s.getMassagistId()))
                        .collect(Collectors.toList());
            }
        }
        if (CollectionUtils.isEmpty(allMassagistList)) {
            log.error("查询到店时间失败，没有疗愈师排班数据，date={}", date);
            throw new BusinessException(massagistId != null
                    ? orderDetailService.specifiedTherapistMessage(massagistId, date, shopId,
                            "所选疗愈师暂不提供该项目，请选择其他疗愈师或项目")
                    : "当天暂无可预约的疗愈师，请选择其他日期");
        }
        List<OrderDetail> orderDetailList = orderDetailService.getBaseMapper().findSimpleListByStartDateAndShopId(date, shopId);
        LocalDateTime nowTime = DateUtil.stringToLocalDate(date).atTime(LocalTime.of(9, 50, 0));
        Shop shop = availableShopList.stream().filter(s -> shopId.equals(s.getId())).findFirst().get();
        if (DateUtil.getCurrentDateCode().equals(date)) {
            nowTime = LocalDateTime.now();
        } else {
            if (shop != null || Strings.isNotBlank(shop.getClockInTime())) {
                nowTime = DateUtil.stringToLocalDate(date).atTime(DateUtil.HHmmStrToTime(shop.getClockInTime()));
            }
        }
        LocalDateTime next15Time = DateUtil.findNextTime(nowTime);
        long l = DateUtil.diffMinutes(nowTime, next15Time);
        if (l < 5) {
            nowTime = next15Time;
        }
        LocalDateTime now = nowTime;
        int threadCount = Runtime.getRuntime().availableProcessors();
        ExecutorService executor = Executors.newFixedThreadPool(threadCount);
        List<CompletableFuture<List<JSONObject>>> futures = new ArrayList<>();

        List<MassagistSchedules> massagistScheduleList = allMassagistList;
        CompletableFuture<List<JSONObject>> future = CompletableFuture.supplyAsync(() -> {
                return getJsonObjects(now, orderDetailList, personCount, durationMinutes, shop, allBedList, massagistScheduleList,projectId,shopId,date);
        }, executor);
        futures.add(future);

        CompletableFuture<List<JSONObject>> allResults = CompletableFuture.allOf(futures.toArray(new CompletableFuture[0]))
                .thenApply(v -> futures.stream().flatMap(f -> f.join().stream()).collect(Collectors.toList()));
        List<JSONObject> resultList = new ArrayList<>();
        try {
            List<JSONObject> allObjectList = allResults.join();
            Map<String, List<JSONObject>> timeMap = allObjectList.stream().collect(Collectors.groupingBy(o -> o.getString("time")));
            timeMap.keySet().stream().sorted().forEach(time -> {
                JSONObject object = new JSONObject();
                object.put("time", time);
                object.put("state", 0);
                List<JSONObject> objects = timeMap.get(time);
                if (CollectionUtils.isEmpty(objects)) {
                    return;
                }
                List<JSONObject> shopList = objects.stream().filter(o -> o.getInteger("state") == 1).collect(Collectors.toList());
                if (!CollectionUtils.isEmpty(shopList)) {
                    object.put("state", 1);
                    object.put("shopList", shopList);
                }
                resultList.add(object);
            });
        } catch (Exception e) {
            log.error("查询预约时段失败", e);
            throw new BusinessException("系统错误");
        } finally {
            executor.shutdown();
        }
        return resultList;
    }

    private List<JSONObject> getJsonObjects(LocalDateTime time, List<OrderDetail> detailList, Integer personCount, Integer durationMinutes, Shop shop, List<Bed> bedList, List<MassagistSchedules> massagistList,long projectId,long shopId,String date) {
        if (projectId != 3) {
            List<OrderDetail> bookings = detailList == null ? Collections.emptyList() : detailList;
            List<MassagistSchedules> allPeople = massagistSchedulesService.getBaseMapper()
                    .findListByProjectIdAndShopId(shopId, "%%", date);
            List<JSONObject> timeList = new LinkedList<>();
            LocalDateTime opening = time.toLocalDate().atTime(DateUtil.HHmmStrToTime(shop.getClockInTime()));
            if (time.isBefore(opening)) time = opening.minusMinutes(2);
            LocalDateTime closing = time.toLocalDate().atTime(DateUtil.HHmmStrToTime(shop.getClockOutTime()));
            while (true) {
                time = DateUtil.findNextTime(time);
                if (!time.isBefore(closing)) break;
                final LocalDateTime startTime = time;
                LocalDateTime endTime = startTime.plusMinutes(durationMinutes);
                JSONObject object = new JSONObject();
                object.put("time", DateUtil.toHHmm(startTime));
                object.put("state", 0);
                List<Bed> availableBeds = bedList.stream().filter(bed -> bookings.stream()
                        .filter(d -> Objects.equals(bed.getId(), d.getBedId()))
                        .noneMatch(d -> BookingAvailability.overlaps(startTime, endTime, d.getStartTime(), d.getEndTime(), shop.getIntervalMinute())))
                        .collect(Collectors.toList());
                Set<Long> scheduled = BookingAvailability.scheduledIds(startTime, massagistList);
                List<Long> availablePeople = scheduled.stream().filter(id -> bookings.stream()
                        .filter(d -> id.equals(d.getMassagistId()))
                        .noneMatch(d -> BookingAvailability.overlaps(startTime, endTime, d.getStartTime(), d.getEndTime(), 0)))
                        .sorted().collect(Collectors.toList());
                int capacity = Math.min(BookingAvailability.freeCount(startTime, endTime, allPeople, bookings, null),
                        BookingAvailability.freeCount(startTime, endTime, massagistList, bookings, projectId));
                if (availableBeds.size() >= personCount && availablePeople.size() >= personCount && capacity >= personCount) {
                    object.put("state", 1);
                    JSONObject availableShop = new JSONObject();
                    availableShop.put("id", shop.getId());
                    availableShop.put("name", shop.getName());
                    availableShop.put("address", shop.getAddress());
                    availableShop.put("bedIdList", availableBeds.stream().map(Bed::getId).collect(Collectors.toList()));
                    availableShop.put("massagistIdList", availablePeople);
                    object.put("shop", availableShop);
                }
                timeList.add(object);
            }
            fillTimeList(timeList);
            return timeList;
        }
        else {
            if (CollectionUtils.isEmpty(detailList)) {
                detailList = new ArrayList<>();
            }
            Map<Long, List<OrderDetail>> massagistDetailMap = new HashMap<>(detailList.size());
            detailList.forEach(d -> {
                List<OrderDetail> massagistDetailList = massagistDetailMap.get(d.getMassagistId());
                if (massagistDetailList == null) {
                    massagistDetailList = new ArrayList<>();
                }
                massagistDetailList.add(d);
                massagistDetailMap.put(d.getMassagistId(), massagistDetailList);
            });
            String clockOutTime = shop.getClockOutTime();
            Integer endHour = Integer.valueOf(clockOutTime.substring(0, 2));
            List<JSONObject> timeList = new LinkedList<JSONObject>();
            LocalDateTime shopClockInTime = LocalDate.now().atTime(DateUtil.HHmmStrToTime(shop.getClockInTime()));
            if (time.isBefore(shopClockInTime)) {
                time = DateUtil.minusTimeByMinutes(shopClockInTime, 2);
            }
            List<MassagistSchedules> jishiCount = massagistSchedulesService.getBaseMapper().findListByProjectIdAndShopId(shopId, "%%", date);
            while (true) {
                JSONObject object = new JSONObject();
                time = DateUtil.findNextTime(time);
                int hour = time.getHour();
                if (hour >= endHour) {
                    break;
                }
                object.put("time", DateUtil.toHHmm(time));
                object.put("state", 0);
                LocalDateTime dateTime = LocalDateTime.parse(time.toString());
                DateTimeFormatter targetFormat = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
                String result = dateTime.format(targetFormat);
                LocalDateTime startTime =DateUtil.string2DateTime(result);
                LocalDateTime endTime = DateUtil.addTimeByMinutes(startTime, durationMinutes);
                LocalDateTime aEndTime = DateUtil.addTimeByMinutes(endTime, shop.getIntervalMinute());

                List<MassagistSchedules> availableMassagistList = new ArrayList<>();
                massagistList.forEach(m -> {
                    if (DateUtil.toHHmm(m.getStartTime()).compareTo(DateUtil.toHHmm(startTime)) > 0
                            || DateUtil.toHHmm(m.getEndTime()).compareTo(DateUtil.toHHmm(endTime)) < 0) {
                        return;
                    }
                    List<OrderDetail> massagistDetailList = massagistDetailMap.get(m.getMassagistId());
                    boolean isAvailable = true;
                    if (CollectionUtils.isEmpty(massagistDetailList)) {
                        isAvailable = true;
                    } else {
                        isAvailable = massagistDetailList.stream().allMatch(d -> {
                            LocalDateTime detailEndTime = d.getEndTime();
                            if(d.getProjectId()!=3){
                                detailEndTime = DateUtil.addTimeByMinutes(detailEndTime, shop.getIntervalMinute());//间隔15分钟；去掉间隔的
                            }
                            //detailEndTime = DateUtil.addTimeByMinutes(detailEndTime, shop.getIntervalMinute());
                            return DateUtil.toHHmm(startTime).compareTo(DateUtil.toHHmm(detailEndTime)) >= 0
                                    || DateUtil.toHHmm(aEndTime).compareTo(DateUtil.toHHmm(d.getStartTime())) <= 0;
                        });
                    }
                    if (isAvailable) {
                        availableMassagistList.add(m);
                    }
                });
                if (CollectionUtils.isEmpty(availableMassagistList)) {
                    timeList.add(object);
                    continue;
                }

                //luxin 增加某一时刻是否还可以下单

                //不提前分配技师，需要验证此时此刻此项目订单量和技师数量是否匹配
                //同一时刻的所有订单量不能大于技师上班人数
                //detailList   allMassagistList
                int checkStatus = 0;
                int count=0;
                //需要增加判断开始下单时间以后的每个15分钟内的订单量
                List<MassagistSchedules> allPeople = massagistSchedulesService.getBaseMapper().findListByProjectIdAndShopId(shopId, "%%", date);
                List<MassagistSchedules> projectAllPeople = massagistSchedulesService.getBaseMapper().findListByProjectIdAndShopId(shopId, "%"+projectId+"%", date);
                //去掉不在此工作时间的技师
                List<MassagistSchedules> allPeopleCountNew = new ArrayList<>();
                allPeople.forEach(m->{if((m.getStartTime().isBefore(startTime.toLocalTime())||m.getStartTime().equals(startTime.toLocalTime()) )&& (m.getEndTime().isAfter(endTime.toLocalTime())||m.getEndTime().equals(endTime.toLocalTime()))){
                    allPeopleCountNew.add(m);
                }});
                allPeople = allPeopleCountNew;

                for(int i = 1; i <= (durationMinutes / 15); i++){
                    count=personCount;
                    LocalDateTime startTimeCheck =startTime.plusMinutes((i-1)*15) ;
                    LocalDateTime endTimeCheck = startTime.plusMinutes(i * 15);
                    if(detailList!=null && detailList.size()>0){
                        for (OrderDetail d : detailList) {
                            LocalDateTime detailStartTime = d.getStartTime();
                            LocalDateTime detailEndTime = d.getEndTime();
                            boolean bl = DateUtil.toHHmm(startTimeCheck).compareTo(DateUtil.toHHmm(detailStartTime)) >= 0
                                    && DateUtil.toHHmm(endTimeCheck).compareTo(DateUtil.toHHmm(detailEndTime)) <= 0;
                            if (bl) {
                                //说明此订单在下单的时间内
                                count++;
                            }
                        }
                    }
                    if(count>allPeople.size()){
                        checkStatus=1;
                        //throw new BusinessException("抱歉，疗愈师不满足人数要求!");
                    }
                }




                int massagistSize = availableMassagistList.size();
                if ( personCount > massagistSize || checkStatus != 0) {
                    timeList.add(object);
                    continue;
                }
                object.put("state", 1);
                JSONObject availableShop = new JSONObject();
                availableShop.put("id", shop.getId());
                availableShop.put("name", shop.getName());
                availableShop.put("address", shop.getAddress());
                availableShop.put("bedIdList", new int[0]);
                availableShop.put("massagistIdList", availableMassagistList.stream().map(MassagistSchedules::getMassagistId).collect(Collectors.toList()));
                object.put("shop", availableShop);
                timeList.add(object);
            }
            fillTimeList(timeList);
            return timeList;
        }
    }

    private void fillTimeList(List<JSONObject> timeList) {
        if (timeList == null || timeList.isEmpty()) {
            return;
        }
        JSONObject firstObj = timeList.get(0);
        String timeStr = firstObj.getString("time");
        String[] parts = timeStr.split(":");
        if (parts.length != 2) {
            return;
        }
        int hour = Integer.parseInt(parts[0]);
        int minute = Integer.parseInt(parts[1]);
        int pointsToAdd = minute / 15;
        List<JSONObject> pointsToInsert = new ArrayList<>();
        for (int i = pointsToAdd - 1; i >= 0; i--) {
            int newMinute = i * 15;
            JSONObject point = new JSONObject();
            point.put("time", String.format("%02d:%02d", hour, newMinute));
            point.put("state", 0);
            pointsToInsert.add(point);
        }
        timeList.addAll(0, pointsToInsert);
    }

    /**
     * 支付成功回调
     *
     * @param dataMap
     */
    public void handlePaySuccess(Map<String, Object> dataMap) {
        String orderSn = (String) dataMap.get("mchOrderNo");
        String outTransId = "";
        String partyOrderId = "";

        if (dataMap.containsKey("outTransId")) {
            outTransId = (String) dataMap.get("outTransId");
        }
        if (dataMap.containsKey("partyOrderId")) {
            partyOrderId = (String) dataMap.get("partyOrderId");
        }

        String hfSeqId = (String) dataMap.get("hfSeqId");
        String merOrdId = (String) dataMap.get("merOrdId");

        if (orderSn.contains("A")) {
            orderSn = orderSn.substring(0, orderSn.lastIndexOf("A"));
        }

        Order order = getByOrderSn(orderSn);
        if (order == null) {
            log.error("[OmsOrderService - paySuccess] 订单信息未找到 orderSn={}", orderSn);
            return;
        }
        Long orderId = order.getId();

        String lockKey = getOrderLockKey(orderId);

        synchronized (lockKey.intern()) {
            order = getById(orderId);

            Integer type = order.getType();
            Integer state = order.getState();

            BigDecimal payAmount = order.getPayAmount();
            BigDecimal respAmount = BigDecimal.valueOf(Integer.parseInt((String) dataMap.getOrDefault("amount", "")));

            if (respAmount.compareTo(payAmount.multiply(BigDecimal.valueOf(100))) != 0) {
                log.warn("订单金额与支付金额不匹配, orderSn={}, payAmount={}, respAmount={}", orderSn, payAmount, respAmount);
                throw new BusinessException("订单金额与支付金额不匹配");
            }

            if (!OrderState.NOT_PAY.getValue().equals(state) && !OrderState.TIMEOUT.getValue().equals(state)) {
                log.warn("订单状态异常");
                return;
            }
//            if (OrderState.TIMEOUT.getValue().equals(state)) {
//                log.warn("超时自动退款，orderId={}", orderId);
//                self.doRefundOrder(orderId, payAmount, type);
//                return;
//            }

            order.setState(OrderState.PAID_NOT_COMMENT.getValue());
            if (OrderType.COUPON.getValue().equals(order.getType())) {
                order.setAppointmentState(AppointmentState.FINISHED.getValue());
            } else {
                order.setAppointmentState(AppointmentState.DOING.getValue());
                handleBookingSuccessNotice(orderId);
            }
            if (dataMap.containsKey("payChannel")) {
                String payChannel = (String) dataMap.get("payChannel");
                if (Strings.isNotBlank(payChannel)) {
                    order.setPayChannel(payChannel);
                }
            }
            order.setPayTime(LocalDateTime.now());
            order.setOutTransId(outTransId);
            order.setPartyOrderId(partyOrderId);
            order.setHfSeqId(hfSeqId);
            order.setMerOrdId(merOrdId);

            Integer payType = order.getPayType();
            if (type == 0 && payType == null) {
                Object payTypeObj = dataMap.getOrDefault("payType", OrderPayType.WECHAT.getValue());
                order.setPayType(Integer.parseInt(payTypeObj.toString()));
            }
            order.setCancelOrderType(5);//5标识超时被取消了，改为5恢复正常状态
            updateById(order);
            productService.addSale(order.getProductId());
            if (OrderType.PRODUCT.getValue().equals(order.getType())) {
                String code = order.getCode();
                String key = RedisKey.ORDER_PAYED + code;
                redisUtil.setStringDay(key, code, 1);

                //回调时；将小程序生成的大于1人的订单进行拆分---------------------------------------------------------------------
                List<OrderDetail> orderDetails = orderDetailService.listByOrderId(orderId);
                //如果订单超时，又支付了  要强制将超时的订单 改为正常状态
                //orderDetails 取第一个值

                if(orderDetails != null && !orderDetails.isEmpty()){
                    OrderDetail od=orderDetails.get(0);
                    od.setState(0);
                    orderDetailService.updateById(od);
                }
                if(orderDetails.size()>1){
                    //积分的处理--------------------------------------------------------------------------------
                    int count=orderDetails.size();
                    order.setTotalAmount(order.getTotalAmount().divide(BigDecimal.valueOf(count),2 , RoundingMode.HALF_UP));
                    BigDecimal allmoney = order.getPayAmount().add(order.getIntegrationAmount());
                    //每个订单应该支付多少钱
                    order.setPayAmount(allmoney.divide(BigDecimal.valueOf(count), 2, RoundingMode.HALF_UP));

                    if(order.getUseIntegrationState()==1) {//判断订单是否使用了积分支付，只有积分支付才会走这个
                        //将订单的积分返回去
                        integrationService.revocationIntegration(orderId, order.getCustomerId());
                        //将原订单积分记录删除
                        List<Integration> originalIntegrationList = integrationService.list(new QueryWrapper<Integration>().eq("order_id", orderId).eq("customer_id", order.getCustomerId()));
                        if (originalIntegrationList.size() > 0) {
                            integrationService.removeById(originalIntegrationList.get(0).getId());
                        }
                        //重新订单进行积分支付
                        BigDecimal roundedAmount = order.getPayAmount().setScale(0, RoundingMode.CEILING);
                        Long needIntegration = Long.parseLong(roundedAmount.toString());
                        Integration integration = integrationService.useIntegration(needIntegration, order.getCustomerId(), "积分抵扣");

                        if (integration != null) {
                            integration.setOrderId(order.getId());
                            integrationService.updateById(integration);
                            BigDecimal integrationAmount = BigDecimal.valueOf(integration.getScore());
                            if (integrationAmount.compareTo(roundedAmount) < 0) {
                                order.setPayAmount(roundedAmount.subtract(integrationAmount));
                                order.setIntegrationAmount(integrationAmount);
                            } else {
                                order.setPayAmount(BigDecimal.ZERO);
                                order.setIntegrationAmount(roundedAmount);
                            }
                        }
                    }
                    updateById(order);
                    for (int i = 1; i < count; i++) {
                        Order newOrder = new Order();
                        BeanUtil.copyProperties(order, newOrder, "id","code");
                        newOrder.setCode(order.getCode()+"-"+i);
                        newOrder.setPrentOrderId(order.getId());
                        newOrder.setIntegrationAmount(BigDecimal.ZERO);
                        newOrder.setPayAmount(allmoney.divide(BigDecimal.valueOf(count), 2, RoundingMode.HALF_UP));
                        newOrder.setUseIntegrationState(0);
                        //创建新订单
                        save(newOrder);
                        if(order.getUseIntegrationState()==1) {//判断订单是否使用了积分支付，只有积分支付才会走这个
                            BigDecimal roundedAmount = newOrder.getPayAmount().setScale(0, RoundingMode.CEILING);
                            Long needIntegration = Long.parseLong(roundedAmount.toString());
                            Integration integration = integrationService.useIntegration(needIntegration, newOrder.getCustomerId(), "积分抵扣");
                            if (integration != null) {
                                integration.setOrderId(order.getId());
                                integrationService.updateById(integration);
                                BigDecimal integrationAmount = BigDecimal.valueOf(integration.getScore());
                                if (integrationAmount.compareTo(roundedAmount) < 0) {
                                    newOrder.setPayAmount(roundedAmount.subtract(integrationAmount));
                                    newOrder.setIntegrationAmount(integrationAmount);
                                } else {
                                    newOrder.setPayAmount(BigDecimal.ZERO);
                                    newOrder.setIntegrationAmount(roundedAmount);
                                }
                                newOrder.setUseIntegrationState(1);
                            }
                        }
                        //更新新订单
                        updateById(newOrder);
                        //更新订单详情
                        List<OrderDetail> newOrderDetails = orderDetails.stream().skip(i).collect(Collectors.toList());
                        for (OrderDetail orderDetail : newOrderDetails) {
                            orderDetail.setOrderId(newOrder.getId());
                            orderDetail.setState(0);
                            orderDetailService.updateById(orderDetail);
                        }
                    }
                }
                //取最小值时备份
                /*if(orderDetails.size()>1){
                    //积分的处理--------------------------------------------------------------------------------
                    int count=orderDetails.size();
                    order.setTotalAmount(order.getTotalAmount().divide(BigDecimal.valueOf(count),2 , RoundingMode.HALF_UP));
                    BigDecimal allmoney = order.getPayAmount().add(order.getIntegrationAmount());
                    //每个订单应该支付多少钱
                    order.setPayAmount(allmoney.divide(BigDecimal.valueOf(count), 2, RoundingMode.HALF_UP));
                    //将订单的积分返回去
                    integrationService.revocationIntegration(orderId, order.getCustomerId());
                    //将原订单积分记录删除
                    List<Integration> originalIntegrationList=integrationService.list(new QueryWrapper<Integration>().eq("order_id", orderId).eq("customer_id",order.getCustomerId()));
                    if(originalIntegrationList.size()>0){
                        integrationService.removeById(originalIntegrationList.get(0).getId());
                    }
                    //重新订单进行积分支付
                    BigDecimal roundedAmount = order.getPayAmount().setScale(0, RoundingMode.CEILING);
                    Long needIntegration = Long.parseLong(roundedAmount.toString());
                    Integration integration = integrationService.useIntegration(needIntegration, order.getCustomerId(), "积分抵扣");

                    if (integration != null) {
                        integration.setOrderId(order.getId());
                        integrationService.updateById(integration);
                        BigDecimal integrationAmount = BigDecimal.valueOf(integration.getScore());
                        if (integrationAmount.compareTo(roundedAmount) < 0) {
                            order.setPayAmount(roundedAmount.subtract(integrationAmount));
                            order.setIntegrationAmount(integrationAmount);
                        } else {
                            order.setPayAmount(BigDecimal.ZERO);
                            order.setIntegrationAmount(roundedAmount);
                        }
                    }
                    updateById(order);
                    for (int i = 1; i < count; i++) {
                        Order newOrder = new Order();
                        BeanUtil.copyProperties(order, newOrder, "id","code");
                        newOrder.setCode(order.getCode()+"-"+i);
                        newOrder.setPrentOrderId(order.getId());
                        newOrder.setIntegrationAmount(BigDecimal.ZERO);
                        newOrder.setPayAmount(allmoney.divide(BigDecimal.valueOf(count), 2, RoundingMode.HALF_UP));
                        //创建新订单
                        save(newOrder);

                        roundedAmount = newOrder.getPayAmount().setScale(0, RoundingMode.CEILING);
                        needIntegration = Long.parseLong(roundedAmount.toString());
                        integration = integrationService.useIntegration(needIntegration, newOrder.getCustomerId(), "积分抵扣");
                        if (integration != null) {
                            integration.setOrderId(order.getId());
                            integrationService.updateById(integration);
                            BigDecimal integrationAmount = BigDecimal.valueOf(integration.getScore());
                            if (integrationAmount.compareTo(roundedAmount) < 0) {
                                newOrder.setPayAmount(roundedAmount.subtract(integrationAmount));
                                newOrder.setIntegrationAmount(integrationAmount);
                            } else {
                                newOrder.setPayAmount(BigDecimal.ZERO);
                                newOrder.setIntegrationAmount(roundedAmount);
                            }
                        }
                        //更新新订单
                        updateById(newOrder);
                        //更新订单详情
                        List<OrderDetail> newOrderDetails = orderDetails.stream().skip(i).collect(Collectors.toList());
                        for (OrderDetail orderDetail : newOrderDetails) {
                            orderDetail.setOrderId(newOrder.getId());
                            orderDetail.setState(0);
                            orderDetailService.updateById(orderDetail);
                        }
                    }
                }*/
            }
            if (OrderType.COUPON.getValue().equals(order.getType())) {
                String code = order.getCode();
                String key = RedisKey.ORDER_PAYED + code;
                redisUtil.setStringDay(key, code, 1);
            }
        }
        afterOrderPaid(order);
    }

    /**
     * 支付完成后续逻辑
     *
     * @param order
     */
    public void afterOrderPaid(Order order) {
        Long orderId = order.getId();
        if (OrderType.COUPON.getValue().equals(order.getType())) {
            Integer quantity = order.getQuantity() == null ? 1 : order.getQuantity();
            customerCouponService.buildCouponList(orderId, order.getProductId(), order.getCustomerId(), order.getIsGift(), quantity, order.getPayAmount());
            // 某些收款路径在发券后还会保存原order对象，不能用旧的默认0覆盖数据库快照。
            Order persisted = getById(orderId);
            if (persisted == null) throw new BusinessException("券包购买订单不存在");
            order.setRewardMemberMonths(persisted.getRewardMemberMonths());
        }
    }

    public Order getByOrderSn(String orderSn) {
        return getOne(new LambdaQueryWrapper<Order>()
                .eq(Order::getCode, orderSn)
                .last("limit 1")
        );
    }

    private String getOrderLockKey(Long orderId) {
        String lockKey = "orderLock:" + orderId;
        return lockKey;
    }

    /**
     * 生成支付
     *
     * @param curCustomerId
     * @param orderId
     * @param openId
     * @return
     */
    public Map<String, String> generatePayInfo(Long curCustomerId, Long orderId, String openId) {
        String lockKey = getOrderLockKey(orderId);
        // TODO redis锁
        synchronized (lockKey.intern()) {
            Order order = getById(orderId);
            if (order == null) {
                throw new ApiException("订单不存在");
            }
            Long customerId = order.getCustomerId();
            if (!Objects.equals(curCustomerId, customerId)) {
                throw new ApiException("不可支付他人订单");
            }

            Integer state = order.getState();
            if (!OrderState.NOT_PAY.getValue().equals(state)) {
                throw new ApiException("订单状态异常");
            }

            // TODO 检查产品 检查类型 检查支付方式
            Long productId = order.getProductId();
            Integer type = order.getType();
            Integer payType = order.getPayType();

            String productName = "Full愈券包";

            if (productId == null) {
                throw new ApiException("产品信息不能为空");
            }

            Product product = productService.getById(productId);
            if (product == null) {
                throw new ApiException("产品不存在");
            }
            Map<String, String> map = payService.generatePay(order, openId, product.getTitle());
            return map;
        }
    }

    /**
     * 订单超时
     *
     * @param orderId
     */
    public void handleTimeout(Long orderId) {
        String lockKey = getOrderLockKey(orderId);
        synchronized (lockKey.intern()) {
            Order order = getById(orderId);
            if (order == null) {
                return;
            }

            Integer orderState = order.getState();
            if (OrderState.NOT_PAY.getValue().equals(orderState)) {
                order.setState(OrderState.TIMEOUT.getValue());
                order.setAppointmentState(AppointmentState.CANCELED.getValue());
                order.setCancelOrderType(1);//超时取消
                updateById(order);
                BigDecimal integrationAmount = order.getIntegrationAmount();
                boolean needRearrangementBed = OrderType.PRODUCT.getValue().equals(order.getType());
                orderDetailService.refundOrder(orderId, needRearrangementBed);
                if (integrationAmount.equals(BigDecimal.ZERO)) {
                    return;
                }
                integrationService.revocationIntegration(orderId, order.getCustomerId());
            }
        }
    }

    /**
     * 退款callback
     *
     * @param orderId
     */
/*    public void handleRefundNotify(Long orderId) {
        String lockKey = getOrderLockKey(orderId);
        synchronized (lockKey.intern()) {
            Order order = getById(orderId);
            if (order == null) {
                log.warn("订单不存在");
                return;
            }

            Integer state = order.getState();
            if (!OrderState.REFUNDING.getValue().equals(state)) {
                log.warn("退款订单状态异常");
                return;
            }

            Integer refundState = order.getRefundState();
            if (refundState != 0) {
                return;
            }
            com.alibaba.fastjson.JSONObject resp = payService.queryRefundState(order);
            String transStat = resp.getString("trans_stat");
            String respDesc = resp.getString("resp_desc");
            BigDecimal refundAmount = resp.getBigDecimal("ord_amt");
            if ("S".equals(transStat)) {
                BigDecimal hasRefundAmount = order.getHasRefundAmount();
                if (hasRefundAmount == null) {
                    hasRefundAmount = BigDecimal.ZERO;
                }
                hasRefundAmount = hasRefundAmount.add(refundAmount);
                order.setRefundState(1);
                order.setRefundErrMsg("success");
                order.setHasRefundAmount(hasRefundAmount);
                order.setState(OrderState.REFUNDED.getValue());
                order.setAppointmentState(AppointmentState.CANCELED.getValue());
                updateById(order);
            } else if ("P".equals(transStat)) {
                log.warn("进行中");
            } else {
                order.setRefundState(-1);
                order.setRefundErrMsg(respDesc);
                updateById(order);
            }
        }
    }*/

    /**
     * 订单退款
     *
     * @param orderId
     * @param refundAmount 退款金额
     * @param type
     */
    public void refundOrder(Long orderId, BigDecimal refundAmount, Integer type) {
        if (orderId == null) {
            return;
        }
        String lockKey = getOrderLockKey(orderId);
        synchronized (lockKey.intern()) {

            try {
                self.doRefundOrder(orderId, refundAmount, type);
            } catch (MyOptimisticLockException e) {
                throw new ApiException("后台数据已更新, 重新操作");
            }
        }
    }

    /**
     * 退款失败的订单重新发起退款
     *
     * @param orderId
     */
    @Transactional(rollbackFor = Exception.class)
    public void errorRefundOrder(Long orderId) {
        String lockKey = getOrderLockKey(orderId);
        synchronized (lockKey.intern()) {
            Order order = getById(orderId);
            if (order == null) {
                throw new BusinessException("无订单，错误参数");
            }
            Integer refundState = order.getRefundState();
            if (refundState == null) {
                return;
            }
            if (!RefundState.ERROR.getValue().equals(refundState)) {
                throw new BusinessException("退款已发起，无需再次提交退款");
            }

            BigDecimal refundAmount = order.getPayAmount();
            RefundApply refundApply = refundApplyService.getByOrderId(orderId);
            if (refundApply != null) {
                refundAmount = refundApply.getRefundAmount();
            }
            String hfSeqId = payService.refundPay(order, refundAmount);
            //order.setRefundHfSeqId(hfSeqId);
            order.setState(OrderState.REFUNDING.getValue());
            order.setRefundState(RefundState.DOING.getValue());
            updateById(order);
        }
    }

    /**
     * 退款调用refundOrder
     *
     * @param orderId
     * @param refundAmount
     * @param type
     */
    @Transactional(rollbackFor = Exception.class)
    public void doRefundOrder(Long orderId, BigDecimal refundAmount, Integer type) {
        Order order = getById(orderId);
        if (order == null) {
            throw new ApiException("订单不存在");
        }

        Integer state = order.getState();
        if (OrderState.REFUNDED.getValue().equals(state)) {
            throw new ApiException("已退款订单不可重复操作退款");
        }
        if (OrderState.REFUNDING.getValue().equals(state)) {
            throw new ApiException("退款中订单不可重复操作退款");
        }
        BigDecimal payAmount = order.getPayAmount();

        if (refundAmount == null) {
            throw new ApiException("退款金额不能为空");
        }
        if (refundAmount.compareTo(payAmount) > 0) {
            throw new ApiException("退款金额不能大于支付金额");
        }
        BigDecimal hasRefundAmount = order.getHasRefundAmount();
        if (hasRefundAmount == null) {
            hasRefundAmount = BigDecimal.ZERO;
        }
        if (refundAmount.add(hasRefundAmount).compareTo(payAmount) > 0) {
            throw new ApiException("已退款金额与待退款金额合计值不能大于支付金额");
        }
        if (RefundType.CANCEL.getValue().equals(type)) {
            order.setAppointmentState(AppointmentState.CANCELED.getValue());
        }
        if (OrderPayType.COUPON.getValue().equals(order.getPayType())) {
            customerCouponService.handleRefund(order);
            order.setState(OrderState.REFUNDED.getValue());
            order.setRefundState(RefundState.SUCCESS.getValue());
        } else if (OrderPayType.WECHAT.getValue().equals(order.getPayType())) {
            BigDecimal zeroAmount = new BigDecimal("0.00");
            if (BigDecimal.ZERO.equals(refundAmount)||refundAmount.equals(zeroAmount)) {
                order.setState(OrderState.REFUNDED.getValue());
                order.setRefundState(RefundState.SUCCESS.getValue());
            } else {
                String hfSeqId = payService.refundPay(order, refundAmount);
                //order.setRefundHfSeqId(hfSeqId);
                order.setState(OrderState.REFUNDING.getValue());
                order.setRefundState(RefundState.DOING.getValue());
            }
        } else if (OrderPayType.QR_CODE.getValue().equals(order.getPayType())) {
            if (BigDecimal.ZERO.equals(refundAmount)) {
                order.setState(OrderState.REFUNDED.getValue());
                order.setRefundState(RefundState.SUCCESS.getValue());
            } else {
                String hfSeqId = payService.refundPay(order, refundAmount);
                //order.setRefundHfSeqId(hfSeqId);
                order.setState(OrderState.REFUNDING.getValue());
                order.setRefundState(RefundState.DOING.getValue());
            }
        } else if (OrderPayType.MEITUAN.getValue().equals(order.getPayType())) {
            order.setState(OrderState.REFUNDED.getValue());
            order.setRefundState(RefundState.SUCCESS.getValue());
        } else if (OrderPayType.CASH.getValue().equals(order.getPayType())) {
            order.setState(OrderState.REFUNDED.getValue());
            order.setRefundState(RefundState.SUCCESS.getValue());
        }
        updateById(order);
        if (!BigDecimal.ZERO.equals(order.getIntegrationAmount())) {
            integrationService.revocationIntegration(orderId, order.getCustomerId());
        }
        if (RefundType.CANCEL.getValue().equals(type)) {
            orderDetailService.refundOrder(order.getId(), true);
            handleBookingCancelNotice(orderId);
        }

    }

    /**
     * 处理退款webhook
     *
     * @param refundOrderSn 订单编号
     * @param hfSeqId       全局流水号
     * @param refundAmount  退款金额
     * @param transStat     交易状态
     * @param respDesc      异常信息
     */
    public void handleRefundNotify2(String refundOrderSn,
                                    String hfSeqId,
                                    BigDecimal refundAmount,
                                    String transStat,
                                    String respDesc) {
        Order order = getByOrderSn(refundOrderSn);

        if (order == null) {
            log.warn("订单不存在, orderSn={}", refundOrderSn);
            return;
        }

        String lockKey = getOrderLockKey(order.getId());
        synchronized (lockKey.intern()) {
            order = getById(order.getId());
            RefundApply refundApply = refundApplyService.getByOrderId(order.getId());
            boolean refundOrder = refundApply != null && RefundType.REFUND.getValue().equals(refundApply.getType());

            if (order == null) {
                log.warn("订单不存在, orderSn={}", refundOrderSn);
                return;
            }

            Integer state = order.getState();
//            if (!OrderState.REFUNDING.getValue().equals(state)) {
//                //
//                log.warn("退款订单状态异常");
//                return;
//            }

            Integer refundState = order.getRefundState();
            if (refundState != 0) {
                String refundHfSeqId = order.getRefundHfSeqId();
                if (!StringUtils.isEmpty(refundHfSeqId) && refundHfSeqId.equals(hfSeqId)) {
                    log.warn("退款回调重复接收：refundOrderSn={}", refundOrderSn);
                    return;
                }
            }
            if ("S".equals(transStat)) {
                BigDecimal hasRefundAmount = order.getHasRefundAmount();
                if (hasRefundAmount == null) {
                    hasRefundAmount = BigDecimal.ZERO;
                }
                hasRefundAmount = hasRefundAmount.add(refundAmount);
                order.setRefundState(RefundState.SUCCESS.getValue());
                order.setRefundErrMsg("success");
                order.setHasRefundAmount(hasRefundAmount);
                order.setState(OrderState.REFUNDED.getValue());
                order.setRefundHfSeqId(hfSeqId);
                if (OrderType.COUPON.getValue().equals(order.getType())) {
                    List<CustomerCoupon> customerCoupons = customerCouponService.listByOrderId(order.getId());
                    List<CustomerCoupon> customerCouponList = customerCoupons.stream().filter(e -> e.getState().equals(CouponState.EFFECTIVE.getValue())).collect(Collectors.toList());
                    customerCouponList.forEach(e -> e.setState(CouponState.REFUND_CANCEL.getValue()));
                    customerCouponService.updateBatchById(customerCouponList);
                    GiveGift giveGift = giveGiftService.getByOrderId(order.getId());
                    if (!ObjUtil.isEmpty(giveGift) && (giveGift.getState().equals(GiveGiftState.NO_SEND.getValue()) || giveGift.getState().equals(GiveGiftState.DOING.getValue()))) {
                        giveGift.setState(GiveGiftState.CANCELED.getValue());
                        giveGiftService.updateById(giveGift);
                    }
                    order.setAppointmentState(AppointmentState.CANCELED.getValue());
                } else {
                    if (!refundOrder) {
                        order.setAppointmentState(AppointmentState.CANCELED.getValue());
                        orderDetailService.refundOrder(order.getId(), true);
                    }
                }
                updateById(order);

            } else if ("P".equals(transStat)) {
                log.warn("进行中");
            } else {
                order.setRefundState(RefundState.ERROR.getValue());
                //order.setHfSeqId(hfSeqId);
                order.setRefundErrMsg(respDesc);
                updateById(order);
            }
        }
    }

    /**
     * 获取预约结算数据
     *
     * @param customerId 用户id
     * @param orderId    订单信息
     * @return
     */
    public CheckoutData getCheckoutData(Long customerId, Long orderId) {
        Order order = getById(orderId);
        if (order == null) {
            throw new ApiException("订单不存在");
        }
        Long orderCustomerId = order.getCustomerId();
        if (!Objects.equals(orderCustomerId, customerId)) {
            throw new ApiException("订单不属于当前用户");
        }

        CheckoutData checkoutData = new CheckoutData();

        List<OrderDetail> orderDetails = orderDetailService.listByOrderId(orderId);

        Integer totalDuration = orderDetails.stream().map(OrderDetail::getDuration).reduce(Integer::sum).orElse(0);

        Integer costCouponCount = totalDuration / NormalConst.PER_COUPON_COST_MINUTES + ((totalDuration % NormalConst.PER_COUPON_COST_MINUTES) != 0 ? 1 : 0);

        Integer canUseCount = customerCouponService.getCouponCountByCustomerId(customerId);

        checkoutData.setOrder(order);
        checkoutData.setCostCouponCount(costCouponCount);
        checkoutData.setCanUseCouponCount(canUseCount);

        //+++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
        //将未支付成功的订单的积分归还
        if (!BigDecimal.ZERO.equals(order.getIntegrationAmount())) {
            integrationService.revocationIntegration(order.getId(), order.getCustomerId());
            order.setIntegrationAmount(BigDecimal.valueOf(0));
            //将原订单积分记录删除
            List<Integration> originalIntegrationList=integrationService.list(new QueryWrapper<Integration>().eq("order_id", orderId).eq("customer_id",order.getCustomerId()));
            if(originalIntegrationList.size()>0){
                integrationService.removeById(originalIntegrationList.get(0).getId());
            }
        }

        // 年卡 / 通用折扣 / 积分 / Full愈券：四选一，默认现金最低，不叠加
        PriceContext priceContext = buildPriceContext(order, orderDetails, canUseCount, costCouponCount);
        applyPriceSource(order, priceContext, priceContext.result.getSelectedSource());
        //更新order表订单
        updatePriceFields(order);
        //+++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++

        fillPriceData(checkoutData, order, priceContext);
        return checkoutData;
    }

    /**
     * 结算页手动切换优惠方案：只改 priceSource 与应付金额，不改订单原价。
     */
    @Transactional(rollbackFor = Exception.class)
    public CheckoutData selectPriceSource(Long customerId, Long orderId, Integer priceSource) {
        if (priceSource == null) {
            throw new BusinessException("请选择优惠方案");
        }
        Order order = getById(orderId);
        if (order == null) {
            throw new ApiException("订单不存在");
        }
        if (!Objects.equals(order.getCustomerId(), customerId)) {
            throw new ApiException("订单不属于当前用户");
        }
        if (!OrderState.NOT_PAY.getValue().equals(order.getState())) {
            throw new BusinessException("订单状态已不可修改优惠");
        }

        List<OrderDetail> orderDetails = orderDetailService.listByOrderId(orderId);
        Integer totalDuration = orderDetails.stream().map(OrderDetail::getDuration).reduce(Integer::sum).orElse(0);
        Integer costCouponCount = totalDuration / NormalConst.PER_COUPON_COST_MINUTES
                + ((totalDuration % NormalConst.PER_COUPON_COST_MINUTES) != 0 ? 1 : 0);
        Integer canUseCount = customerCouponService.getCouponCountByCustomerId(customerId);

        PriceContext context = buildPriceContext(order, orderDetails, canUseCount, costCouponCount);
        // 0 表示用户主动放弃优惠（例如不使用积分），按原价支付
        if (priceSource == 0) {
            applyPriceSource(order, context, 0);
            updatePriceFields(order);
            CheckoutData data = new CheckoutData();
            data.setOrder(order);
            data.setCostCouponCount(costCouponCount);
            data.setCanUseCouponCount(canUseCount);
            fillPriceData(data, order, context);
            return data;
        }
        MemberCardPriceOption option = findPriceOption(context.result, priceSource);
        if (option == null) {
            throw new BusinessException("该优惠当前不可用");
        }
        if (!Boolean.TRUE.equals(option.getAvailable())) {
            throw new BusinessException(option.getUnavailableReason() == null ? "该优惠当前不可用" : option.getUnavailableReason());
        }
        applyPriceSource(order, context, priceSource);
        updatePriceFields(order);

        CheckoutData data = new CheckoutData();
        data.setOrder(order);
        data.setCostCouponCount(costCouponCount);
        data.setCanUseCouponCount(canUseCount);
        fillPriceData(data, order, context);
        return data;
    }

    /**
     * 计算四选一候选方案，不落库。
     */
    private PriceContext buildPriceContext(Order order, List<OrderDetail> orderDetails,
                                           Integer canUseCount, Integer costCouponCount) {
        PriceContext context = new PriceContext();
        BigDecimal base = order.getTotalAmount();
        Product product = productService.getProductLimit(order.getProductId());
        Long count = countByCustomerIdNew(order.getCustomerId());
        OrderDiscount orderDiscount = orderDiscountService.getDiscountByCount(count + 1, order.getShopId(),
                orderDetails.get(0).getDuration(), product.getAmount());
        Long customerIntegration = integrationService.getIntegrationByCustomerId(order.getCustomerId());

        MemberCardPriceEngine.Input input = new MemberCardPriceEngine.Input();
        input.setBaseAmount(base);
        LocalDate today = LocalDate.now();
        LocalDate serviceDate = orderDetails.get(0).getStartTime() == null
                ? today : orderDetails.get(0).getStartTime().toLocalDate();
        input.setAppointmentDate(serviceDate);
        input.setToday(today);

        CustomerMemberCard card = memberCardService.getActiveCard(order.getCustomerId());
        input.setHasActiveCard(card != null);
        if (card != null) {
            input.setAdvanceRate(card.getAdvanceRate());
            input.setSameDayRate(card.getSameDayRate());
        }

        if (orderDiscount != null) {
            BigDecimal discountPay = calculateDiscountPayAmount(orderDiscount.getType(), orderDiscount.getDiscount(),
                    base, orderDetails.size());
            if (discountPay.compareTo(base) < 0) {
                input.setDiscountPayAmount(discountPay);
                boolean newCustomer = orderDiscount.getType() != null && orderDiscount.getType() == 1;
                String prefix = newCustomer ? "新客折扣" : "通用折扣";
                String label;
                if (newCustomer) {
                    // 类型1：discount 为百分比（8500 → 8.5折）
                    BigDecimal rate = BigDecimal.valueOf(orderDiscount.getDiscount())
                            .divide(BigDecimal.valueOf(10000), 4, RoundingMode.HALF_UP);
                    label = prefix + "（" + MemberCardPriceEngine.discountText(rate) + "）";
                } else {
                    // 类型2：discount 为直减后的应付金额（17700 → 177.00元）
                    BigDecimal reduce = base.subtract(discountPay);
                    label = prefix + "（立减" + reduce.setScale(2, RoundingMode.HALF_UP).toPlainString() + "元）";
                }
                input.setDiscountLabel(label);
            }
        }
        input.setPoints(customerIntegration);
        input.setCanUseCouponCount(canUseCount);
        input.setCouponCostCount(costCouponCount);

        context.card = card;
        context.discount = orderDiscount;
        context.result = MemberCardPriceEngine.compute(input);
        return context;
    }

    /**
     * 显式写入优惠相关字段（含 null）。
     *
     * <p>MyBatis-Plus 的 updateById 默认忽略 null，切换优惠方案时会残留上一次的
     * 年卡 id / 折扣率，因此这里用 update wrapper 强制覆盖。</p>
     */
    private void updatePriceFields(Order order) {
        LambdaUpdateWrapper<Order> uw = new LambdaUpdateWrapper<>();
        uw.eq(Order::getId, order.getId())
                .set(Order::getPriceSource, order.getPriceSource())
                .set(Order::getPayAmount, order.getPayAmount())
                .set(Order::getBenefitAmount, order.getBenefitAmount())
                .set(Order::getUseIntegrationState, order.getUseIntegrationState())
                .set(Order::getIntegrationAmount, order.getIntegrationAmount())
                .set(Order::getMemberCardId, order.getMemberCardId())
                .set(Order::getMemberRate, order.getMemberRate())
                .set(Order::getDiscount, order.getDiscount())
                .set(Order::getDiscountType, order.getDiscountType());
        update(uw);
    }

    private void applyPriceSource(Order order, PriceContext context, Integer source) {
        BigDecimal base = order.getTotalAmount();
        MemberCardPriceOption option = findPriceOption(context.result, source);
        order.setPriceSource(source);
        if (option == null) {
            order.setPayAmount(base);
            order.setBenefitAmount(BigDecimal.ZERO);
            order.setMemberCardId(null);
            order.setMemberRate(null);
            order.setDiscount(null);
            order.setDiscountType(null);
            order.setUseIntegrationState(0);
            return;
        }
        order.setBenefitAmount(option.getBenefitAmount());
        if (source == MemberCardPriceEngine.SOURCE_CARD_ADVANCE
                || source == MemberCardPriceEngine.SOURCE_CARD_SAME_DAY) {
            order.setMemberCardId(context.card == null ? null : context.card.getId());
            order.setMemberRate(context.card == null ? null
                    : (source == MemberCardPriceEngine.SOURCE_CARD_ADVANCE
                    ? context.card.getAdvanceRate() : context.card.getSameDayRate()));
            order.setPayAmount(option.getPayAmount());
            order.setUseIntegrationState(0);
        } else if (source == MemberCardPriceEngine.SOURCE_DISCOUNT) {
            if (context.discount != null) {
                order.setDiscount(context.discount.getDiscount());
                order.setDiscountType(context.discount.getType());
            }
            order.setMemberCardId(null);
            order.setMemberRate(null);
            order.setPayAmount(option.getPayAmount());
            order.setUseIntegrationState(0);
        } else if (source == MemberCardPriceEngine.SOURCE_POINTS) {
            // 积分在支付时按 payAmount 扣减，剩余部分继续走微信
            order.setMemberCardId(null);
            order.setMemberRate(null);
            order.setPayAmount(base);
            order.setUseIntegrationState(1);
        } else {
            order.setMemberCardId(null);
            order.setMemberRate(null);
            order.setPayAmount(BigDecimal.ZERO);
            order.setUseIntegrationState(0);
        }
    }

    private MemberCardPriceOption findPriceOption(MemberCardPriceEngine.Result result, Integer source) {
        if (result == null || source == null) {
            return null;
        }
        for (MemberCardPriceOption option : result.getOptions()) {
            if (source.equals(option.getSource())) {
                return option;
            }
        }
        return null;
    }

    private void fillPriceData(CheckoutData data, Order order, PriceContext context) {
        data.setBaseAmount(order.getTotalAmount());
        data.setAppointmentDate(context.result.getAppointmentDate() == null
                ? null : context.result.getAppointmentDate().toString());
        data.setAdvance(context.result.isAdvance());
        data.setSelectedPriceSource(order.getPriceSource() != null
                ? order.getPriceSource() : context.result.getSelectedSource());
        data.setBenefitAmount(order.getBenefitAmount());
        data.setPriceOptions(context.result.getOptions());
        data.setUseIntegrationState(order.getUseIntegrationState());
    }

    private static class PriceContext {
        private MemberCardPriceEngine.Result result;
        private CustomerMemberCard card;
        private OrderDiscount discount;
    }

    @Transactional(rollbackFor = Exception.class)
    public void payCheckout(Long customerId, Long orderId, Integer payType) {
        String lockKey = getOrderLockKey(orderId);

        synchronized (lockKey.intern()) {
            Order order = getById(orderId);
            if (order == null) {
                throw new ApiException("订单不存在");
            }
            Long orderCustomerId = order.getCustomerId();
            if (!Objects.equals(orderCustomerId, customerId)) {
                throw new ApiException("订单不属于当前用户");
            }

            Integer state = order.getState();
            if (!OrderState.NOT_PAY.getValue().equals(state)) {
                throw new ApiException("订单状态已不可支付");
            }

            if (OrderPayType.COUPON.getValue().equals(payType)) {
                List<OrderDetail> orderDetails = orderDetailService.listByOrderId(orderId);

                Integer totalDuration = orderDetails.stream().map(OrderDetail::getDuration).reduce(Integer::sum).orElse(0);

                Integer costCouponCount = totalDuration / NormalConst.PER_COUPON_COST_MINUTES + ((totalDuration % NormalConst.PER_COUPON_COST_MINUTES) != 0 ? 1 : 0);

                Integer canUseCount = customerCouponService.getCouponCountByCustomerId(customerId);

                if (costCouponCount > canUseCount) {
                    throw new ApiException("剩余券包数量不足以支付当前订单，请重新下单购买");
                }

                List<Long> customerCouponIdList = customerCouponService.useCoupon(costCouponCount, customerId, orderId);

                order.setState(OrderState.PAID_NOT_COMMENT.getValue());
                order.setAppointmentState(AppointmentState.DOING.getValue());
                order.setPayType(OrderPayType.COUPON.getValue());
                order.setPayAmount(BigDecimal.ZERO);
                order.setPayTime(LocalDateTime.now());
                order.setCouponAmount(BigDecimal.valueOf(costCouponCount));
                order.setUseCouponMap(JSON.toJSONString(customerCouponIdList));

                updateById(order);
                handleBookingSuccessNotice(orderId);
                productService.addSale(order.getProductId());
                if (!BigDecimal.ZERO.equals(order.getIntegrationAmount())) {//当使用full 卷支付时，将提前用微信支付扣除的积分返回
                    integrationService.revocationIntegration(order.getId(), order.getCustomerId());
                }
            } else if (OrderPayType.WECHAT.getValue().equals(payType)) {
                order.setPayType(OrderPayType.WECHAT.getValue());
                updateById(order);
            }
        }
    }

    public List<OperatingRevenueDto> operatingRevenue(OperatingRevenueDto operatingRevenueDto) {
        return baseMapper.operatingRevenue(operatingRevenueDto);
    }

    public JSONObject operatingRevenueTop(OperatingRevenueDto operatingRevenueDto) {
        List<JSONObject> jsonObjectList = baseMapper.operatingRevenueTop(operatingRevenueDto);

        JSONObject refObject = new JSONObject();
        BigDecimal totalAmount = BigDecimal.ZERO;
        BigDecimal totalActualAmount = BigDecimal.ZERO;
        List<JSONObject> amountList = new ArrayList<>();
        List<JSONObject> actualAmountList = new ArrayList<>();

        for (JSONObject jsonObject : jsonObjectList) {
            String type = jsonObject.getString("type");
            if ("预收款".equals(type)) {
                amountList.add(jsonObject);
                totalAmount = totalAmount.add(jsonObject.getBigDecimal("amount"));
            } else if ("实收款".equals(type)) {
                actualAmountList.add(jsonObject);
                totalActualAmount = totalActualAmount.add(jsonObject.getBigDecimal("amount"));
            }
            jsonObject.remove("type");
        }

        refObject.put("totalAmount", totalAmount);
        refObject.put("amountList", amountList);
        refObject.put("totalActualAmount", totalActualAmount);
        refObject.put("actualAmountList", actualAmountList);
        return refObject;
    }

    /**
     * 小程序预约
     *
     * @param orderDetailDto
     * @return
     */
    @Transactional(rollbackFor = Exception.class)
    public JSONObject fullyMiniCreateOrder(OrderDetailDto orderDetailDto) {
        orderDetailDto.setPayType(OrderPayType.WECHAT.getValue());
        orderDetailDto.setAppointmentType(AppointmentType.HAND.getValue());
        //小程序端硬校验：客户已设为暂别的疗愈师不可被指定
        if (customerMassagistBlockService.isAnyBlocked(orderDetailDto.getCustomerId(), orderDetailDto.getMassagistIdList())) {
            throw new BusinessException("该疗愈师暂不可预约，请选择其他疗愈师");
        }
        int overTimeSeconds;
        if (OrderType.COUPON.getValue().equals(orderDetailDto.getType())) {
            overTimeSeconds = NormalConst.COUPON_ORDER_TIMEOUT_SECONDS;
        } else {
            overTimeSeconds = NormalConst.ORDER_TIMEOUT_SECONDS;
        }

        Long orderId = buildOrder(orderDetailDto, overTimeSeconds, false);
        JSONObject jsonObject = new JSONObject();
        jsonObject.put("data", orderId);
        jsonObject.put("oldOrderDetailMap", orderDetailService.massagistMapByOrderIdList(Collections.singletonList(orderId)));
        return jsonObject;
    }

    /**
     * 后台预约
     *
     * @param appointmentParam
     * @return
     */
    @Transactional(rollbackFor = Exception.class)
    public JSONObject appointmentOrder(AppointmentParam appointmentParam) {
        String phone = appointmentParam.getPhone();
        Customer customer = customerService.getByPhone(phone);
        if (ObjUtil.isEmpty(customer)) {
            customer = customerService.initCustomer(phone);
            customer.setComment(appointmentParam.getComment());
            customer.setNote(appointmentParam.getNote());
            customer.setGender(appointmentParam.getGender());
            customer.setUpdateTime(LocalDateTime.now());
            customerService.save(customer);
        } else {
            if (StrUtil.isNotBlank(appointmentParam.getComment()) || StrUtil.isNotBlank(appointmentParam.getNote()) || !ObjUtil.isEmpty(appointmentParam.getGender())) {
                boolean same = StrUtil.isNotBlank(customer.getComment())
                        && !ObjUtil.isEmpty(customer.getGender())
                        && StrUtil.isNotBlank(customer.getNote())
                        && customer.getComment().equals(appointmentParam.getComment())
                        && customer.getGender().equals(appointmentParam.getGender())
                        && customer.getNote().equals(appointmentParam.getNote());
                customer.setComment(appointmentParam.getComment());
                customer.setGender(appointmentParam.getGender());
                customer.setNote(appointmentParam.getNote());
                if (!same) {
                    customer.setUpdateTime(LocalDateTime.now());
                    customerService.updateById(customer);
                }
            }
        }
        Integer personCount = appointmentParam.getPersonCount();
        Integer payType = appointmentParam.getPayType();
        Long customerId = customer.getId();
        String dateTime = appointmentParam.getDate() + " " + appointmentParam.getTime() + ":00";
        LocalDateTime startTime = DateUtil.string2DateTime(dateTime);
        List<Long> orderIdList = new ArrayList<>();
        if (OrderPayType.QR_CODE.getValue().equals(payType) || OrderPayType.MEITUAN.getValue().equals(payType) || OrderPayType.CASH.getValue().equals(payType)) {
            List<Long> massagistIdList = appointmentParam.getMassagistIdList();
            List<Long> bedIdList = appointmentParam.getBedIdList();
            Iterator<Long> massagistIdIterator = massagistIdList.iterator();
            Iterator<Long> bedIterator = bedIdList.iterator();
            for (Integer i = 0; i < personCount; i++) {
                OrderDetailDto orderDetailDto = new OrderDetailDto();
                orderDetailDto.setCustomerId(customerId);
                orderDetailDto.setAppointmentType(payType);
                orderDetailDto.setProductId(appointmentParam.getProductId());
                orderDetailDto.setShopId(appointmentParam.getShopId());
                orderDetailDto.setDurationMinutes(appointmentParam.getDurationMinutes());
                orderDetailDto.setPersonCount(1);
                orderDetailDto.setIsUpdateSort(appointmentParam.getIsUpdateSort());
                orderDetailDto.setAddType(appointmentParam.getAddType());
                if (massagistIdIterator.hasNext()) {
                    orderDetailDto.setMassagistIdList(Arrays.asList(massagistIdIterator.next()));
                }
                if (bedIterator.hasNext()) {
                    orderDetailDto.setBedIdList(Arrays.asList(bedIterator.next()));
                }
                orderDetailDto.setStartTime(startTime);
                orderDetailDto.setPayType(payType);
                Long orderId = buildOrder(orderDetailDto, null, true);
                orderIdList.add(orderId);
            }
        } else {
            OrderDetailDto orderDetailDto = new OrderDetailDto();
            orderDetailDto.setCustomerId(customerId);
            orderDetailDto.setAppointmentType(AppointmentType.PHONE.getValue());
            orderDetailDto.setProductId(appointmentParam.getProductId());
            orderDetailDto.setShopId(appointmentParam.getShopId());
            orderDetailDto.setDurationMinutes(appointmentParam.getDurationMinutes());
            orderDetailDto.setPersonCount(appointmentParam.getPersonCount());
            orderDetailDto.setMassagistIdList(appointmentParam.getMassagistIdList());
            orderDetailDto.setBedIdList(appointmentParam.getBedIdList());
            orderDetailDto.setStartTime(startTime);
            orderDetailDto.setPayType(payType);
            orderDetailDto.setIsUpdateSort(appointmentParam.getIsUpdateSort());
            orderDetailDto.setAddType(appointmentParam.getAddType());
            Long orderId = buildOrder(orderDetailDto, null, true);
            orderIdList.add(orderId);
        }
        JSONObject jsonObject = new JSONObject();
        jsonObject.put("oldOrderDetailMap", orderDetailService.massagistMapByOrderIdList(orderIdList));
        return jsonObject;
    }

    /**
     * 后台预约
     *
     * @param orderDetailDto
     * @return
     */
    @Transactional(rollbackFor = Exception.class)
    public JSONObject appointmentReceptionOrder(OrderDetailDto orderDetailDto) {
        orderDetailDto.setPayType(OrderPayType.WECHAT.getValue());
        orderDetailDto.setAppointmentType(AppointmentType.PHONE.getValue());
        Long orderId = null;
        if (OrderType.RECEPTION.getValue().equals(orderDetailDto.getType())) {
            Order order = new Order();
            BeanUtils.copyProperties(orderDetailDto, order);
            order.setProductTitle("接待");
            save(order);
            fillOrderCode(order);
            finishPay(order);
            orderId = order.getId();
            orderDetailDto.setOrderId(orderId);
            orderDetailService.createReceptionDetail(orderDetailDto);
        }
        JSONObject jsonObject = new JSONObject();
        jsonObject.put("oldOrderDetailMap", orderDetailService.massagistMapByOrderIdList(Collections.singletonList(orderId)));
        return jsonObject;
    }

    /**
     * 完成预约订单
     *
     * @param orderId
     */
    @Transactional(rollbackFor = Exception.class)
    public void finish(Long orderId) {
        String lockKey = getOrderLockKey(orderId);
        synchronized (lockKey.intern()) {
            Order order = getById(orderId);
            if (order == null) {
                throw new BusinessException("订单不存在");
            }
            if (!AppointmentState.DOING.getValue().equals(order.getAppointmentState())) {
                throw new BusinessException("订单状态验证不通过，无法完成订单");
            }
            order.setAppointmentState(AppointmentState.FINISHED.getValue());
            if (!updateById(order)) throw new BusinessException("订单完成状态保存失败");

            if (OrderType.PRODUCT.getValue().equals(order.getType())) {
                rabbitMqSender.sendOrderFinishMessage(order.getId(), NormalConst.ORDER_FINISH_NOTICE_SECONDS * 1000);
            }
            customerCouponService.giveCouponOrderIdList(Collections.singletonList(orderId));
            Long referrerCustomerId = customerService.findReferrerCustomerId(order.getCustomerId());
            if (referrerCustomerId == null) {
                return;
            }
            integrationService.addReferrerScore(referrerCustomerId, order.getCustomerId(), orderId);
        }
    }

    /**
     * 批量完成订单
     *
     * @param orderIdList
     */
    @Transactional(rollbackFor = Exception.class)
    public void finishBatch(List<Long> orderIdList) {
        if (CollectionUtils.isEmpty(orderIdList)) {
            return;
        }

        List<Order> orderList = listByIds(orderIdList);
        orderList = orderList.stream().filter(s -> AppointmentState.DOING.getValue().equals(s.getAppointmentState())).collect(Collectors.toList());
        if (CollectionUtils.isEmpty(orderList)) {
            return;
        }
        orderList.forEach(order -> {
            order.setAppointmentState(AppointmentState.FINISHED.getValue());
            if (OrderType.PRODUCT.getValue().equals(order.getType())) {
                rabbitMqSender.sendOrderFinishMessage(order.getId(), NormalConst.ORDER_FINISH_NOTICE_SECONDS * 1000);
            }
        });
        if (!updateBatchById(orderList)) throw new BusinessException("批量订单完成状态保存失败");
        customerCouponService.giveCouponOrderIdList(orderList.stream().map(Order::getId).collect(Collectors.toList()));
        Long categoryId = 1L;
        List<Long> customerIdList = orderList.stream().map(Order::getCustomerId).collect(Collectors.toList());
        Map<Long, Long> map = customerService.findReferrerCustomerId(customerIdList);
        if (CollectionUtils.isEmpty(map)) {
            return;
        }
        List<JSONObject> jsonObjectList = orderList.stream().filter(order -> {
            Long referrerCustomerId = map.getOrDefault(order.getCustomerId(), 0L);
            return referrerCustomerId != 0L;
        }).map(order -> {
            JSONObject jsonObject = new JSONObject();
            jsonObject.put("customerId", map.get(order.getCustomerId()));
            jsonObject.put("newCustomerId", order.getCustomerId());
            jsonObject.put("orderId", order.getId());
            jsonObject.put("categoryId", categoryId);
            return jsonObject;
        }).collect(Collectors.toList());
        integrationService.addReferrerScoreBatch(jsonObjectList);
    }

    public boolean checkPaid(Long customerId, String orderSn) {
        if (StringUtils.isEmpty(orderSn)) {
            return false;
        }
        if (orderSn.contains("A")) {
            orderSn = orderSn.substring(0, orderSn.lastIndexOf("A"));
        }
        Order order = getByOrderSn(orderSn);
        if (order == null) {
            return false;
        }
        Integer state = order.getState();
        if (OrderState.PAID_NOT_COMMENT.getValue().equals(state) || OrderState.PAID_COMMENTED.getValue().equals(state)) {
            return true;
        }
        return false;
    }

    /**
     * 获取订单+详情
     *
     * @param id
     * @return
     */
    public Order infoWithGift(Long id) {
        Order order = getById(id);
        if (order == null || !order.getIsGift()) {
            return order;
        }
        order.setGift(giveGiftService.getByOrderId(id));
        return order;
    }

    public Map<Long, String> idToCodeMap(List<Long> orderIds) {
        if (CollectionUtils.isEmpty(orderIds)) {
            return Collections.emptyMap();
        }
        LambdaQueryWrapper<Order> lqw = new LambdaQueryWrapper<>();
        lqw.select(Order::getId, Order::getCode);
        lqw.in(Order::getId, orderIds);
        List<Order> orders = list(lqw);
        if (CollectionUtils.isEmpty(orders)) {
            return Collections.emptyMap();
        }
        Map<Long, String> collect = orders.stream().collect(Collectors.toMap(Order::getId, Order::getCode));
        return collect;
    }

    /**
     * 获取限购商品订单
     *
     * @param productId
     * @return k-> productId , v-> 订单次数
     */
    public Map<Long, Integer> getLimitOrderMap(List<Long> productId, Long customerId) {
        if (CollectionUtils.isEmpty(productId)) {
            return Collections.emptyMap();
        }
        LambdaQueryWrapper<Order> lqw = new LambdaQueryWrapper<>();
        lqw.in(Order::getProductId, productId);
        if (customerId != null) {
            lqw.eq(Order::getCustomerId, customerId);
        }
        lqw.notIn(Order::getState, Arrays.asList(OrderState.TIMEOUT.getValue(), OrderState.CANCELED.getValue(), OrderState.REFUNDED.getValue()));
        List<Order> list = list(lqw);
        if (CollectionUtils.isEmpty(list)) {
            return Collections.emptyMap();
        }
        return list.stream().collect(Collectors.groupingBy(Order::getProductId, Collectors.collectingAndThen(Collectors.toList(), s -> s.stream().mapToInt(Order::getQuantity).sum())));
    }

    public Long countByCustomerId(Long customerId) {
        if (customerId == null) {
            return 0L;
        }
        Map<Long, Long> map = countMapByCustomerIds(Collections.singletonList(customerId));
        if (CollectionUtils.isEmpty(map)) {
            return 0L;
        }
        return map.getOrDefault(customerId, 0L);
    }
    public  Long countByCustomerIdNew(Long customerId) {
        if (customerId == null) {
            return 0L;
        }
        LambdaQueryWrapper<Order> lqw = new LambdaQueryWrapper<>();
        lqw.select(Order::getCustomerId, Order::getId)
                .in(Order::getCustomerId, Collections.singletonList(customerId))
                .in(Order::getAppointmentState, AppointmentState.FINISHED.getValue(), AppointmentState.WAITING.getValue(), AppointmentState.DOING.getValue())
                .in(Order::getState, 1,2)
                .eq(Order::getType, OrderType.PRODUCT.getValue());
        List<Order> orders = list(lqw);

        Map<Long, Long> map = orders.stream()
                .collect(Collectors.groupingBy(
                        Order::getCustomerId,
                        Collectors.counting()
                ));
        if (CollectionUtils.isEmpty(map)) {
            return 0L;
        }
        return map.getOrDefault(customerId, 0L);
    }

    public Map<Long, Long> countMapByCustomerIds(List<Long> customerIds) {
        if (CollectionUtils.isEmpty(customerIds)) {
            return Collections.emptyMap();
        }
        LambdaQueryWrapper<Order> lqw = new LambdaQueryWrapper<>();
        lqw.select(Order::getCustomerId, Order::getId)
                .in(Order::getCustomerId, customerIds)
                .eq(Order::getAppointmentState, AppointmentState.FINISHED.getValue())
                .eq(Order::getType, OrderType.PRODUCT.getValue());
        List<Order> orders = list(lqw);
        if (CollectionUtils.isEmpty(orders)) {
            return Collections.emptyMap();
        }
        Map<Long, Long> customerOrderCountMap = orders.stream()
                .collect(Collectors.groupingBy(
                        Order::getCustomerId,
                        Collectors.counting()
                ));
        return customerOrderCountMap;
    }

    public void updateComment(Long id, String comment) {
        Order order = getById(id);
        if (order == null) {
            throw new BusinessException("订单不存在");
        }
        order.setComment(comment);
        updateById(order);
    }

    public Order getDougongWapPayOrder(String orderSn) {
        Order omsOrder = getByOrderSn(orderSn);

        if (omsOrder == null) {
            throw new BusinessException("支付失败, 订单不存在");
        }

        Integer status = omsOrder.getState();
        String payChannel = omsOrder.getPayChannel();

        if (OrderState.CANCELED.getValue().equals(status)) {
            throw new BusinessException("支付失败,订单已取消");
        }
        if (OrderState.PAID_NOT_COMMENT.getValue().equals(status) || OrderState.PAID_COMMENTED.getValue().equals(status)) {
            throw new BusinessException("支付失败,当前订单已支付");
        }
        if (!OrderState.NOT_PAY.getValue().equals(status)) {
            throw new BusinessException("支付失败,订单已不可支付");
        }

//        if (!PayChannel.WX_WAP_PAY.equals(payChannel) && !PayChannel.WX_WAP_SCAN.equals(payChannel)) {
//            throw new BusinessException("支付失败,订单支付类型不支持此种支付方式");
//        }

        return omsOrder;
    }

    public Map<Long, Integer> getOrderStateMapByIdList(List<Long> idList) {
        if (CollectionUtils.isEmpty(idList)) {
            return Collections.emptyMap();
        }
        List<Order> orderList = listByIds(idList);
        return orderList.stream().collect(Collectors.toMap(Order::getId, Order::getAppointmentState));
    }

    public void updateCouponCode(Long id, String couponCode) {
        Order order = getById(id);
        if (order == null) {
            throw new BusinessException("订单不存在");
        }
        order.setCouponCode(couponCode);
        updateById(order);
    }

    public void updatePayAmount(Long id, BigDecimal payAmount) {
        String lockKey = getOrderLockKey(id);
        synchronized (lockKey.intern()) {
            Order order = getById(id);
            if (order == null) {
                throw new BusinessException("订单不存在");
            }
            if (!Arrays.asList(OrderPayType.MEITUAN.getValue(),
                    OrderPayType.CASH.getValue()).contains(order.getPayType())) {
                Integer state = order.getState();
                boolean payed = Arrays.asList(OrderState.PAID_NOT_COMMENT.getValue(),
                        OrderState.PAID_COMMENTED.getValue(),
                        OrderState.APPROVAL_REFUNDING.getValue(),
                        OrderState.REFUNDING.getValue(),
                        OrderState.REFUNDED.getValue()).contains(state);
                if (payed) {
                    throw new BusinessException("订单已支付，无法修改支付金额");
                }
            }
            order.setPayAmount(payAmount);
            updateById(order);
        }
    }

    public String payedInfo(String orderCode) {
        String key = RedisKey.ORDER_PAYED + orderCode;
        String result = redisUtil.getString(key);
        return result;
    }

    /**
     * 电话agent预约构造
     *
     * @param jsonObject
     * @return
     */
    @Transactional(rollbackFor = Exception.class)
    public JSONObject phoneAgentBuildCreate(JSONObject jsonObject) {
        AppointmentParam appointmentParam = new AppointmentParam();

        String time = jsonObject.getString("到店时间");
        if (time == null) {
            throw new BusinessException("到店时间不允许为空");
        }
        time = adjustTime(time);
        appointmentParam.setTime(time);

        String date = jsonObject.getString("到店日期");
        if (date == null) {
            throw new BusinessException("到店日期不允许为空");
        }
        date = date.replaceAll("/", "-").replaceAll("年", "-").replaceAll("月", "-").replaceAll("日", "");
        appointmentParam.setDate(date);

        String dateTime = date + " " + time + ":00";
        String currentDateCode = DateUtil.getCurrentDateTimeCode();
        if (currentDateCode.compareTo(dateTime) > 0) {
            log.error("电话智能预约，dateTime={}", dateTime);
            throw new BusinessException("只能约当前时间及以后的日期");
        }

        String projectTitle = jsonObject.getString("服务项目");
        if (projectTitle == null) {
            log.error("电话智能预约，没有查到对应的项目，projectTitle={}", projectTitle);
            throw new BusinessException("项目名称不能为空");
        }
        Long projectId = projectService.findIdByTitle(projectTitle);
        if (projectId == null) {
            log.error("电话智能预约，没有查到对应的项目，projectTitle={}", projectTitle);
            throw new BusinessException("项目不存在");
        }
        appointmentParam.setProjectId(projectId);
        try {
            appointmentParam.setProductId(productService.findIdByProjectId(projectId));
        } catch (Exception e) {
            log.error("电话智能预约，没有查到对应的项目，projectTitle={}", projectTitle);
            throw new BusinessException("项目不存在");
        }

        String durationMinutes = jsonObject.getString("服务时长");
        if (durationMinutes == null) {
            log.error("电话智能预约，服务时长null");
            throw new BusinessException("服务时长不允许为空");
        }
        try {
            appointmentParam.setDurationMinutes(Integer.valueOf(durationMinutes.replaceAll("分钟", "").replaceAll("min", "").replaceAll("Min", "")
                    .replaceAll("MIN", "")
                    .replaceAll("分", "")));
        } catch (Exception e) {
            log.error("电话智能预约，获取服务时长失败");
            throw new BusinessException("获取服务时长失败");
        }

        String personCount = jsonObject.getString("到店人数");
        if (personCount != null) {
            try {
                appointmentParam.setPersonCount(Integer.parseInt(personCount.replaceAll("人", "").replaceAll("位", "").replaceAll("个", "").replaceAll("个人", "")));
            } catch (Exception e) {
                log.error("获取到店人数失败");
            }
        }

        String comment = jsonObject.getString("客户称谓");
        String gender = jsonObject.getString("客户性别");
        if ("男".equals(gender) || "先生".equals(gender)) {
            appointmentParam.setGender(1);
        } else if ("女".equals(gender) || "女士".equals(gender)) {
            appointmentParam.setGender(2);
        }
        if (comment != null) {
            if (gender == null && comment.indexOf("先生") > 0) {
                appointmentParam.setGender(1);
                comment = comment.replace("先生", "");
            } else if (gender == null && comment.indexOf("女士") > 0) {
                appointmentParam.setGender(2);
                comment = comment.replace("女士", "");
            }
            appointmentParam.setComment(comment);
        }

        String phone = jsonObject.getString("手机号码");
        if (phone == null) {
            String normalTime = findNormalTimeInterval(date, time, appointmentParam.getPersonCount(), projectId, appointmentParam.getDurationMinutes(), appointmentParam.getShopId(), true);
            JSONObject object = new JSONObject();
            object.put("result", normalTime);
            jsonObject.put("data", object);
            log.error("电话智能预约，获取可预约时间，normalTime={}", normalTime);
            return jsonObject;
        }
        appointmentParam.setPhone(phone);
        return phoneAgentCreateOrder(appointmentParam);
    }

    /**
     * 后台预约
     *
     * @param appointmentParam
     * @return
     */
    @Transactional(rollbackFor = Exception.class)
    public JSONObject phoneAgentCreateOrder(AppointmentParam appointmentParam) {
        String phone = appointmentParam.getPhone();
        Customer customer = customerService.getByPhone(phone);
        if (ObjUtil.isEmpty(customer)) {
            customer = customerService.initCustomer(phone);
            customer.setComment(appointmentParam.getComment());
            customer.setGender(appointmentParam.getGender());
            customerService.save(customer);
        } else {
            if (StrUtil.isNotBlank(appointmentParam.getComment()) || !ObjUtil.isEmpty(appointmentParam.getGender())) {
                boolean same = StrUtil.isNotBlank(customer.getComment())
                        && !ObjUtil.isEmpty(customer.getGender())
                        && customer.getComment().equals(appointmentParam.getComment())
                        && customer.getGender().equals(appointmentParam.getGender());
                customer.setComment(appointmentParam.getComment());
                customer.setGender(appointmentParam.getGender());
                if (!same) {
                    customer.setUpdateTime(LocalDateTime.now());
                    customerService.updateById(customer);
                }
            }
        }

        if (appointmentParam.getProductId() == null) {
            Long projectId = appointmentParam.getProjectId();
            if (projectId == null) {
                projectId = projectService.findIdByTitle(appointmentParam.getProjectTitle());
            }
            appointmentParam.setProjectId(projectId);
            try {
                appointmentParam.setProductId(productService.findIdByProjectId(projectId));
            } catch (Exception e) {
                log.error("电话智能预约，没有查到对应的项目");
                throw new BusinessException("项目不存在");
            }
        }
        JSONObject jsonObject = new JSONObject();
        String date = appointmentParam.getDate();
        String dateTime = date + " " + appointmentParam.getTime() + ":00";
        try {
            OrderDetailDto orderDetailDto = new OrderDetailDto();
            BeanUtils.copyProperties(appointmentParam, orderDetailDto);
            orderDetailDto.setAppointmentType(AppointmentType.PHONE_AGENT.getValue());
            orderDetailDto.setCustomerId(customer.getId());
            LocalDateTime startTime = DateUtil.string2DateTime(dateTime);
            orderDetailDto.setStartTime(startTime);
            Long orderId = buildOrder(orderDetailDto, null, false);
            List<Long> orderIdList = new ArrayList<>();
            orderIdList.add(orderId);
            jsonObject.put("oldOrderDetailMap", orderDetailService.massagistMapByOrderIdList(orderIdList));
            JSONObject object = new JSONObject();
            object.put("result", "订单创建成功");
            jsonObject.put("data", object);
        } catch (Exception e) {
            log.error("电话智能预约，预约失败，message={}", e.getMessage());
            if (appointmentParam.getProjectId() == null) {
                List<JSONObject> jsonList = productService.getProductContent(appointmentParam.getProductId());
                List<Long> projectIdList = jsonList.stream().map(s -> s.getLong("projectId")).collect(Collectors.toList());
                if (!CollectionUtils.isEmpty(projectIdList)) {
                    appointmentParam.setProjectId(projectIdList.get(0));
                } else {
                    throw new BusinessException("项目不存在");
                }
            }
            log.error("电话智能预约，指定时间不可预约，dateTime={}", dateTime);
            throw new BusinessException(findNormalTimeInterval(date, appointmentParam.getTime(), appointmentParam.getPersonCount(), appointmentParam.getProjectId(), appointmentParam.getDurationMinutes(), appointmentParam.getShopId(), false));
        }
        return jsonObject;
    }

    /**
     * 获取正常可预约的时间区间
     *
     * @param date
     * @param time
     * @param personCount
     * @param projectId
     * @param durationMinutes
     * @param shopId
     * @return
     */
    public String findNormalTimeInterval(String date, String time, Integer personCount, Long projectId, Integer durationMinutes, Long shopId, boolean normalTime) {
        String dateTime = date + " " + time + ":00";
        String currentDateCode = DateUtil.getCurrentDateTimeCode();
        if (currentDateCode.compareTo(dateTime) > 0) {
            return "只能约当前时间及以后的日期";
        }
        List<JSONObject> arriveTimeList = findArriveTimeList(date, personCount, projectId, durationMinutes, shopId, null);
        if (CollectionUtils.isEmpty(arriveTimeList)) {
            log.error("电话智能预约，没有可预约的时间，timeList={}", arriveTimeList);
            return "没有可预约的时间";
        }
        if (normalTime) {
            for (JSONObject jsonObject : arriveTimeList) {
                Integer state = jsonObject.getInteger("state");
                String timeStr = jsonObject.getString("time");
                if (state != null && state == 1 && time.compareTo(timeStr) == 0) {
                    return "当前时间可用，请继续引导客户提供预约手机号码";
                }
            }
        }
        List<String> strings = new ArrayList<>();
        String startTime = null;
        for (int i = 0; i < arriveTimeList.size(); i++) {
            JSONObject a = arriveTimeList.get(i);
            Integer state = a.getInteger("state");
            String timeStr = a.getString("time");
            if (state != null && state == 1) {
                if (startTime == null) {
                    startTime = timeStr;
                }
            } else if (startTime != null) {
                a = arriveTimeList.get(i - 1);
                timeStr = a.getString("time");
                strings.add(startTime.equals(timeStr) ? startTime : startTime + "到" + timeStr);
                startTime = null;
            }
            if (i == arriveTimeList.size() - 1 && startTime != null) {
                strings.add(startTime.equals(timeStr) ? startTime : startTime + "到" + timeStr);
            }
        }
        if (CollectionUtils.isEmpty(strings)) {
            log.error("电话智能预约，没有可预约的时间，timeList={}", arriveTimeList);
            return "没有可预约的时间";
        }
        String result = String.join("、", strings);
        return "以下为门店可用时间段：" + result;
    }

    /**
     * 调整传入的时间为0/15/30/45
     *
     * @param time
     * @return
     */
    private String adjustTime(String time) {
        LocalTime localTime = LocalTime.parse(time);
        int minutes = localTime.getMinute();
        if (minutes % 15 != 0) {
            int nextMultipleOf15 = ((minutes / 15) + 1) * 15;
            if (nextMultipleOf15 == 60) {
                localTime = localTime.plusHours(1).withMinute(0);
            } else {
                localTime = localTime.withMinute(nextMultipleOf15);
            }
        }
        time = DateUtil.toHHmm(localTime);
        log.info("调整预约时间成功，localDateTime={}", time);
        if ("00:00".equals(time)) {
            throw new BusinessException("没有可预约的时间");
        }
        return time;
    }

    /**
     * 获取产品的订单实际订单量
     *
     * @param productId
     * @return
     */
    public Integer getRealSaleByProductId(Long productId) {
        Map<Long, Integer> map = getRealSaleByProductId(Collections.singletonList(productId));
        return map.getOrDefault(productId, 0);
    }

    /**
     * 获取产品的订单实际订单量
     *
     * @param productIdList
     * @return
     */
    public Map<Long, Integer> getRealSaleByProductId(List<Long> productIdList) {
        if (CollectionUtils.isEmpty(productIdList)) {
            return null;
        }
        LambdaQueryWrapper<Order> lqw = new LambdaQueryWrapper<>();
        lqw.in(Order::getProductId, productIdList);
        lqw.notIn(Order::getState, Arrays.asList(OrderState.TIMEOUT.getValue(), OrderState.CANCELED.getValue(), OrderState.REFUNDING.getValue(), OrderState.REFUNDED.getValue()));
        lqw.select(Order::getId, Order::getProductId);
        List<Order> list = list(lqw);
        return list.stream().collect(Collectors.groupingBy(Order::getProductId, Collectors.collectingAndThen(Collectors.toList(), List::size)));
    }

    private void buildGift(List<Order> list) {
        if (CollectionUtils.isEmpty(list)) {
            return;
        }
        List<Long> idList = list.stream().filter(s -> OrderType.COUPON.getValue().equals(s.getType())).map(Order::getId).collect(Collectors.toList());
        Map<Long, Customer> customerMap = giveGiftService.getGiftToCustomerMap(idList);
        list.forEach(e -> e.setToCustomer(customerMap.getOrDefault(e.getId(), null)));
    }

    /**
     * 添加订单标签
     *
     * @param addOrderLabelDto
     */
    public void addLabel(AddOrderLabelDto addOrderLabelDto) {
        Long orderId = addOrderLabelDto.getOrderId();
        String lockKey = getOrderLockKey(orderId);
        synchronized (lockKey.intern()) {
            Order order = getById(orderId);
            if (order == null) {
                throw new BusinessException("订单不存在");
            }
            order.setOil(addOrderLabelDto.getOil());
            order.setParts(addOrderLabelDto.getParts());
            updateById(order);
        }
    }

    /**
     * 订单完成通知
     *
     * @param orderId
     */
    public void handleOrderFinishNotice(Long orderId) {
        Order order = getById(orderId);
        if (order == null) {
            return;
        } else if (OrderType.COUPON.getValue().equals(order.getType())) {
            return;
        }

        Integer orderState = order.getState();
        if (!OrderState.PAID_NOT_COMMENT.getValue().equals(orderState)) {
            return;
        }
        List<OrderDetail> detailList = orderDetailService.listByOrderId(orderId);
        if (CollectionUtils.isEmpty(detailList)) {
            log.error("订单完成通知推送失败");
            return;
        }
        OrderDetail orderDetail = detailList.get(0);
        Integer duration = orderDetail.getDuration();
        StringBuilder stringBuilder = new StringBuilder();
        for (int i = 0; i < detailList.size(); i++) {
            OrderDetail detail = detailList.get(0);
            if (i != 0) {
                stringBuilder.append(" | ");
            }
            stringBuilder.append(massagistService.findNameById(detail.getMassagistId()));
        }
        Map<String, String> map = new HashMap<>();
        map.put("thing6", order.getProductTitle() + " | " + duration + "mins | " + detailList.size() + "人");
        map.put("thing8", stringBuilder.toString());
        map.put("thing15", "小程序评价得积分，下次预约直接抵现");
        map.put("thing5", "欢迎添加客服微信relaxfullyu加入社群");
//        wxMpTemplateMessageService.handleOrderFinishNotice(map, order.getCustomerId());
    }

    /**
     * 预约开始通知
     *
     * @param orderId
     */
    public void handleBookingStartNotice(Long orderId) {
        Order order = getById(orderId);
        if (order == null) {
            return;
        } else if (OrderType.COUPON.getValue().equals(order.getType())) {
            return;
        }

        Integer orderState = order.getState();
        if (!OrderState.PAID_NOT_COMMENT.getValue().equals(orderState)) {
            return;
        }
        List<OrderDetail> detailList = orderDetailService.listByOrderId(orderId);
        if (CollectionUtils.isEmpty(detailList)) {
            log.error("预约开始通知推送失败");
            return;
        }
        OrderDetail orderDetail = detailList.get(0);
        if (!AppointmentState.WAITING.getValue().equals(orderDetail.getState())) {
            return;
        }
        Integer duration = orderDetail.getDuration();
        LocalDateTime startTime = orderDetail.getStartTime();
        Map<String, String> map = new HashMap<>();
        map.put("thing1", order.getProductTitle() + " | " + duration + "mins | " + detailList.size() + "人");
        map.put("time16", DateUtil.toDateMinute(startTime));
        map.put("thing6", shopService.findNameById(order.getShopId()));
        map.put("thing4", shopService.findAddressById(order.getShopId()));
        map.put("thing3", "为保障服务质量及时长，请准时到达");
//        wxMpTemplateMessageService.handleBookingStartNotice(map, order.getCustomerId());
    }

    /**
     * 预约成功通知
     *
     * @param orderId
     */
    public void handleBookingSuccessNotice(Long orderId) {
        Order order = getById(orderId);
        if (order == null) {
            return;
        } else if (OrderType.COUPON.getValue().equals(order.getType())) {
            return;
        }

        List<OrderDetail> detailList = orderDetailService.listByOrderId(orderId);
        if (CollectionUtils.isEmpty(detailList)) {
            log.error("预约成功通知推送失败");
            return;
        }
        OrderDetail orderDetail = detailList.get(0);
        Integer duration = orderDetail.getDuration();
        LocalDateTime startTime = orderDetail.getStartTime();
        LocalDateTime endTime = orderDetail.getEndTime();
        Map<String, String> map = new HashMap<>();
        map.put("thing15", order.getProductTitle() + " | " + duration + "mins | " + detailList.size() + "人");
        map.put("time16", DateUtil.toDateMinute(startTime));
        map.put("character_string29", order.getCode());
        map.put("thing2", shopService.findNameById(order.getShopId()));
        map.put("thing20", shopService.findAddressById(order.getShopId()));
        wxMpTemplateMessageService.handleBookingSuccessNotice(map, order.getCustomerId());
//
//        //开始前1小时发送服务开始通知,不足1小时不通知
//        LocalDateTime now = LocalDateTime.now();
//        long seconds = DateUtil.diffSeconds(now, startTime);
//        if (seconds < 3600) {
//            return;
//        }
//        rabbitMqSender.sendOrderStartMessage(order.getId(), (seconds - 3600) * 1000);
    }

    /**
     * 预约取消通知
     *
     * @param orderId
     */
    public void handleBookingCancelNotice(Long orderId) {
        Order order = getById(orderId);
        if (order == null) {
            return;
        } else if (!OrderType.PRODUCT.getValue().equals(order.getType())) {
            return;
        }

        Integer orderState = order.getState();
        if (OrderState.NOT_PAY.getValue().equals(orderState) || OrderState.PAID_NOT_COMMENT.getValue().equals(orderState) || OrderState.PAID_COMMENTED.getValue().equals(orderState)) {
            return;
        }
        List<OrderDetail> detailList = orderDetailService.listByOrderId(orderId);
        if (CollectionUtils.isEmpty(detailList)) {
            log.error("预约取消通知推送失败");
            return;
        }
        OrderDetail orderDetail = detailList.get(0);
        Integer duration = orderDetail.getDuration();
        LocalDateTime startTime = orderDetail.getStartTime();
        LocalDateTime endTime = orderDetail.getEndTime();
        Map<String, String> map = new HashMap<>();
        map.put("thing14", order.getProductTitle() + " | " + duration + "mins | " + detailList.size() + "人");
        map.put("time3", DateUtil.toDateMinute(startTime));
        map.put("character_string2", order.getCode());
        map.put("thing7", shopService.findNameById(order.getShopId()));
        wxMpTemplateMessageService.handleBookingCancelNotice(map, order.getCustomerId());
    }

    /**
     * 获取可预约时间
     *
     * @param jsonObject
     * @return
     */
    public String findAppointmentTime(JSONObject jsonObject) {
        AppointmentParam appointmentParam = new AppointmentParam();

        String projectTitle = jsonObject.getString("服务项目");
        if (projectTitle == null) {
            log.error("电话智能预约，没有查到对应的项目，projectTitle={}", projectTitle);
            throw new BusinessException("项目名称不能为空");
        }
        Long projectId = projectService.findIdByTitle(projectTitle);
        if (projectId == null) {
            log.error("电话智能预约，没有查到对应的项目，projectTitle={}", projectTitle);
            throw new BusinessException("项目不存在");
        }
        appointmentParam.setProjectId(projectId);
        try {
            appointmentParam.setProductId(productService.findIdByProjectId(projectId));
        } catch (Exception e) {
            log.error("电话智能预约，没有查到对应的项目，projectTitle={}", projectTitle);
            throw new BusinessException("项目不存在");
        }

        String durationMinutes = jsonObject.getString("服务时长");
        if (durationMinutes == null) {
            log.error("电话智能预约，服务时长null");
            throw new BusinessException("服务时长不允许为空");
        }
        try {
            appointmentParam.setDurationMinutes(Integer.valueOf(durationMinutes.replaceAll("分钟", "").replaceAll("min", "").replaceAll("Min", "")
                    .replaceAll("MIN", "")
                    .replaceAll("分", "")));
        } catch (Exception e) {
            log.error("电话智能预约，获取服务时长失败");
            throw new BusinessException("获取服务时长失败");
        }

        String personCount = jsonObject.getString("到店人数");
        if (personCount != null) {
            try {
                appointmentParam.setPersonCount(Integer.parseInt(personCount.replaceAll("人", "").replaceAll("位", "").replaceAll("个", "").replaceAll("个人", "")));
            } catch (Exception e) {
                log.error("获取到店人数失败");
            }
        }

        String date = jsonObject.getString("到店日期");
        if (date == null) {
            throw new BusinessException("到店日期不允许为空");
        }
        date = date.replaceAll("/", "-").replaceAll("年", "-").replaceAll("月", "-").replaceAll("日", "");
        appointmentParam.setDate(date);
        LocalDateTime now = LocalDateTime.now();
        String time = adjustTime(DateUtil.toHHmm(DateUtil.addTimeByMinutes(now, 1)));
        appointmentParam.setTime(time);
        return findNormalTimeInterval(date, time, appointmentParam.getPersonCount(), projectId, appointmentParam.getDurationMinutes(), appointmentParam.getShopId(), false);
    }

    /**
     * 获取上次预约门店
     *
     * @param customerId
     * @return
     */
    public Long getLastServiceOrderShop(Long customerId) {
        if (customerId == null) {
            return null;
        }
        LambdaQueryWrapper<Order> lqw = new LambdaQueryWrapper<>();
        lqw.eq(Order::getCustomerId, customerId);
        lqw.eq(Order::getType, OrderType.PRODUCT.getValue());
        lqw.orderByDesc(Order::getId);
        Order order = getOnlyOne(lqw);
        if (order == null) {
            return null;
        }
        return order.getShopId();
    }

    public List<Massagist> findAvailableMassagistListNew(Long shopId, LocalDateTime startTime, Integer durationMinutes, Integer personCount,Integer projectId) {
        return findAvailableMassagistListNew(shopId, startTime, durationMinutes, personCount, projectId, null);
    }

    /**
     * @param phone 可选。后台建单时按手机号识别客户，给已设为暂别的疗愈师打提示标记（不从列表剔除）。
     */
    public List<Massagist> findAvailableMassagistListNew(Long shopId, LocalDateTime startTime, Integer durationMinutes, Integer personCount,Integer projectId, String phone) {
        if (shopId == null) {
            shopId = 1L;
        }
        String key = "lockKey" + shopId;
        synchronized (key.intern()) {
            Shop shop = shopService.findAvailableById(shopId);
            if (shop == null) {
                throw new BusinessException("抱歉，店铺不可用");
            }
            String date = DateUtil.toYYYYMMDD(startTime);
            //弃用
            //List<MassagistSchedules> allMassagistList = massagistSchedulesService.simpleListByDateAndShopId(date, shopId);
            //luxin 新增过滤技师是否会这个项目 findListByProjectIdAndShopId
            List<MassagistSchedules> allMassagistList=new ArrayList<>();
            if(projectId!=3) {//不等于3标识是接待进来的，展示所有的技师
                allMassagistList = massagistSchedulesService.getBaseMapper().findListByProjectIdAndShopId(shopId, "%" + projectId + "%", date);
            }else{
                allMassagistList = massagistSchedulesService.getBaseMapper().findListByProjectIdAndShopId(shopId, "%%", date);
            }
            if (CollectionUtils.isEmpty(allMassagistList)) {
                throw new BusinessException("抱歉，没有排班数据");
            }
            List<Massagist> resultList = new ArrayList<>();
            //luxin修改了，获取所欲技师列表，因为有调店技师
            List<Massagist> massagistList = massagistService.listNotWhere();
            Map<Long, Massagist> massagistMap = massagistList.stream().collect(Collectors.toMap(Massagist::getId, Function.identity()));
            List<OrderDetail> detailList = orderDetailService.getBaseMapper().findSimpleListByStartDateAndShop(date, shopId);
            Map<Long, List<OrderDetail>> massagistDetailMap = new HashMap<>(detailList.size());
            detailList.forEach(d -> {
                List<OrderDetail> massagistDetailList = massagistDetailMap.get(d.getMassagistId());
                if (massagistDetailList == null) {
                    massagistDetailList = new ArrayList<>();
                }
                massagistDetailList.add(d);
                massagistDetailMap.put(d.getMassagistId(), massagistDetailList);
            });
            LocalDateTime endTime = DateUtil.addTimeByMinutes(startTime, durationMinutes);
            // LocalDateTime aEndTime = DateUtil.addTimeByMinutes(endTime, shop.getIntervalMinute());//间隔15分钟；去掉间隔的
            LocalDateTime aEndTime = DateUtil.addTimeByMinutes(endTime,0);
            List<Long> availableMassagistIdList = new ArrayList<>();
            List<Long> disableMassagistIdList = new ArrayList<>();
            allMassagistList.forEach(m -> {
                //只要开始时间在疗愈师工作范围内即可显示疗愈师
                //DateUtil.toHHmm(m.getStartTime()).compareTo(DateUtil.toHHmm(startTime)) > 0
                 //       || DateUtil.toHHmm(m.getEndTime()).compareTo(DateUtil.toHHmm(endTime)) < 0
                boolean isOne=!startTime.toLocalTime().isBefore(m.getStartTime());
                boolean isTwo=startTime.toLocalTime().isBefore(m.getEndTime());

                if (!(isOne&& isTwo)) {
                    // disableMassagistIdList.add(m.getMassagistId()); luxin修改 屏蔽去掉不在工作时间内容的疗愈师
                } else {
                    List<OrderDetail> massagistDetailList = massagistDetailMap.get(m.getMassagistId());
                    boolean isAvailable = true;
                    if (CollectionUtils.isEmpty(massagistDetailList)) {
                        isAvailable = true;
                    } else {
                        isAvailable = massagistDetailList.stream().allMatch(d -> {
                            LocalDateTime detailEndTime = d.getEndTime();
                            if(d.getProjectId()!=3){
                                detailEndTime = DateUtil.addTimeByMinutes(detailEndTime, shop.getIntervalMinute());//间隔15分钟；去掉间隔的
                            }
                           // detailEndTime = DateUtil.addTimeByMinutes(detailEndTime, 15);//间隔15分钟；去掉间隔的
                            return DateUtil.toHHmm(startTime).compareTo(DateUtil.toHHmm(detailEndTime)) >= 0
                                    || DateUtil.toHHmm(aEndTime).compareTo(DateUtil.toHHmm(d.getStartTime())) <= 0;
                        });
                    }
                    if (isAvailable) {
                        availableMassagistIdList.add(m.getMassagistId());
                    } else {
                        disableMassagistIdList.add(m.getMassagistId());
                    }
                }
            });
            List<Long> sortLinkList =orderDetailService.sortMassagist(availableMassagistIdList, startTime, endTime, shopId, personCount);

            //根据接待情况再调整一次排序
            if(projectId==3){
                //定义可以接单的列表
                List<Long> userJiedan=new ArrayList<>();
                //定义不可以接单的列表
                List<Long> userNotJiedan=new ArrayList<>();
                //获取排班列表顺序
                sortLinkList= massagistSchedulesService.getMassagistSchedulesList(date, shopId);
                sortLinkList.forEach(id -> {
                    if(availableMassagistIdList.contains(id)){
                        userJiedan.add(id);
                    }else {
                        //userNotJiedan.add(id);
                    }
                });
                //userJiedan和userNotJiedan 相加
                userJiedan.addAll(userNotJiedan);
                for(Long m:availableMassagistIdList){
                    if(!userJiedan.contains(m)){
                        userJiedan.add(m);
                    }
                }
                //疗愈师接待情况
                Map<Long, Integer> projectCountMap = detailList.stream().filter(s -> projectId.equals(s.getProjectId().intValue())).collect(Collectors.groupingBy(OrderDetail::getMassagistId, Collectors.collectingAndThen(Collectors.toList(), List::size)));
                List<Long> finalSortedMassagistIdList = userJiedan;
                final  Long shopIdFinal=shopId;
                sortLinkList = userJiedan.stream()
                        .sorted((id1, id2) -> {
                            // 获取两个疗愈师的接单数（默认0）
                            int count1 = projectCountMap.getOrDefault(id1, 0);
                            int count2 = projectCountMap.getOrDefault(id2, 0);

                            //id1 获取此人是否全天上班，不是全天上班的话，需要获取上班时间前  最小接待轮次
                           // count1=count1+orderDetailService.GetCountNumber(id1,startTime,shopIdFinal);
                            //id2 获取此人是否全天上班，不是全天上班的话，需要获取上班时间前  最小接待轮次
                          //  count2=count2+orderDetailService.GetCountNumber(id2,startTime,shopIdFinal);

                            // 接单数少的排前面（若需接单数多的排前面，此处用 count2 - count1 即可）
                            if (count1 != count2) {
                                return Integer.compare(count1, count2);
                            } else {
                                // 接单数相同时，保持原列表中的顺序（原排序作为第二顺位）
                                return Integer.compare(finalSortedMassagistIdList.indexOf(id1), finalSortedMassagistIdList.indexOf(id2));
                            }
                        })
                        .collect(Collectors.toList());
            }
            List<Long> sortLinkList2=sortLinkList;
            disableMassagistIdList.forEach(m -> {
                sortLinkList2.add(m);
            });




            sortLinkList2.forEach(id -> {
                Massagist massagist = massagistMap.get(id);
                if (massagist != null) {
                    massagist.setAvailable(1);
                    resultList.add(massagist);
                }
                else {
                    massagist.setAvailable(0);
                    resultList.add(massagist);
                }
            });

            List<Massagist> result = resultList.stream().distinct().collect(Collectors.toList());
            markBlockedByPhone(phone, result);
            return result;
        }
    }
    //luxin新增,编辑订单时使用
    public List<JSONObject> findArriveTimeListEdit(String date, Integer personCount, Long projectId, Integer durationMinutes, Long shopId,long orderId, Long massagistId) {
        List<Shop> availableShopList = shopService.findAvailableShopList();
        if (CollectionUtils.isEmpty(availableShopList)) {
            throw new BusinessException("暂无可用门店");
        }
        Integer bedType = projectService.findTypeById(projectId);
        if (bedType == null) {
            throw new BusinessException("项目类型有误");
        }
        List<Bed> allBedList = bedService.listByStatusAndTypeAndShopId(NormalState.EFFECTIVE.getValue(), bedType, shopId);
        if (CollectionUtils.isEmpty(allBedList)) {
            throw new BusinessException("暂无可用床位");
        }
        //弃用，增加了疗愈师技能判断
        // List<MassagistSchedules> allMassagistList = massagistSchedulesService.simpleListByDateAndShopId(date, shopId);
        //luxin 新增过滤技师是否会这个项目 findListByProjectIdAndShopId
        List<MassagistSchedules> allMassagistList = massagistSchedulesService.getBaseMapper().findListByProjectIdAndShopId(shopId,"%"+projectId+"%",date);

        if (massagistId != null) {
            allMassagistList = allMassagistList.stream().filter(s -> massagistId.equals(s.getMassagistId())).collect(Collectors.toList());
        }
        if (CollectionUtils.isEmpty(allMassagistList)) {
            throw new BusinessException("没有疗愈师排班数据");
        }
        //Map<Long, List<OrderDetail>> orderDetailMap = new HashMap<>();
        List<OrderDetail> orderDetailList = orderDetailService.getBaseMapper().findSimpleListByStartDateAndShopId(date, shopId);
        List<OrderDetail> orderDetailListNew=orderDetailList.stream().filter(s -> !s.getOrderId().equals(orderId)).collect(Collectors.toList());
        /*if (!CollectionUtils.isEmpty(orderDetailList)) {
            orderDetailMap = orderDetailList.stream().collect(Collectors.groupingBy(OrderDetail::getShopId));
        }*/
        // Map<Long, List<Bed>> bedMap = allBedList.stream().collect(Collectors.groupingBy(Bed::getShopId));
        //Map<Long, List<MassagistSchedules>> massagistMap = allMassagistList.stream().collect(Collectors.groupingBy(MassagistSchedules::getShopId));


        LocalDateTime nowTime = DateUtil.stringToLocalDate(date).atTime(LocalTime.of(9, 50, 0));
        Shop shop = availableShopList.stream().filter(s -> shopId.equals(s.getId())).findFirst().get();
        if (DateUtil.getCurrentDateCode().equals(date)) {
            nowTime = LocalDateTime.now();
        } else {
            if (shop != null || Strings.isNotBlank(shop.getClockInTime())) {
                nowTime = LocalDate.now().atTime(DateUtil.HHmmStrToTime(shop.getClockInTime()));
            }
        }
        LocalDateTime next15Time = DateUtil.findNextTime(nowTime);
        long l = DateUtil.diffMinutes(nowTime, next15Time);
        if (l < 5) {
            nowTime = next15Time;
        }
        LocalDateTime now = nowTime;
        int threadCount = Runtime.getRuntime().availableProcessors();
        ExecutorService executor = Executors.newFixedThreadPool(threadCount);
        List<CompletableFuture<List<JSONObject>>> futures = new ArrayList<>();

        List<MassagistSchedules> massagistScheduleList = allMassagistList;
        CompletableFuture<List<JSONObject>> future = CompletableFuture.supplyAsync(() -> {
            return getJsonObjects(now, orderDetailListNew, personCount, durationMinutes, shop, allBedList, massagistScheduleList,projectId,shopId,date);
        }, executor);
        futures.add(future);

        CompletableFuture<List<JSONObject>> allResults = CompletableFuture.allOf(futures.toArray(new CompletableFuture[0]))
                .thenApply(v -> futures.stream().flatMap(f -> f.join().stream()).collect(Collectors.toList()));
        List<JSONObject> resultList = new ArrayList<>();
        try {
            List<JSONObject> allObjectList = allResults.join();
            Map<String, List<JSONObject>> timeMap = allObjectList.stream().collect(Collectors.groupingBy(o -> o.getString("time")));
            timeMap.keySet().stream().sorted().forEach(time -> {
                JSONObject object = new JSONObject();
                object.put("time", time);
                object.put("state", 0);
                List<JSONObject> objects = timeMap.get(time);
                if (CollectionUtils.isEmpty(objects)) {
                    return;
                }
                List<JSONObject> shopList = objects.stream().filter(o -> o.getInteger("state") == 1).collect(Collectors.toList());
                if (!CollectionUtils.isEmpty(shopList)) {
                    object.put("state", 1);
                    object.put("shopList", shopList);
                }
                resultList.add(object);
            });
        } catch (Exception e) {
            e.printStackTrace();
            throw new BusinessException("系统错误");
        }
        return resultList;
    }

    //后台卡卷下单
    @Transactional(rollbackFor = Exception.class)
    public JSONObject pcfullyMiniCreateOrder(OrderDetailDtoNew orderDetailDto) {
        //先检查用户是否存在，不存在创建，
        String phone = orderDetailDto.getPhone();
        Customer customer = customerService.getByPhone(phone);
        if (ObjUtil.isEmpty(customer)) {
            customer = customerService.initCustomer(phone);
            customer.setComment(orderDetailDto.getComment());
            customer.setNote(orderDetailDto.getNote());
            customer.setGender(orderDetailDto.getGender());
            customer.setUpdateTime(LocalDateTime.now());
            customerService.save(customer);
        } else {
            if (StrUtil.isNotBlank(orderDetailDto.getComment()) || StrUtil.isNotBlank(orderDetailDto.getNote()) || !ObjUtil.isEmpty(orderDetailDto.getGender())) {
                boolean same = StrUtil.isNotBlank(customer.getComment())
                        && !ObjUtil.isEmpty(customer.getGender())
                        && StrUtil.isNotBlank(customer.getNote())
                        && customer.getComment().equals(orderDetailDto.getComment())
                        && customer.getGender().equals(orderDetailDto.getGender())
                        && customer.getNote().equals(orderDetailDto.getNote());
                customer.setComment(orderDetailDto.getComment());
                customer.setGender(orderDetailDto.getGender());
                customer.setNote(orderDetailDto.getNote());
                if (!same) {
                    customer.setUpdateTime(LocalDateTime.now());
                    customerService.updateById(customer);
                }
            }
        }
        Long curCustomerId = customer.getId();
        orderDetailDto.setTotalAmount(productService.getProductLimit(orderDetailDto.getProductId()).getAmount());
        orderDetailDto.setComment("");
        orderDetailDto.setCustomerId(curCustomerId);
        orderDetailDto.setPayType(OrderPayType.QR_CODE.getValue());
        orderDetailDto.setAppointmentType(AppointmentType.PHONE.getValue());
        orderDetailDto.setIsUpdateSort(false);
        orderDetailDto.setCardimage("https://fullytherapy.oss-cn-hangzhou.aliyuncs.com/fully/file/miniImage/20260409/bba38cae-eff8-4c0b-b90c-bf77bb098c7c%28._.%29%E5%88%B8%E7%A7%8D%20%287%29.png");

        OrderDetailDto dto=new OrderDetailDto();
        BeanUtils.copyProperties(orderDetailDto, dto);

        Long orderId = buildOrder(dto, 500, true);
        Order order= getById(orderId);
        JSONObject jsonObject = new JSONObject();
        jsonObject.put("data", order);


        return jsonObject;
    }

    public void sendSMS(Long orderId) {
        Order order = getById(orderId);
        Shop shop = shopService.getById(order.getShopId());
        Customer customer= customerService.getById(order.getCustomerId());
        List<OrderDetail> list= orderDetailService.list(new QueryWrapper<OrderDetail>().eq("order_id", orderId));
        String HHMM= list.get(0).getStartTime().format(DateTimeFormatter.ofPattern("HH:mm"));
        String count="";
        if(list.size()>1) {
            count = list.size() + "位";
        }
        //时间差
        int number= (int) Duration.between(list.get(0).getStartTime(),list.get(0).getEndTime()).toMinutes();
        String phone=customer.getPhone();
        String parms="{\"name\":\""+customer.getComment()+"\",\"project\":\""+HHMM+shop.getName()+count+number+"分钟项目"+"\"}";
        try {
            SendSMS.sendSMS(phone,parms);
        }
        catch (Exception e) {
            throw new BusinessException("发送短信失败："+e.getMessage());
        }
    }

    /**
     * 小程序二次修改会员卡封面
     */
    public void updateCardImage(Long orderId, String cardSelectUrl,long customerId) {
        Order order = getById(orderId);
        order.setCardimage(cardSelectUrl);
        updateById(order);
        customerCouponService.updateCardImage(orderId,cardSelectUrl,customerId);
    }

    /**
     * 分享会员卡
     * @param orderId
     * @param titleVal
     * @param customerId
     * @return
     */
    @Transactional(rollbackFor = Exception.class)
    public Object shareCardFriend(Long orderId, String titleVal, Long customerId) {
        GiveGift giveGift= giveGiftService.getFindOrderAndCustomerId(orderId,customerId);
        Map<String,String> map=new HashMap<>();
        if(Objects.isNull(giveGift)){
            Order order = getById(orderId);
            order.setIsGift(true);
            updateById(order);
            List<CustomerCoupon> list= customerCouponService.getShareCardListAndUpdate(orderId);
            String cardImage=order.getCardimage();
            long giveId= giveGiftService.createGiftNew(list, orderId, customerId, titleVal,cardImage);
            String code= giveGiftService.genShareCode(giveId, customerId);
            map.put("code",code);
            map.put("giveId",giveId+"");
        }
        else {
            giveGift.setTitle(titleVal);
            giveGiftService.updateById(giveGift);
            map.put("code",giveGift.getShareCode());
            map.put("giveId",giveGift.getId().toString());
        }
        return  map;
    }

    /**
     * 小程序用户取消分享的组合卷
     * @param customerId
     * @param orderId
     * @return
     */
    @Transactional(rollbackFor = Exception.class)
    public void cancelShareCard(Long customerId, long orderId) {
        GiveGift giveGift = giveGiftService.getFindOrderAndCustomerId(orderId, customerId);
        if (!Objects.isNull(giveGift)) {
            Order order = getById(orderId);
            order.setIsGift(false);
            updateById(order);
            List<CustomerCoupon> list= customerCouponService.getShareCardListAndUpdate(orderId);
            list.stream().forEach(t->{
                t.setCustomerId(customerId);
                t.setState(1);
                t.setIsCanGift(false);
            });
            customerCouponService.updateBatchById(list);
            //储存
            GiveTempGift giveTempGift =new GiveTempGift();
            BeanUtils.copyProperties(giveGift,giveTempGift);
            giveTempGiftService.createGiftNew(giveTempGift);
            giveGiftService.removeById(giveGift);
        }
    }
    //积分支付订单
    @Transactional(rollbackFor = Exception.class)
    public void jifenPayOrder(Long curCustomerId, long orderId) {
        String lockKey = getOrderLockKey(orderId);
        // TODO redis锁
        synchronized (lockKey.intern()) {
            Order order = getById(orderId);
            order.setPayType(1);
            if (order == null) {
                throw new ApiException("订单不存在");
            }
            Long customerId = order.getCustomerId();
            if (!Objects.equals(curCustomerId, customerId)) {
                throw new ApiException("不可支付他人订单");
            }

            Integer state = order.getState();
            if (!OrderState.NOT_PAY.getValue().equals(state)) {
                throw new ApiException("订单状态异常");
            }
            if(order.getUseIntegrationState()==1) {

                BigDecimal roundedAmount = order.getPayAmount().setScale(0, RoundingMode.CEILING);
                Long needIntegration = Long.parseLong(roundedAmount.toString());
                Integration integration = integrationService.useIntegration(needIntegration, customerId, "积分抵扣");
                if (integration != null) {
                    integration.setOrderId(orderId);
                    integrationService.updateById(integration);
                    BigDecimal integrationAmount = BigDecimal.valueOf(integration.getScore());
                    if (integrationAmount.compareTo(order.getPayAmount()) < 0) {
                        order.setPayAmount(order.getPayAmount().subtract(integrationAmount));
                        order.setIntegrationAmount(integrationAmount);
                    } else {
                        order.setPayAmount(BigDecimal.ZERO);
                        order.setIntegrationAmount(integrationAmount);
                    }
                }
                updateById(order);
                if (BigDecimal.ZERO.compareTo(order.getPayAmount()) == 0) {
                    finishPay(order);
                }
            }
            else {
                updateById(order);
            }
        }
    }

    public List<Order> getLastOrderInfo(Long customerId) {
        // 1. 获取当前时间
        LocalDateTime now = LocalDateTime.now();
        // 2. 计算3天前的时间
        LocalDateTime threeDaysAgo = now.minusDays(3);
        List<Order> list= this.lambdaQuery()
                .eq(Order::getCustomerId, customerId)
                .ge(Order::getCreateTime,threeDaysAgo)
                .in(Order::getState,0,1,2)
                .eq(Order::getType,0)
                .orderByDesc(Order::getCreateTime)
                .last("limit 1")
                .list();
        buildDetail(list);
        return list;
    }
    //获取最后一次订单，用户小程序中门店排序
    public List<Order> getLastOrderInfoNew(Long customerId) {
        List<Order> list= this.lambdaQuery()
                .eq(Order::getCustomerId, customerId)
                .eq(Order::getType,0)
                .orderByDesc(Order::getCreateTime)
                .last("limit 1")
                .list();
        return list;
    }

    public Object shareOrder(long orderDetailId, Long customerId) {
        OrderDetail orderDetail = orderDetailService.getById(orderDetailId);
        if (orderDetail == null) {
            throw new ApiException("订单不存在");
        }
        Long orderId = orderDetail.getOrderId();
        Order order = getById(orderId);
        if (order == null) {
            throw new ApiException("订单不存在");
        }
        Long customerId1 = order.getCustomerId();
        if (!Objects.equals(customerId, customerId1)) {
            throw new ApiException("不可分享他人订单");
        }

        orderDetail.setIsShare(1);
        if(orderDetail.getShareCode()==null||"".equals(orderDetail.getShareCode())){
            LocalDateTime sendTime = orderDetail.getCreateTime();
            if (sendTime == null) {
                sendTime = LocalDateTime.now();
            }
            String format = sendTime.format(DateTimeFormatter.ofPattern("yyyyMMddHHmmss"));
            String plainCode = orderDetailId + "#" + format;

            AES aes = SecureUtil.aes("j9123hnfvg:HL8dh".getBytes());
            orderDetail.setShareCode(aes.encryptHex(plainCode));
        }
        orderDetailService.updateById(orderDetail);
        orderDetail(orderDetailId);
        Map<String, Object> map = new HashMap<>();
        map.put("shareCode", orderDetail.getShareCode());
        map.put("orderId", orderDetail.getOrderId());
        return map;
    }
//领取分享的订单
    public void receiveOrder(long orderDetailId, Long customerId, String shareCode) {
        try {
            if (StringUtils.isEmpty(shareCode)) {
                throw new BusinessException("分享码为空！");
            }

            AES aes = SecureUtil.aes("j9123hnfvg:HL8dh".getBytes());
            String str = aes.decryptStr(shareCode);

            String[] split = str.split("#");
            String shareId = split[0];
            if (Long.parseLong(shareId) != orderDetailId) {
                throw new BusinessException("分享码解析异常！");
            }
        } catch (Exception e) {
            e.printStackTrace();
            throw new BusinessException("订单分享信息异常！");
        }

        OrderDetail orderDetail= orderDetailService.getById(orderDetailId);
        if(!Objects.equals(orderDetail.getFromOrderId(), 0L)){
            throw new BusinessException("订单已被TA人领取！");
        }
        if(orderDetail.getCustomerId().equals(customerId)){
            throw new BusinessException("不可领取自己分享的订单！");
        }
        Order order= getById(orderDetail.getOrderId());

       /* //创建新订单
        Order newOrder = new Order();
        BeanUtil.copyProperties(order, newOrder);
        newOrder.setCode(order.getCode()+"Share");
        newOrder.setCustomerId(customerId);
        //总金额的一半
        newOrder.setTotalAmount(order.getTotalAmount().divide(BigDecimal.valueOf(2), 2, RoundingMode.HALF_UP));
        //实付金额的一半
        newOrder.setPayAmount(order.getPayAmount().divide(BigDecimal.valueOf(2), 2, RoundingMode.HALF_UP));*/


/*
        Long fromCusId = giveGift.getCustomerId();
        if (fromCusId.equals(toCustomerId)) {
            throw new BusinessException("不可领取自己分享的礼物");
        }
        Integer state = giveGift.getState();
        if (!Objects.equals(state, GiveGiftState.DOING.getValue())) {
            throw new BusinessException("礼物不可领取");
        }*/
    }

    //小程序订单进行拆单操作
    @Transactional(rollbackFor = Exception.class)
    public void OrderSplit(long orderId, Long customerId) {
        Order order = getById(orderId);
        if (order == null) {
            throw new ApiException("订单不存在");
        }
        List<OrderDetail> orderDetails = orderDetailService.listByOrderId(orderId);

        if(orderDetails.size()>1){
            //用卡卷支付的分单
            if (OrderPayType.COUPON.getValue().equals(order.getPayType())) {
                int count=orderDetails.size();
                String useCouponMap = order.getUseCouponMap();
                List<Long> idList = JSONArray.parseArray(useCouponMap, Long.class);//用了多少卡卷
                //每单用了多少张
                int couponSplit= idList.size()/count;
                order.setCouponAmount(BigDecimal.valueOf(couponSplit));
                order.setTotalAmount(order.getTotalAmount().divide(BigDecimal.valueOf(count),2 , RoundingMode.HALF_UP));
                order.setPayAmount(order.getPayAmount().divide(BigDecimal.valueOf(count),2 , RoundingMode.HALF_UP));
                //将订单的卡卷返回去
                customerCouponService.handleRefund(order);//先把卡卷退回去；
                List<Long> customerCouponIdList = customerCouponService.useCoupon(couponSplit, customerId, order.getId());
                order.setUseCouponMap(JSONArray.toJSONString(customerCouponIdList));
                //原订单更新
                updateById(order);
                for (int i = 1; i < count; i++) {
                    Order newOrder = new Order();
                    BeanUtil.copyProperties(order, newOrder, "id","code");
                    newOrder.setCode(order.getCode()+"-"+i);
                    newOrder.setPrentOrderId(order.getId());
                    //创建新订单
                    save(newOrder);
                    customerCouponIdList = customerCouponService.useCoupon(couponSplit, customerId, newOrder.getId());
                    newOrder.setUseCouponMap(JSONArray.toJSONString(customerCouponIdList));
                    //跟新新订单
                    updateById(newOrder);
                    //更新订单详情
                    List<OrderDetail> newOrderDetails = orderDetails.stream().skip(i).collect(Collectors.toList());
                    for (OrderDetail orderDetail : newOrderDetails) {
                        orderDetail.setOrderId(newOrder.getId());
                        orderDetailService.updateById(orderDetail);
                    }
                }

            } else if (OrderPayType.WECHAT.getValue().equals(order.getPayType())) {
                //全部用积分支付
                int count=orderDetails.size();
                order.setTotalAmount(order.getTotalAmount().divide(BigDecimal.valueOf(count),2 , RoundingMode.HALF_UP));
                //实付金额已经为0了，因为用的是 积分支付
                order.setPayAmount(order.getPayAmount().divide(BigDecimal.valueOf(count), 2, RoundingMode.HALF_UP));
                order.setIntegrationAmount(order.getIntegrationAmount().divide(BigDecimal.valueOf(count), 2, RoundingMode.HALF_UP));
                //将订单的积分返回去
                integrationService.revocationIntegration(orderId, order.getCustomerId());
                //将原订单积分记录删除
                List<Integration> originalIntegrationList=integrationService.list(new QueryWrapper<Integration>().eq("order_id", orderId).eq("customer_id",order.getCustomerId()));
                if(originalIntegrationList.size()>0){
                    integrationService.removeById(originalIntegrationList.get(0).getId());
                }
                //重新订单进行积分支付
                BigDecimal roundedAmount = order.getIntegrationAmount().setScale(0, RoundingMode.CEILING);
                Long needIntegration = Long.parseLong(roundedAmount.toString());
                Integration integration = integrationService.useIntegration(needIntegration, customerId, "积分抵扣");
                if (integration != null) {
                    integration.setOrderId(orderId);
                    integrationService.updateById(integration);
                    order.setPayAmount(BigDecimal.ZERO);
                    order.setIntegrationAmount(order.getIntegrationAmount());
                }
                updateById(order);
                for (int i = 1; i < count; i++) {
                    Order newOrder = new Order();
                    BeanUtil.copyProperties(order, newOrder, "id","code");
                    newOrder.setCode(order.getCode()+"-"+i);
                    newOrder.setPrentOrderId(order.getId());
                    //创建新订单
                    save(newOrder);
                    //重新订单进行积分支付
                    Integration integrationNew = integrationService.useIntegration(needIntegration, customerId, "积分抵扣");
                    if (integrationNew != null) {
                        integrationNew.setOrderId(newOrder.getId());
                        integrationService.updateById(integrationNew);
                        newOrder.setPayAmount(BigDecimal.ZERO);
                        newOrder.setIntegrationAmount(order.getIntegrationAmount());
                    }
                    //更新新订单
                    updateById(newOrder);
                    //更新订单详情
                    List<OrderDetail> newOrderDetails = orderDetails.stream().skip(i).collect(Collectors.toList());
                    for (OrderDetail orderDetail : newOrderDetails) {
                        orderDetail.setOrderId(newOrder.getId());
                        orderDetailService.updateById(orderDetail);
                    }
                }
            }
        }
    }

    public List<Order> infoWithDetailNew(Long id) {
        List<Order> list=new ArrayList<>();
        Order order = getById(id);
        if (order == null) {
            return new ArrayList<>();
        }
        buildDetail(Collections.singletonList(order));
        list.add(order);
        //根据父级prentOrderId查询子订单
        LambdaQueryWrapper<Order> lqw = new LambdaQueryWrapper<>();
        lqw.eq(Order::getPrentOrderId, order.getId());
        List<Order> prentList = list(lqw);
        if(prentList.size()>0){
            buildDetail(prentList);
            list.addAll(prentList);
        }
        return list;
    }

    public boolean getRedisCode(String refundOrderSn) {
        log.info("luxin-----------------------------------------------: {}", refundOrderSn);
        log.info("luxin-----------------------------------------------: {}", redisUtil.getString("ordercodelx:"+refundOrderSn));
        if(redisUtil.getString("ordercodelx:"+refundOrderSn)=="1") {
            log.info("luxin-----------------------------------------------: {}", (redisUtil.getString("ordercodelx:"+refundOrderSn)=="1"));
            return true;
        }else {
            log.info("luxin-----------------------------------------------: {}", (redisUtil.getString("ordercodelx:"+refundOrderSn)=="1")+"+++++++++++++++++");
            return false;
        }
    }

    @Transactional(rollbackFor = Exception.class)
    public Object updateOrderInvoiceStatus(Long id, Integer status) {
        Order order = getById(id);
        order.setInvoiceState(status);
        updateById(order);
        if(status==1){
            //优惠卷订单
            if(order.getType()==1){
                List<CustomerCoupon> listCustomerCoupon= customerCouponService.listByOrderId(id);
                List<CustomerCoupon> filterListCustomerCoupon=listCustomerCoupon.stream().filter(e->e.getInvoiceState()>0).collect(Collectors.toList());
                if(filterListCustomerCoupon!=null && filterListCustomerCoupon.size()>0){
                    String code="";
                    for (CustomerCoupon customerCoupon : filterListCustomerCoupon) {
                        Order order1= getById(customerCoupon.getUseOrder());
                        if(code==""){
                            code=order1.getCode();
                        }else{
                            if(!code.contains(order1.getCode())){
                                code=code+","+order1.getCode();
                            }
                        }
                    }
                    throw new ApiException("普通订单已开票，订单编号："+code);
                }else{
                    CustomerCoupon customerCoupon= listCustomerCoupon.stream().filter(e->e.getUseType()==2).collect(Collectors.toList()).get(0);
                    customerCoupon.setInvoiceState(1);
                    customerCouponService.updateById(customerCoupon);
                }
            }
            //普通订单
            if(order.getType()==0){
                List<CustomerCoupon> listCustomerCouponPutong= customerCouponService.listByUseOrderId(id);
                int ckExist=0;
                for (CustomerCoupon customerCoupon : listCustomerCouponPutong) {
                    List<CustomerCoupon> listCustomerCoupon= customerCouponService.listByOrderId(customerCoupon.getOrderId()).stream().filter(e->e.getUseType()==2&&e.getInvoiceState()>0).collect(Collectors.toList());
                    if(listCustomerCoupon!=null && listCustomerCoupon.size()>0){
                        ckExist=1;
                        Order order1= getById(customerCoupon.getOrderId());
                        throw new ApiException("卡卷订单已开票，订单编号："+order1.getCode());
                    }
                }
                if(ckExist==0) {
                    for (CustomerCoupon customerCoupon : listCustomerCouponPutong) {
                        customerCoupon.setInvoiceState(1);
                        customerCouponService.updateById(customerCoupon);
                    }
                }
            }
        }else{
            if(order.getType()==1){
                CustomerCoupon customerCoupon= customerCouponService.listByOrderId(id).stream().filter(e->e.getUseType()==2).collect(Collectors.toList()).get(0);
                customerCoupon.setInvoiceState(0);
                customerCouponService.updateById(customerCoupon);
            }
            if(order.getType()==0){
                List<CustomerCoupon> listCustomerCouponPutong= customerCouponService.listByUseOrderId(id);
                for (CustomerCoupon customerCoupon : listCustomerCouponPutong) {
                    customerCoupon.setInvoiceState(0);
                    customerCouponService.updateById(customerCoupon);
                }
            }
        }

        return order;
    }

    //获取时间和空闲的人数
    public Map<String,String> timeListNew(Long id,String timeCurent) {

        if (id == null) {
            id = 1L;
        }
        Shop shop = shopService.getById(id);
        if (shop == null) {
            return null;
        }
        String clockInTime = shop.getClockInTime();
        String clockOutTime = shop.getClockOutTime();

        Integer endHour = Integer.valueOf(clockOutTime.substring(0, 2));
        LocalDate currentDate = timeCurent == null ? LocalDate.now() : LocalDate.parse(timeCurent);

        LocalDateTime time = LocalDateTime.of(currentDate, DateUtil.HHmmStrToTime(clockInTime));
        LocalDateTime time1 = LocalDateTime.of(currentDate, DateUtil.HHmmStrToTime(clockInTime));
        List<String> timeList = new ArrayList<>(40);
        Map<String,String> map = new HashMap<>();
        timeList.add(clockInTime);
        //先查出当天店铺下的所有订单
        List<OrderDetail> detailList =orderDetailService.getBaseMapper().findSimpleListByStartDateAndShop(timeCurent, id);
        //先查询当天店铺下排班的技师
        List<MassagistSchedules> allMassagistList = massagistSchedulesService.simpleListByDateAndShopId(timeCurent, id);
        //根据时间段查询有多少订单
        while (true) {
            //从所有订单中获取此时间段的订单
            String aa=time.toString();
            if(aa.equals("2026-04-22T19:00")){
                int a=0;
            }
            int orderCount = 0;
            //将接近订单组合为一个订单方便验证
            //从detailList订单中找到时间等于dttime的订单
            LocalDateTime dtt=time;
            List<OrderDetail> startAndEndList= detailList.stream().filter(e -> e.getStartTime().equals(dtt) || e.getEndTime().equals(dtt)).filter(t->t.getMassagistId()!=null&&t.getProjectId()!=3).collect(Collectors.toList());
            //startAndEndList  以massagistid 分组，获取每组的集合,并找到集合数据大于2的组合；
            Map<Long, List<OrderDetail>> startAndEndListGroupByMassagistId = startAndEndList.stream().collect(Collectors.groupingBy(OrderDetail::getMassagistId));
            Map<Long, List<OrderDetail>> result = startAndEndListGroupByMassagistId.entrySet().stream()
                    .filter(entry -> entry.getValue().size() >= 2)
                    .collect(Collectors.toMap(
                            Map.Entry::getKey,   // Key 保持不变
                            Map.Entry::getValue  // Value 保持不变
                    ));

            for (OrderDetail orderDetail : detailList) {
                LocalDateTime orderStartTime = orderDetail.getStartTime();
                //orderDetail.getEndTime()结束时间增加15分钟
                LocalDateTime orderEndTime = orderDetail.getEndTime();

                if(orderDetail.getProjectId()!=3){
                    orderEndTime = orderDetail.getEndTime().plusMinutes(15);
                }
                if (!orderStartTime.isAfter(time) && orderEndTime.isAfter(time)) {
                    orderCount++;
                }
            }
            orderCount=orderCount-result.size();

            //从排班记录中获取此时间段的技师
            int massagistCount = 0;
            for (MassagistSchedules massagistSchedules : allMassagistList) {
                LocalDateTime massagistStartTime = massagistSchedules.getDay().atTime(massagistSchedules.getStartTime());
                LocalDateTime massagistEndTime = massagistSchedules.getDay().atTime(massagistSchedules.getEndTime());
                if (!massagistStartTime.isAfter(time) && massagistEndTime.isAfter(time)) {
                    massagistCount++;
                }
            }
            //最终空闲人数
            int freeCount = 0;
            if (massagistCount >= orderCount) {
                freeCount = massagistCount - orderCount;
            }
            map.put(DateUtil.toHHmm(time), String.valueOf(freeCount));

            time = DateUtil.findNextTime(time);
            int hour = time.getHour();
            if (hour >= endHour) {
                //从所有订单中获取此时间段的订单
                orderCount = 0;
                for (OrderDetail orderDetail : detailList) {
                    LocalDateTime orderStartTime = orderDetail.getStartTime();
                    LocalDateTime orderEndTime = orderDetail.getEndTime();
                    if(orderDetail.getProjectId()!=3){
                        orderEndTime = orderDetail.getEndTime().plusMinutes(15);
                    }
                    if (!orderStartTime.isAfter(time) && orderEndTime.isAfter(time)) {
                        orderCount++;
                    }
                }

                //从排班记录中获取此时间段的技师
                massagistCount = 0;
                for (MassagistSchedules massagistSchedules : allMassagistList) {
                    LocalDateTime massagistStartTime = massagistSchedules.getDay().atTime(massagistSchedules.getStartTime());
                    LocalDateTime massagistEndTime = massagistSchedules.getDay().atTime(massagistSchedules.getEndTime());
                    if (!massagistStartTime.isAfter(time) && massagistEndTime.isAfter(time)) {
                        massagistCount++;
                    }
                }
                //最终空闲人数
                freeCount = 0;
                if (massagistCount >= orderCount) {
                    freeCount = massagistCount - orderCount;
                }
                map.put(DateUtil.toHHmm(time), String.valueOf(freeCount));
                timeList.add(DateUtil.toHHmm(time));
                break;
            }
            timeList.add(DateUtil.toHHmm(time));
        }
        while (true) {
            time = DateUtil.findNextTime(time);
            int hour = time.getHour();
            if (hour >= 23) {
                //map中是否存在23:00
                if (!map.containsKey("23:00"))
                {
                    map.put("23:00", "0");
                }
                map.put("23:15", "0");
                map.put("23:30", "0");
                break;
            }
            map.put(DateUtil.toHHmm(time), "0");
        }

        return map;
//        return timeList;
    }

    public List<JSONObject> findArriveTimeList0410(String date, Integer personCount, Long projectId, Integer durationMinutes, Long shopId, Long massagistId) {
        List<Shop> availableShopList = shopService.findAvailableShopList();


        LocalDateTime nowTime = DateUtil.stringToLocalDate(date).atTime(LocalTime.of(9, 50, 0));
        Shop shop = availableShopList.stream().filter(s -> shopId.equals(s.getId())).findFirst().get();
        if (DateUtil.getCurrentDateCode().equals(date)) {
            nowTime = LocalDateTime.now();
        } else {
            if (shop != null || Strings.isNotBlank(shop.getClockInTime())) {
                nowTime = LocalDate.now().atTime(DateUtil.HHmmStrToTime(shop.getClockInTime()));
            }
        }
        LocalDateTime next15Time = DateUtil.findNextTime(nowTime);
        long l = DateUtil.diffMinutes(nowTime, next15Time);
        if (l < 5) {
            nowTime = next15Time;
        }
        LocalDateTime now = nowTime;
        int threadCount = Runtime.getRuntime().availableProcessors();
        ExecutorService executor = Executors.newFixedThreadPool(threadCount);
        List<CompletableFuture<List<JSONObject>>> futures = new ArrayList<>();

        CompletableFuture<List<JSONObject>> future = CompletableFuture.supplyAsync(() -> {
            return getJsonObjects0410(now, null, personCount, durationMinutes, shop, null, null,projectId,shopId,date);
        }, executor);
        futures.add(future);

        CompletableFuture<List<JSONObject>> allResults = CompletableFuture.allOf(futures.toArray(new CompletableFuture[0]))
                .thenApply(v -> futures.stream().flatMap(f -> f.join().stream()).collect(Collectors.toList()));
        List<JSONObject> resultList = new ArrayList<>();
        try {
            List<JSONObject> allObjectList = allResults.join();
            Map<String, List<JSONObject>> timeMap = allObjectList.stream().collect(Collectors.groupingBy(o -> o.getString("time")));
            timeMap.keySet().stream().sorted().forEach(time -> {
                JSONObject object = new JSONObject();
                object.put("time", time);
                object.put("state", 0);
                List<JSONObject> objects = timeMap.get(time);
                if (CollectionUtils.isEmpty(objects)) {
                    return;
                }
                List<JSONObject> shopList = objects.stream().filter(o -> o.getInteger("state") == 1).collect(Collectors.toList());
                if (!CollectionUtils.isEmpty(shopList)) {
                    object.put("state", 1);
                    object.put("shopList", shopList);
                }
                resultList.add(object);
            });
        } catch (Exception e) {
            e.printStackTrace();
            throw new BusinessException("系统错误");
        }
        return resultList;
    }

    private List<JSONObject> getJsonObjects0410(LocalDateTime time, List<OrderDetail> detailList, Integer personCount, Integer durationMinutes, Shop shop, List<Bed> bedList, List<MassagistSchedules> massagistList,long projectId,long shopId,String date) {
        if(projectId!=3) {//不等于3标识，不是接待进来的
            String clockOutTime = shop.getClockOutTime();
            Integer endHour = Integer.valueOf(clockOutTime.substring(0, 2));
            List<JSONObject> timeList = new LinkedList<JSONObject>();
            LocalDateTime shopClockInTime = LocalDate.now().atTime(DateUtil.HHmmStrToTime(shop.getClockInTime()));
            if (time.isBefore(shopClockInTime)) {
                time = DateUtil.minusTimeByMinutes(shopClockInTime, 2);
            }
            while (true) {
                JSONObject object = new JSONObject();
                time = DateUtil.findNextTime(time);
                int hour = time.getHour();
                if (hour >= endHour) {
                    break;
                }
                object.put("time", DateUtil.toHHmm(time));
                object.put("state", 1);

                JSONObject availableShop = new JSONObject();
                availableShop.put("id", shop.getId());
                availableShop.put("name", shop.getName());
                availableShop.put("address", shop.getAddress());
                availableShop.put("bedIdList", null);
                availableShop.put("massagistIdList",null );
                object.put("shop", availableShop);
                timeList.add(object);
            }
            fillTimeList(timeList);
            return timeList;
        }
        else {

            String clockOutTime = shop.getClockOutTime();
            Integer endHour = Integer.valueOf(clockOutTime.substring(0, 2));
            List<JSONObject> timeList = new LinkedList<JSONObject>();
            LocalDateTime shopClockInTime = LocalDate.now().atTime(DateUtil.HHmmStrToTime(shop.getClockInTime()));
            if (time.isBefore(shopClockInTime)) {
                time = DateUtil.minusTimeByMinutes(shopClockInTime, 2);
            }
            while (true) {
                JSONObject object = new JSONObject();
                time = DateUtil.findNextTime(time);
                int hour = time.getHour();
                if (hour >= endHour) {
                    break;
                }
                object.put("time", DateUtil.toHHmm(time));
                object.put("state", 1);

                JSONObject availableShop = new JSONObject();
                availableShop.put("id", shop.getId());
                availableShop.put("name", shop.getName());
                availableShop.put("address", shop.getAddress());
                availableShop.put("bedIdList", new int[0]);
                availableShop.put("massagistIdList",null);
                object.put("shop", availableShop);
                timeList.add(object);
            }
            fillTimeList(timeList);
            return timeList;
        }
    }

    public List<JSONObject> findArriveTimeListEdit0410(String date, Integer personCount, Long projectId, Integer durationMinutes, Long shopId,long orderId, Long massagistId) {
        List<Shop> availableShopList = shopService.findAvailableShopList();


        LocalDateTime nowTime = DateUtil.stringToLocalDate(date).atTime(LocalTime.of(9, 50, 0));
        Shop shop = availableShopList.stream().filter(s -> shopId.equals(s.getId())).findFirst().get();
        if (DateUtil.getCurrentDateCode().equals(date)) {
            nowTime = LocalDateTime.now();
        } else {
            if (shop != null || Strings.isNotBlank(shop.getClockInTime())) {
                nowTime = LocalDate.now().atTime(DateUtil.HHmmStrToTime(shop.getClockInTime()));
            }
        }
        LocalDateTime next15Time = DateUtil.findNextTime(nowTime);
        long l = DateUtil.diffMinutes(nowTime, next15Time);
        if (l < 5) {
            nowTime = next15Time;
        }
        LocalDateTime now = nowTime;
        int threadCount = Runtime.getRuntime().availableProcessors();
        ExecutorService executor = Executors.newFixedThreadPool(threadCount);
        List<CompletableFuture<List<JSONObject>>> futures = new ArrayList<>();

        CompletableFuture<List<JSONObject>> future = CompletableFuture.supplyAsync(() -> {
            return getJsonObjects0410(now, null, personCount, durationMinutes, shop, null, null,projectId,shopId,date);
        }, executor);
        futures.add(future);

        CompletableFuture<List<JSONObject>> allResults = CompletableFuture.allOf(futures.toArray(new CompletableFuture[0]))
                .thenApply(v -> futures.stream().flatMap(f -> f.join().stream()).collect(Collectors.toList()));
        List<JSONObject> resultList = new ArrayList<>();
        try {
            List<JSONObject> allObjectList = allResults.join();
            Map<String, List<JSONObject>> timeMap = allObjectList.stream().collect(Collectors.groupingBy(o -> o.getString("time")));
            timeMap.keySet().stream().sorted().forEach(time -> {
                JSONObject object = new JSONObject();
                object.put("time", time);
                object.put("state", 0);
                List<JSONObject> objects = timeMap.get(time);
                if (CollectionUtils.isEmpty(objects)) {
                    return;
                }
                List<JSONObject> shopList = objects.stream().filter(o -> o.getInteger("state") == 1).collect(Collectors.toList());
                if (!CollectionUtils.isEmpty(shopList)) {
                    object.put("state", 1);
                    object.put("shopList", shopList);
                }
                resultList.add(object);
            });
        } catch (Exception e) {
            e.printStackTrace();
            throw new BusinessException("系统错误");
        }
        return resultList;
    }

    public Integer newCustomerZheKou(Long shopId) {
        Integer zheKou=0;
        List<OrderDiscount> list= orderDiscountService.list();
        //获取新客折扣数据
        for (OrderDiscount orderDiscount : list) {
            if (orderDiscount.getShopId().equals(shopId)&&orderDiscount.getType().equals(1)) {
                zheKou = orderDiscount.getDiscount();
                break;
            }
        }

        return  zheKou;
    }
}
