package com.macro.mall.service;

import cn.hutool.crypto.SecureUtil;
import cn.hutool.crypto.symmetric.AES;
import com.alibaba.fastjson2.JSON;
import com.alibaba.fastjson2.JSONArray;
import com.alibaba.fastjson2.JSONObject;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.github.pagehelper.PageInfo;
import com.macro.mall.common.exception.BusinessException;
import com.macro.mall.component.RabbitMqSender;
import com.macro.mall.entity.*;
import com.macro.mall.enums.CouponState;
import com.macro.mall.enums.GiveGiftState;
import com.macro.mall.mapper.GiveGiftMapper;
import com.macro.mall.service.base.BaseService;
import com.macro.mall.service.base.WrapperBuilder;
import com.macro.mall.utils.DateUtil;
import org.springframework.beans.BeanUtils;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.CollectionUtils;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.stream.Collectors;

/**
 * 赠送礼物 服务类
 *
 * @author ST
 * @date 2025/06/03
 */
@Service
public class GiveGiftService extends BaseService<GiveGiftMapper, GiveGift> {
    @Autowired
    GiveGiftHistoryService giveGiftHistoryService;
    @Autowired
    GiveTempGiftService giveTempGiftService;
    @Autowired
    @Lazy
    CustomerCouponService customerCouponService;
    @Autowired
    RabbitMqSender rabbitMqSender;
    @Autowired
    CouponService couponService;
    @Autowired
    @Lazy
    OrderService orderService;
    @Autowired
    @Lazy
    CustomerService customerService;

    private static final String shareCodeKey = "j9123hnfvg:HL8dh";
    private static final String defaultGiftImg = "https://fullytherapy.oss-cn-hangzhou.aliyuncs.com/fully/icon/Full%E6%84%88%E5%88%B8.jpg";

    // 超时时间，
    public static final long TIMEOUT_HOUR = 48;
    public static final long TIMEOUT_MS = TIMEOUT_HOUR * 60 * 60 * 1000;

    @Override
    protected QueryWrapper<GiveGift> buildWrapper(Map<String, Object> params, QueryWrapper<GiveGift> queryWrapper) {
        return WrapperBuilder.init(queryWrapper, params)
                .like("title")
                .equal("customer_id")
                .equal("is_gift")
                .in("state")
                .getQueryWrapper();
    }

    /**
     * 分页查询
     *
     * @param params
     * @return
     */
    public PageInfo pageInfo(Map<String, Object> params) {
        PageInfo<GiveGift> page = page(params);
        buildDetail(page.getList());
        return page;
    }

    /**
     * 商品详情
     *
     * @param list
     */
    private void buildDetail(List<GiveGift> list) {
        if (CollectionUtils.isEmpty(list)) {
            return;
        }
        Map<Long, List<JSONObject>> couponMap = list.stream().collect(Collectors.groupingBy(GiveGift::getId,
                Collectors.collectingAndThen(Collectors.toList(), couponList -> couponList.stream()
                        .flatMap(s -> JSONArray.parseArray(s.getContent(), JSONObject.class).stream()).collect(Collectors.toList())
                )
        ));
        List<Long> idList = couponMap.values().stream().flatMap(List::stream).map(s -> s.getLong("couponId")).collect(Collectors.toList());
        Map<Long, Coupon> map = new HashMap<>();
        if (!CollectionUtils.isEmpty(idList)) {
            List<Coupon> couponList = couponService.listByIds(idList);
            map = couponList.stream().collect(Collectors.toMap(Coupon::getId, e -> e));
        }
        List<Long> orderIdList = list.stream().filter(s -> s.getOrderId() != null).map(GiveGift::getOrderId).collect(Collectors.toList());
        Map<Long, Order> orderMap = new HashMap<>();
        if (!CollectionUtils.isEmpty(orderIdList)) {
            List<Order> orderList = orderService.listByIds(orderIdList);
            orderMap = orderList.stream().collect(Collectors.toMap(Order::getId, s -> s));
        }
        Map<Long, Order> finalOrderMap = orderMap;
        Map<Long, Coupon> finalMap = map;
        list.forEach(s -> {
            Order order = finalOrderMap.getOrDefault(s.getOrderId(), null);
            if (order != null) {
                s.setCode(order.getCode());
                s.setPayTime(order.getPayTime());
                s.setTotalAmount(order.getTotalAmount());
            }
            List<JSONObject> jsonObjectList = couponMap.getOrDefault(s.getId(), null);
            if (CollectionUtils.isEmpty(jsonObjectList)) {
                return;
            }

            Map<Long, Integer> sizeMap = new HashMap<>();
            for (JSONObject object : jsonObjectList) {
                Long couponId = object.getLong("couponId");
                Integer cSize = object.getInteger("size");
                Integer size = sizeMap.getOrDefault(couponId, 0);
                sizeMap.put(couponId, size + cSize);
            }

            List<String> nameList = new ArrayList<>();
            for (Map.Entry<Long, Integer> entry : sizeMap.entrySet()) {
                Long couponId = entry.getKey();
                Integer size = entry.getValue();

                Coupon coupon = finalMap.getOrDefault(couponId, null);
                if (coupon != null) {
                    if (coupon.getUseType() == 0) {
                        nameList.add(coupon.getTitle() + "x" + size + "张");
                    } else {
                        nameList.add(coupon.getTitle());
                    }
                } else {
                    nameList.add("券包" + "x" + size + "张");
                }
            }
            s.setCouponName(String.join(",", nameList));
        });
    }

    /**
     * 购券赠送礼物
     *
     * @param customerCouponList
     * @param orderId
     */
    public void createGift(List<CustomerCoupon> customerCouponList, Long orderId, Long customerId) {
        if (CollectionUtils.isEmpty(customerCouponList)) {
            throw new BusinessException("礼物不能为空");
        }
        GiveGift giveGift = new GiveGift();
        giveGift.setCustomerId(customerId);
        if (orderId != null) {
            giveGift.setOrderId(orderId);
        }
        if (StringUtils.isEmpty(giveGift.getImage())) {
            giveGift.setImage(defaultGiftImg);
        }
        List<JSONObject> jsonObjectList = customerCouponList.stream().map(s -> {
            JSONObject jsonObject = new JSONObject();
            jsonObject.put("customerCouponId", s.getId());
            jsonObject.put("couponId", s.getCouponId());
            jsonObject.put("size", 1);
            return jsonObject;
        }).collect(Collectors.toList());
        giveGift.setContent(JSONObject.toJSONString(jsonObjectList));
        giveGift.setState(GiveGiftState.NO_SEND.getValue());
        save(giveGift);
    }
    /**
     * xin购券赠送礼物
     *
     * @param customerCouponList
     * @param orderId
     */
    public long createGiftNew(List<CustomerCoupon> customerCouponList, Long orderId, Long customerId,String titleVal,String cardImage) {
        if (CollectionUtils.isEmpty(customerCouponList)) {
            throw new BusinessException("礼物不能为空");
        }
        GiveGift giveGift = new GiveGift();
        giveGift.setCustomerId(customerId);
        if (orderId != null) {
            giveGift.setOrderId(orderId);
        }
        /*if (StringUtils.isEmpty(giveGift.getImage())) {
            giveGift.setImage(defaultGiftImg);
        }*/
        List<JSONObject> jsonObjectList = customerCouponList.stream().map(s -> {
            JSONObject jsonObject = new JSONObject();
            jsonObject.put("customerCouponId", s.getId());
            jsonObject.put("couponId", s.getCouponId());
            jsonObject.put("size", 1);
            return jsonObject;
        }).collect(Collectors.toList());
        giveGift.setImage(cardImage);
        giveGift.setTitle(titleVal);
        giveGift.setContent(JSONObject.toJSONString(jsonObjectList));
        giveGift.setState(GiveGiftState.DOING.getValue());
        save(giveGift);
        return  giveGift.getId();
    }

    /**
     * 已有券赠送礼物
     *
     * @param customerCouponIdList
     * @param customerId
     */
    @Transactional(rollbackFor = Exception.class)
    public void createGift(List<Long> customerCouponIdList, Long customerId) {
        if (CollectionUtils.isEmpty(customerCouponIdList)) {
            throw new BusinessException("礼物不能为空");
        }
        List<CustomerCoupon> customerCouponList = customerCouponService.changeCouponStateBatch(customerCouponIdList, CouponState.GIVE.getValue());
        createGift(customerCouponList, null, customerId);
    }

    public void sendGift(GiveGift form) {
        Long giftId = form.getId();
        Long customerId = form.getCustomerId();

        GiveGift gift = getById(giftId);
        if (!gift.getCustomerId().equals(customerId)) {
            throw new BusinessException("券包礼物不存在");
        }

        Integer state = gift.getState();
        if (!GiveGiftState.NO_SEND.getValue().equals(state)) {
            if (GiveGiftState.DOING.getValue().equals(state)) {
                return;
            } else {
                throw new BusinessException("当前礼物状态不允许分享");
            }
        }
        gift.setState(GiveGiftState.DOING.getValue());
        gift.setTitle(form.getTitle());
        gift.setImage(form.getImage());
        gift.setSendTime(LocalDateTime.now());
        updateById(gift);
        rabbitMqSender.sendGiveGiftMessage(giftId, TIMEOUT_MS);
    }

    public String genShareCode(Long giftId, Long customerId) {
        GiveGift gift = getById(giftId);
        if (!gift.getCustomerId().equals(customerId)) {
            throw new BusinessException("礼品不存在");
        }

        String shareCode = gift.getShareCode();
        if (!StringUtils.isEmpty(shareCode)) {
            return shareCode;
        }

        LocalDateTime sendTime = gift.getSendTime();

        if (sendTime == null) {
            sendTime = LocalDateTime.now();
        }
        String format = sendTime.format(DateTimeFormatter.ofPattern("yyyyMMddHHmmss"));
        String plainCode = giftId + "#" + format;

        AES aes = SecureUtil.aes(shareCodeKey.getBytes());
        shareCode = aes.encryptHex(plainCode);

        gift.setShareCode(shareCode);
        updateById(gift);

        return shareCode;
    }

    /**
     * 领取赠送的礼物
     *
     * @param id
     * @param toCustomerId
     */
    @Transactional(rollbackFor = Exception.class)
    public void getGiveGiftList(Long id, Long toCustomerId, String shareCode) {

        try {
            if (StringUtils.isEmpty(shareCode)) {
                throw new BusinessException("分享码为空");
            }

            AES aes = SecureUtil.aes(shareCodeKey.getBytes());
            String str = aes.decryptStr(shareCode);

            String[] split = str.split("#");
            String shareId = split[0];
            if (Long.parseLong(shareId) != id) {
                throw new BusinessException("分享码解析异常");
            }
        } catch (Exception e) {
            e.printStackTrace();
            throw new BusinessException("礼物分享信息异常");
        }

        GiveGift giveGift = getById(id);
        Long fromCusId = giveGift.getCustomerId();
        if (fromCusId.equals(toCustomerId)) {
            throw new BusinessException("不可领取自己分享的礼物");
        }
        Integer state = giveGift.getState();
        if (!Objects.equals(state, GiveGiftState.DOING.getValue())) {
            throw new BusinessException("礼物不可领取");
        }

        giveGift.setState(GiveGiftState.FINISHED.getValue());
        updateById(giveGift);
        giveGiftHistoryService.createGiveGiftHistory(giveGift, toCustomerId);
        List<JSONObject> jsonObjectList = JSONArray.parseArray(giveGift.getContent(), JSONObject.class);
        List<Long> customerCouponId = jsonObjectList.stream().map(s -> s.getLong("customerCouponId")).collect(Collectors.toList());
        customerCouponService.changeCustomerIdBatch(customerCouponId, toCustomerId, true);
    }

    /**
     * 撤回返回券包
     *
     * @param id
     */
    @Transactional(rollbackFor = Exception.class)
    public void revocation(Long id) {
        GiveGift giveGift = super.getById(id);

        if (giveGift == null) {
            throw new BusinessException("礼物不存在");
        }
        Integer state = giveGift.getState();

        if (Objects.equals(state, GiveGiftState.FINISHED.getValue())) {
            throw new BusinessException("礼物已被领取");
        }
        if (Objects.equals(state, GiveGiftState.DOING.getValue())) {
            throw new BusinessException("礼物已被分享，不可撤回");
        }
        List<JSONObject> jsonObjectList = JSONArray.parseArray(giveGift.getContent(), JSONObject.class);
        customerCouponService.changeCustomerIdBatch(jsonObjectList.stream().map(s -> s.getLong("customerCouponId")).collect(Collectors.toList()), giveGift.getCustomerId(), true);
        giveGift.setState(GiveGiftState.FINISHED.getValue());
        updateById(giveGift);
        giveGiftHistoryService.createGiveGiftHistory(giveGift, giveGift.getCustomerId());
    }

    /**
     * 礼物超时
     * 超时转为待赠送
     *
     * @param id
     */
    public void handleTimeout(Long id) {
        GiveGift giveGift = super.getById(id);
        Integer state = giveGift.getState();
        if (!GiveGiftState.DOING.getValue().equals(state)) {
            return;
        }
        /*giveGift.setState(GiveGiftState.NO_SEND.getValue());
        updateById(giveGift);*/
    }

    /**
     * 根据id获取礼物信息
     *
     * @param id
     * @return
     */
    private GiveGift getById(Long id) {
        GiveGift giveGift = super.getById(id);
        if (giveGift == null) {
            throw new BusinessException("礼物不存在或已取消分享");
        } else if (GiveGiftState.FINISHED.getValue().equals(giveGift.getState())) {
            throw new BusinessException("礼物已被领取");
        } else if (GiveGiftState.CANCELED.getValue().equals(giveGift.getState())) {
            throw new BusinessException("礼物已撤回");
        } else if (GiveGiftState.TIMEOUT.getValue().equals(giveGift.getState())) {
            throw new BusinessException("礼物已超时退回");
        }
        return giveGift;
    }

    public JSONObject getGiftInfo(Long id) {
        GiveGift gift = super.getById(id);

        String content = gift.getContent();
        Long orderId = gift.getOrderId();

        Order order = orderService.getById(orderId);
        JSONArray jsonArray = JSON.parseArray(content);

        List<Long> couponIdList = new ArrayList<>();
        for (int i = 0; i < jsonArray.size(); i++) {
            JSONObject object = jsonArray.getJSONObject(i);
            Long couponId = object.getLong("couponId");
            couponIdList.add(couponId);
        }

        Map<Long, Coupon> couponMap = couponService.getCouponMap(couponIdList);

        Map<Long, Integer> sizeMap = new HashMap<>();
        for (int i = 0; i < jsonArray.size(); i++) {
            JSONObject object = jsonArray.getJSONObject(i);
            Long couponId = object.getLong("couponId");
            Integer cSize = object.getInteger("size");
            Integer size = sizeMap.getOrDefault(couponId, 0);
            sizeMap.put(couponId, size + cSize);
        }

        List<JSONObject> giftDetailList = new ArrayList<>();
        for (Map.Entry<Long, Integer> entry : sizeMap.entrySet()) {
            Long couponId = entry.getKey();
            Integer size = entry.getValue();

            Coupon coupon = couponMap.getOrDefault(couponId, null);
            JSONObject detail = new JSONObject();

            if (coupon != null) {
                detail.put("name", coupon.getTitle());
                detail.put("comment", coupon.getComment());
                detail.put("size", size);
                detail.put("useType", coupon.getUseType());
                detail.put("minutes", coupon.getMinutes());
                if (coupon.getValidDate() != 0) {
                    detail.put("endDate", DateUtil.addDate(DateUtil.stringToLocalDate(DateUtil.toYYYYMMDD(gift.getCreateTime())), coupon.getValidDate()));
                }
            } else {
                detail.put("name", "券包" + "x" + size + "张");
                detail.put("useType", 0);
            }

            giftDetailList.add(detail);
        }
        JSONObject retData = new JSONObject();
        retData.put("order", order);
        retData.put("gift", gift);
        retData.put("giftDetail", giftDetailList);

        return retData;
    }

    public JSONObject getGiftInfoNew(Long id) {
        GiveGift gift = super.getById(id);
        if (gift == null) {
            gift=new GiveGift();
           GiveTempGift giveTempGift=  giveTempGiftService.getById(id);
            BeanUtils.copyProperties(giveTempGift,gift);
            gift.setState(3);//标识已取消分享
        }
        String content = gift.getContent();
        Long orderId = gift.getOrderId();

        Order order = orderService.getById(orderId);
        JSONArray jsonArray = JSON.parseArray(content);

        List<Long> couponIdList = new ArrayList<>();
        for (int i = 0; i < jsonArray.size(); i++) {
            JSONObject object = jsonArray.getJSONObject(i);
            Long couponId = object.getLong("couponId");
            couponIdList.add(couponId);
        }

        Map<Long, Coupon> couponMap = couponService.getCouponMap(couponIdList);

        Map<Long, Integer> sizeMap = new HashMap<>();
        for (int i = 0; i < jsonArray.size(); i++) {
            JSONObject object = jsonArray.getJSONObject(i);
            Long couponId = object.getLong("couponId");
            Integer cSize = object.getInteger("size");
            Integer size = sizeMap.getOrDefault(couponId, 0);
            sizeMap.put(couponId, size + cSize);
        }

        List<JSONObject> giftDetailList = new ArrayList<>();
        for (Map.Entry<Long, Integer> entry : sizeMap.entrySet()) {
            Long couponId = entry.getKey();
            Integer size = entry.getValue();

            Coupon coupon = couponMap.getOrDefault(couponId, null);
            JSONObject detail = new JSONObject();

            if (coupon != null) {
                detail.put("name", coupon.getTitle());
                detail.put("comment", coupon.getComment());
                detail.put("size", size);
                detail.put("useType", coupon.getUseType());
                detail.put("minutes", coupon.getMinutes());
                if (coupon.getValidDate() != 0) {
                    detail.put("endDate", DateUtil.addDate(DateUtil.stringToLocalDate(DateUtil.toYYYYMMDD(gift.getCreateTime())), coupon.getValidDate()));
                }
            } else {
                detail.put("name", "券包" + "x" + size + "张");
                detail.put("useType", 0);
            }

            giftDetailList.add(detail);
        }
        JSONObject retData = new JSONObject();
        retData.put("order", order);
        retData.put("gift", gift);
        retData.put("giftDetail", giftDetailList);

        return retData;
    }



    /**
     * 根据订单id获取
     *
     * @param orderId
     * @return
     */
    public GiveGift getByOrderId(Long orderId) {
        LambdaQueryWrapper<GiveGift> lqw = new LambdaQueryWrapper<>();
        lqw.eq(GiveGift::getOrderId, orderId);
        return getOnlyOne(lqw);
    }

    /**
     * 获取领取礼物的手机号
     *
     * @param orderIdList
     * @return
     */
    public Map<Long, Customer> getGiftToCustomerMap(List<Long> orderIdList) {
        if (CollectionUtils.isEmpty(orderIdList)) {
            return new HashMap<>();
        }
        LambdaQueryWrapper<GiveGift> lqw = new LambdaQueryWrapper<>();
        lqw.in(GiveGift::getOrderId, orderIdList);
        List<GiveGift> list = list(lqw);
        List<Long> giftIdList = list.stream().map(GiveGift::getId).collect(Collectors.toList());

        Map<Long, Long> orderIdMap = list.stream().collect(Collectors.toMap(GiveGift::getId, GiveGift::getOrderId));
        Map<Long, Long> customerIdMap = giveGiftHistoryService.getGiftToCustomerMap(giftIdList);
        Map<Long, Long> orderToCustomerIdMap = new HashMap<>();
        giftIdList.forEach(s -> {
            Long customerId = customerIdMap.getOrDefault(s, null);
            if (customerId != null) {
                orderToCustomerIdMap.put(orderIdMap.get(s), customerId);
            }
        });
        Map<Long, Customer> customerMap = customerService.getCustomerMapByIdList(new ArrayList<>(customerIdMap.values()));
        Map<Long, Customer> map = new HashMap<>();
        orderToCustomerIdMap.forEach((k, v) -> {
            Customer customer = customerMap.getOrDefault(v, null);
            map.put(k, customer);
        });
        return map;
    }

    public GiveGift getFindOrderAndCustomerId(Long orderId, Long customerId) {
        LambdaQueryWrapper<GiveGift> lqw = new LambdaQueryWrapper<>();
        lqw.eq(GiveGift::getOrderId, orderId);
        lqw.eq(GiveGift::getCustomerId, customerId);
        return getOnlyOne(lqw);
    }
}