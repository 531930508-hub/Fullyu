package com.macro.mall.service.job;

import cn.hutool.core.util.StrUtil;
import com.alibaba.fastjson2.JSONArray;
import com.alibaba.fastjson2.JSONObject;
import com.macro.mall.consts.RedisKey;
import com.macro.mall.dto.OrderDetailDto;
import com.macro.mall.entity.Order;
import com.macro.mall.entity.OrderDetail;
import com.macro.mall.entity.Shop;
import com.macro.mall.enums.AppointmentType;
import com.macro.mall.enums.OrderPayType;
import com.macro.mall.enums.OrderType;
import com.macro.mall.service.MassagistSchedulesService;
import com.macro.mall.service.OrderDetailService;
import com.macro.mall.service.OrderPrintRecordService;
import com.macro.mall.service.OrderService;
import com.macro.mall.service.shop.ShopService;
import com.macro.mall.utils.DateUtil;
import com.macro.mall.utils.RedisUtil;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.BeanUtils;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.CollectionUtils;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.stream.Collectors;

/**
 * @author zkl on 2025/8/13
 */
@Component
@Slf4j
public class ReceptionScheduled {
    @Value("${spring.profiles.active}")
    private String active;
    @Autowired
    ShopService shopService;
    @Autowired
    RedisUtil redisUtil;
    @Autowired
    MassagistSchedulesService massagistSchedulesService;
    @Autowired
    OrderService orderService;
    @Autowired
    OrderDetailService orderDetailService;

    private Integer RECEPTION_DURATION = 45;//接待时长30分钟
    @Autowired
    private OrderPrintRecordService orderPrintRecordService;

    @Scheduled(cron = "0 0,15,30,45 * * * ?")
    public void reception() {
        //这个是自动生成接待
        System.out.println(active);
        LocalDateTime dateTime = LocalDateTime.now().plusMinutes(15);

        //buildReceptionData(dateTime);//老方法
        buildReceptionDataNew(dateTime);//新方法
    }
    public  void buildReceptionDataNew(LocalDateTime dateTime) {
        log.info("active:{}", active);
        int hour = dateTime.getHour();// 获取小时
        int minute = dateTime.getMinute(); // 获取当前分钟数
        LocalDate localDate = dateTime.toLocalDate();
        String day = DateUtil.toYYYYMMDD(dateTime);//yyyy-MM-dd
        String mmdd = DateUtil.toHHmm(dateTime);//HH:mm
        List<Shop> availableShopList = shopService.findAvailableShopList();
        for (int i = 0; i < availableShopList.size(); i++){
            RECEPTION_DURATION=45;
            Shop shop = availableShopList.get(i);
            Long shopId = shop.getId();
            String localTime = DateUtil.toHHmm(dateTime.toLocalTime());
            if (localTime.compareTo(shop.getClockInTime()) < 0 || localTime.compareTo(shop.getClockOutTime()) >= 0) {
                continue;
            }
            //如果这个时间点有接单记录,则不生成
            LocalDateTime aEndTime = dateTime.plusMinutes(RECEPTION_DURATION);
            //检查结束时间是否大于店铺结束时间
            String EndTimeHHMM=DateUtil.toHHmm(aEndTime.toLocalTime());
            if (EndTimeHHMM.compareTo(shop.getClockOutTime()) > 0) {
                LocalDateTime ldt=DateUtil.string2DateTime(day+" "+shop.getClockOutTime()+":00");
                RECEPTION_DURATION= (int) ChronoUnit.MINUTES.between(dateTime.toLocalTime(), ldt.toLocalTime());
            }
            int count=0;
            List<OrderDetail> detailList =orderDetailService.getBaseMapper().findSimpleListByStartDateAndShop(day, shopId);
            if(detailList.size()>0){
                detailList=detailList.stream().filter(t->t.getProjectId()==3).collect(Collectors.toList());
                for (OrderDetail t : detailList){
                    LocalDateTime detailEndTime = t.getEndTime();
                    LocalDateTime detailStartTime = t.getStartTime();
                    boolean ckResult = !(DateUtil.toHHmm(dateTime).compareTo(DateUtil.toHHmm(detailEndTime)) >= 0
                            || DateUtil.toHHmm(aEndTime).compareTo(DateUtil.toHHmm(detailStartTime)) <= 0);
                    if(ckResult){
                        count++;
                    }
                }
            }
            if(count==0) {
                OrderDetailDto orderDetailDto = new OrderDetailDto();
                orderDetailDto.setShopId(shopId);
                orderDetailDto.setType(2);
                orderDetailDto.setCouponSize(0);
                orderDetailDto.setDurationMinutes(RECEPTION_DURATION);
                orderDetailDto.setPersonCount(1);
                orderDetailDto.setStartTime(dateTime);
                orderDetailDto.setMassagistIdList(new ArrayList<>(0));
                orderDetailDto.setBedIdList(new ArrayList<>(0));
                orderDetailDto.setIsGift(false);
                orderDetailDto.setQuantity(1);
                orderDetailDto.setPayType(3);
                orderDetailDto.setIsUpdateSort(false);
                try {
                    appointmentReceptionOrder(orderDetailDto);
                } catch (Exception e) {
                    log.error("自动生成接待失败", e);
                }
            }
        }

    }
    @Transactional(rollbackFor = Exception.class)
    public  void appointmentReceptionOrder(OrderDetailDto orderDetailDto) {
        orderDetailDto.setPayType(OrderPayType.WECHAT.getValue());
        orderDetailDto.setAppointmentType(AppointmentType.PHONE.getValue());
        Long orderId = null;
        if (OrderType.RECEPTION.getValue().equals(orderDetailDto.getType())) {
            Order order = new Order();
            BeanUtils.copyProperties(orderDetailDto, order);
            order.setProductTitle("接待");
            String yearMonth = LocalDate.now().format(DateTimeFormatter.ofPattern("yyyyMMdd"));
            String orderCode = "S" + yearMonth + String.format("%07d", order.getId());
            order.setCode(orderCode);

            orderService.save(order);
            orderService.finishPay(order);
            orderId = order.getId();
            orderDetailDto.setOrderId(orderId);
            orderDetailService.createReceptionDetail(orderDetailDto);
        }
    }

    public void buildReceptionData(LocalDateTime dateTime) {
        log.info("active:{}", active);
        int hour = dateTime.getHour();
        int minute = dateTime.getMinute();
        LocalDate localDate = dateTime.toLocalDate();
        String day = DateUtil.toYYYYMMDD(dateTime);
        List<Shop> availableShopList = shopService.findAvailableShopList();
        for (int i = 0; i < availableShopList.size(); i++) {
            Shop shop = availableShopList.get(i);
            Long shopId = shop.getId();
            String localTime = DateUtil.toHHmm(dateTime.toLocalTime());
            if (localTime.compareTo(shop.getClockInTime()) < 0 || localTime.compareTo(shop.getClockOutTime()) > 0) {
                continue;
            }
            String receptionPriorityMassagistStr = redisUtil.getString(RedisKey.RECEPTION_PRIORITY_MASSAGIST + shopId + ":");
            List<Long> massagistSchedulesList;
            if (StrUtil.isBlank(receptionPriorityMassagistStr)) {
                massagistSchedulesList = massagistSchedulesService.getMassagistSchedulesList(day, shopId);
                if (CollectionUtils.isEmpty(massagistSchedulesList)) {
                    continue;
                }
                Collections.reverse(massagistSchedulesList);
            } else {
                massagistSchedulesList = JSONArray.parseArray(receptionPriorityMassagistStr, Long.class);
            }

            String resultStr = redisUtil.getString(RedisKey.RECEPTION_DATA + shopId + ":");
            JSONObject data = new JSONObject();
            data.put("currMassagistId", "FULL");
            data.put("currMassagistReceptionTime", null);
            data.put("nextMassagistId", "FULL");
            if (!StrUtil.isBlank(resultStr)) {
                data = JSONObject.parseObject(resultStr);
            }
            log.info("当前技师接待排班队列：{}", massagistSchedulesList);
            if (minute == 0 || minute == 30) {
                Long receptionMassagistId = null;
                LocalDateTime time = dateTime.withSecond(0);
                LocalDateTime time1 = dateTime.withSecond(0).plusMinutes(30);
                String standString1 = DateUtil.toStandString(time);
                String standString2 = DateUtil.toStandString(time1);
                JSONArray jsonArray = JSONArray.of(standString1, standString2);
                data.put("currMassagistReceptionTime", jsonArray.toJSONString());
                List<Long> availableMassagistList = orderDetailService.listByReceptionDateTime(time, time1, shopId);
                if (CollectionUtils.isEmpty(availableMassagistList)) {
                    log.info("当前日期:{},小时：{}，分钟：{},服务时间范围：{}-{},查询到此时间范围没有空闲的疗愈师,当前接待人设置为：{}",
                            localDate, hour, minute, standString1, standString2, "FULL");
                } else {
                    for (int j = 0; j < massagistSchedulesList.size(); j++) {
                        Long massagistId = massagistSchedulesList.get(j);
                        if (availableMassagistList.contains(massagistId)) {
                            receptionMassagistId = massagistId;
                            break;
                        }
                    }
                    log.info("当前日期:{},小时：{}，分钟：{},服务时间范围：{}-{},查询到有空闲的疗愈师:{}，当前接待人设置为：{}",
                            localDate, hour, minute, standString1, standString2, availableMassagistList, receptionMassagistId == null ? "FULL" : receptionMassagistId);
                }
                if (receptionMassagistId != null) {
                    data.put("currMassagistId", receptionMassagistId);
                    massagistSchedulesList.remove(receptionMassagistId);
                    massagistSchedulesList.add(receptionMassagistId);
                } else {
                    data.put("currMassagistId", "FULL");
                }
            }
            LocalDateTime time;
            LocalDateTime time1;
            Long receptionMassagistId = null;
            if (minute == 0 || minute == 15) {
                time = dateTime.withMinute(30).withSecond(0);
                time1 = dateTime.withMinute(30).withSecond(0).plusMinutes(30);
            } else {
                time = dateTime.withMinute(0).withSecond(0).plusHours(1);
                time1 = dateTime.withMinute(0).withSecond(0).plusHours(1).plusMinutes(30);
            }
            List<Long> availableMassagistList = orderDetailService.listByReceptionDateTime(time, time1, shopId);
            String standString1 = DateUtil.toStandString(time);
            String standString2 = DateUtil.toStandString(time1);
            if (CollectionUtils.isEmpty(availableMassagistList)) {
                log.info("当前日期:{},小时：{}，分钟：{},服务时间范围：{}-{},查询到此时间范围没有空闲的疗愈师，预计下个接待人：{}",
                        localDate, hour, minute, standString1, standString2, "FUll");
            } else {
                for (int j = 0; j < massagistSchedulesList.size(); j++) {
                    Long massagistId = massagistSchedulesList.get(j);
                    if (availableMassagistList.contains(massagistId)) {
                        receptionMassagistId = massagistId;
                        break;
                    }
                }
                log.info("当前日期:{},小时：{}，分钟：{},服务时间范围：{}-{},查询到有空闲的疗愈师:{},预计下个接待人：{}",
                        localDate, hour, minute, standString1, standString2, availableMassagistList, receptionMassagistId == null ? "FULL" : receptionMassagistId);
            }
            data.put("nextMassagistId", receptionMassagistId == null ? "FULL" : receptionMassagistId);
            setReceptionData(shopId, data, dateTime, shop.getClockOutTime(), massagistSchedulesList);
        }
    }

    private void setReceptionData(Long shopId, JSONObject data, LocalDateTime dateTime, String clockOutTime, List<Long> massagistSchedulesList) {
        LocalTime localTime = dateTime.toLocalTime();
        LocalTime parse = LocalTime.parse(clockOutTime + ":00");
        long secondsDifference = ChronoUnit.SECONDS.between(localTime, parse);

        if (secondsDifference <= 0) {
            log.info("下班时间已过，不在存储接待排班信息");
            return;
        }
        String string = data.toJSONString();
        String receptionPriorityMassagistStr = JSONArray.toJSONString(massagistSchedulesList);
        redisUtil.setString(RedisKey.RECEPTION_DATA + shopId + ":", string, secondsDifference);
        redisUtil.setString(RedisKey.RECEPTION_PRIORITY_MASSAGIST + shopId + ":", receptionPriorityMassagistStr, secondsDifference);
    }
}
