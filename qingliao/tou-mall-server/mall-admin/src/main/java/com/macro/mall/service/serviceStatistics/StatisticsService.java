package com.macro.mall.service.serviceStatistics;

import cn.hutool.core.util.ObjUtil;
import com.alibaba.fastjson2.JSONObject;
import com.github.pagehelper.PageHelper;
import com.github.pagehelper.PageInfo;
import com.macro.mall.common.exception.BusinessException;
import com.macro.mall.dto.OperatingRevenueDto;
import com.macro.mall.dto.SalaryRecordDto;
import com.macro.mall.dto.ServiceDurationDto;
import com.macro.mall.entity.Adjust;
import com.macro.mall.entity.Massagist;
import com.macro.mall.entity.OrderDetail;
import com.macro.mall.entity.Shop;
import com.macro.mall.enums.AdjustType;
import com.macro.mall.enums.OrderType;
import com.macro.mall.mapper.ServiceDurationPageMapper;
import java.time.format.DateTimeFormatter;
import com.macro.mall.service.*;
import com.macro.mall.service.shop.ShopService;
import com.macro.mall.utils.DateUtil;
import com.macro.mall.utils.ExcelUtil;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Service;
import org.springframework.util.CollectionUtils;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.*;
import java.util.stream.Collectors;

/**
 * @author zkl on 2025/6/13
 */
@Service
public class StatisticsService {
    @Autowired
    @Lazy
    OrderDetailService orderDetailService;
    @Autowired
    MassagistService massagistService;
    @Autowired
    AdjustService adjustService;
    @Autowired
    OrderService orderService;
    @Autowired
    ShopService shopService;
    @Autowired
    MassagistSchedulesService massagistSchedulesService;
    @Autowired
    ServiceDurationPageMapper durationPageMapper;

    /**
     * 接待工时占排班在岗时长的默认上限百分比。
     * 门店可在 s_shop.reception_cap_percent 单独配置，未配置时使用该默认值。
     */
    private static final int DEFAULT_RECEPTION_CAP_PERCENT = 20;

    /**
     * todo 未完成
     *
     * @param shopId
     * @param startTime
     * @param endTime
     * @param massagistId
     * @return
     */
    public List<JSONObject> serviceDuration(Long shopId, String startTime, String endTime, Long massagistId) {

        List<Massagist> massagistList = massagistService.listByShopId(null, massagistId);
        if (CollectionUtils.isEmpty(massagistList)) {
            return Collections.emptyList();
        }
        List<Long> massagistIdList = massagistList.stream().map(Massagist::getId).collect(Collectors.toList());
        List<OrderDetail> orderDetails = orderDetailService.timeList(shopId, startTime, endTime, massagistIdList);
        return aggregateServiceDuration(shopId, startTime, endTime, massagistList, orderDetails, false);
    }

    public Map<String, Object> serviceDurationPage(Long shopId, String startTime, String endTime, Long massagistId,
                                                   Integer status, int page, int size) {
        validateDurationQuery(startTime, endTime, status, page, size);
        Integer actualStatus = status == null ? 1 : status;
        long total = durationPageMapper.countPeriods(shopId, startTime, endTime, massagistId, actualStatus);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("total", total); result.put("pageNum", page); result.put("pageSize", size);
        result.put("list", Collections.emptyList());
        if (total == 0 || (long) (page - 1) * size >= total) return result;
        List<Map<String, Object>> keys = durationPageMapper.periodKeys(shopId, startTime, endTime, massagistId,
                actualStatus, (page - 1) * size, size);
        if (CollectionUtils.isEmpty(keys)) return result;
        List<Long> ids = keys.stream().map(k -> ((Number) k.get("massagistId")).longValue()).distinct().collect(Collectors.toList());
        List<Massagist> persons = massagistService.listByIds(ids);
        if (CollectionUtils.isEmpty(persons)) return result;
        List<OrderDetail> details = durationPageMapper.detailsForPeriods(shopId, startTime, endTime, massagistId, actualStatus, keys);
        List<JSONObject> list = aggregateServiceDuration(shopId, startTime, endTime, persons, details, true);
        list.sort(Comparator.comparing((JSONObject e) -> e.getString("periodCode"), Comparator.reverseOrder())
                .thenComparing(e -> e.getLong("massagistId")));
        result.put("list", list);
        return result;
    }

    private void validateDurationQuery(String startTime, String endTime, Integer status, int page, int size) {
        if (page < 1 || page > 100000 || size < 1 || size > 100) throw new BusinessException("分页参数不正确");
        if (status != null && !Arrays.asList(-1, 0, 1, 2).contains(status)) throw new BusinessException("合作状态不正确");
        try {
            DateTimeFormatter format = DateTimeFormatter.ofPattern("uuuu-MM-dd HH:mm:ss")
                    .withResolverStyle(java.time.format.ResolverStyle.STRICT);
            if (LocalDateTime.parse(endTime, format).isBefore(LocalDateTime.parse(startTime, format)))
                throw new BusinessException("统计结束日期不能早于开始日期");
        } catch (java.time.format.DateTimeParseException | NullPointerException e) {
            throw new BusinessException("统计日期格式不正确");
        }
    }

    private List<JSONObject> aggregateServiceDuration(Long shopId, String startTime, String endTime,
                                                      List<Massagist> massagistList, List<OrderDetail> orderDetails, boolean bounded) {
        if (CollectionUtils.isEmpty(orderDetails)) return Collections.emptyList();
        Map<Long, Massagist> massagistMap = massagistList.stream().collect(Collectors.toMap(Massagist::getId, s -> s));
        List<Long> massagistIdList = massagistList.stream().map(Massagist::getId).collect(Collectors.toList());
        orderDetailService.buildBedName(orderDetails);
        orderDetailService.buildCoefficient(orderDetails);
        orderDetailService.buildOrderType(orderDetails);
        // 接待工时封顶：按门店「排班在岗分钟 × 门店比例」计算上限，超出部分不计工时
        Map<String, Integer> scheduleMinutesMap = massagistSchedulesService.periodWorkMinutesByShop(startTime, endTime, massagistIdList);
        Map<Long, Integer> receptionCapPercentMap = receptionCapPercentMap();
        List<JSONObject> resultList = new ArrayList<>(orderDetails.stream()
                .filter(e -> e.getEndTime() != null)//根据预约完成时间做，完成时间可能不准
                .collect(Collectors.groupingBy(
                        e -> DateUtil.toYYYYMM(e.getEndTime()) + "|" + e.getMassagistId(),
                        Collectors.collectingAndThen(
                                Collectors.toList(),
                                list -> {
                                    OrderDetail first = list.get(0);
                                    long shopIdNew=first.getShopId();
                                    if(shopId==null){
                                        shopIdNew=massagistList.stream().filter(s->s.getId().equals(first.getMassagistId())).findFirst().orElseThrow(()->new BusinessException("疗愈师不存在")).getShopId();
                                    }
                                    ReceptionCapResult receptionCap = calcReceptionCap(list, first.getMassagistId(),
                                            DateUtil.toYYYYMM(first.getEndTime()), scheduleMinutesMap, receptionCapPercentMap);
                                    JSONObject jsonObject = JSONObject.of(
                                            "massagistId", first.getMassagistId(),
                                            "periodCode", DateUtil.toYYYYMM(first.getEndTime()),
                                            "totalWorkingHours", list.stream().mapToDouble(OrderDetail::getWorkingHours).sum()
                                                    - receptionCap.excessWorkingHours,
                                            "serviceCount", Integer.parseInt(String.valueOf(list.stream().filter(s -> OrderType.PRODUCT.getValue().equals(s.getType())).count())),
                                            "shopId",shopIdNew
                                    );
                                    jsonObject.put("receptionCount", Integer.parseInt(String.valueOf(list.stream().filter(s -> OrderType.RECEPTION.getValue().equals(s.getType())).count())));
                                    jsonObject.put("adjustDuration", 0);
                                    jsonObject.put("duration", list.stream().mapToInt(OrderDetail::getDuration).sum());
                                    jsonObject.put("serviceDuration", list.stream().filter(s -> OrderType.PRODUCT.getValue().equals(s.getType())).mapToInt(OrderDetail::getDuration).sum());
                                    jsonObject.put("serviceWorkingHours", list.stream().filter(s -> OrderType.PRODUCT.getValue().equals(s.getType())).mapToDouble(OrderDetail::getWorkingHours).sum());
                                    jsonObject.put("receptionDuration", list.stream().filter(s -> OrderType.RECEPTION.getValue().equals(s.getType())).mapToInt(OrderDetail::getDuration).sum());
                                    // receptionWorkingHours 为封顶后计入的接待工时
                                    jsonObject.put("receptionWorkingHours", receptionCap.countedWorkingHours);
                                    jsonObject.put("receptionCountedDuration", receptionCap.countedMinutes);
                                    jsonObject.put("receptionExcessDuration", receptionCap.excessMinutes);
                                    jsonObject.put("receptionExcessWorkingHours", receptionCap.excessWorkingHours);
                                    jsonObject.put("receptionCapMinutes", receptionCap.capMinutes);
                                    jsonObject.put("receptionCapApplied", receptionCap.capApplied);
                                    jsonObject.put("orderDetailList", list);
                                    jsonObject.put("massagist", massagistMap.get(first.getMassagistId()));
                                    return jsonObject;
                                }
                        )
                )).values());
        //查出疗愈师时长调整详情
        List<Adjust> adjustList = adjustService.timeList(shopId, startTime, endTime, massagistIdList);
        Map<String, Map<Long, JSONObject>> periodMassagistIdDurationMap = adjustList.stream().filter(e -> e.getAdjustDate() != null).collect(Collectors.groupingBy(e -> DateUtil.toYYYYMM(e.getAdjustDate())
                , Collectors.groupingBy(Adjust::getMassagistId, Collectors.collectingAndThen(Collectors.toList(), list -> {
                    int increase = list.stream()
                            .filter(a -> AdjustType.INCREASE.getValue().equals(a.getType()))
                            .mapToInt(Adjust::getDuration)
                            .sum();
                    int decrease = list.stream()
                            .filter(a -> AdjustType.DECREASE.getValue().equals(a.getType()))
                            .mapToInt(Adjust::getDuration)
                            .sum();
                    return JSONObject.of("adjustDuration", increase - decrease, "adjustList", list);
                }))));
        Map<String, JSONObject> periodWorkTimeMap = bounded
                ? massagistSchedulesService.periodWorkTimeMapByDateRangeNew(startTime, endTime, shopId, massagistIdList)
                : massagistSchedulesService.periodWorkTimeMapByDateRangeNew(startTime, endTime, shopId);
        resultList.forEach(e -> {
            String periodCodeKey = e.getString("periodCode");
            Long massagistIdKey = e.getLong("massagistId");
            Map<Long, JSONObject> massagistIdDurationMap = periodMassagistIdDurationMap.get(periodCodeKey);
            if (!ObjUtil.isEmpty(massagistIdDurationMap)) {
                JSONObject adjustObj = massagistIdDurationMap.get(massagistIdKey);
                if (!ObjUtil.isEmpty(adjustObj)) {
                    e.put("adjustDuration", adjustObj.getInteger("adjustDuration"));
                    e.put("totalWorkingHours", e.getDoubleValue("totalWorkingHours") + adjustObj.getDoubleValue("adjustDuration"));
                    e.put("adjustList", adjustObj.getList("adjustList", Adjust.class));
                }
            }
            JSONObject periodWorkTime = periodWorkTimeMap.getOrDefault(periodCodeKey + "|" + massagistIdKey, null);
            if (periodWorkTime != null) {
                e.put("dateRangeWorkTime", periodWorkTime.getDoubleValue("dateRange"));
                e.put("currentDateWorkTime", periodWorkTime.getDoubleValue("currentDate"));
            }
        });
        return resultList;
    }

    /**
     * 门店接待工时上限百分比；未配置的门店使用 20% 默认值，配置为 0 时不接待计薪。
     */
    private Map<Long, Integer> receptionCapPercentMap() {
        Map<Long, Integer> result = new HashMap<>();
        List<Shop> shopList = shopService.list();
        if (CollectionUtils.isEmpty(shopList)) {
            return result;
        }
        shopList.forEach(shop -> {
            if (shop.getId() != null) {
                result.put(shop.getId(), shop.getReceptionCapPercent() == null
                        ? DEFAULT_RECEPTION_CAP_PERCENT : shop.getReceptionCapPercent());
            }
        });
        return result;
    }

    /**
     * 计算某位疗愈师某月的接待工时封顶结果。
     * <p>按订单所属门店分别计算：上限 = 该门店当月排班在岗分钟 × 门店比例；
     * 接待分钟按开始时间先后计入，超过上限的部分工时系数按 0 计。
     * 若该疗愈师当月完全没有任何排班记录，则不封顶；
     * 若仅某门店当月无排班（如调店未补排班），该门店接待不封顶，避免数据缺口导致工资被清零。</p>
     */
    private ReceptionCapResult calcReceptionCap(List<OrderDetail> details, Long massagistId, String periodCode,
                                                Map<String, Integer> scheduleMinutesMap,
                                                Map<Long, Integer> percentMap) {
        ReceptionCapResult result = new ReceptionCapResult();
        List<OrderDetail> receptionList = details.stream()
                .filter(s -> OrderType.RECEPTION.getValue().equals(s.getType()))
                .collect(Collectors.toList());
        if (CollectionUtils.isEmpty(receptionList)) {
            return result;
        }
        Map<Long, List<OrderDetail>> shopDetailMap = receptionList.stream()
                .collect(Collectors.groupingBy(s -> s.getShopId() == null ? 0L : s.getShopId(),
                        LinkedHashMap::new, Collectors.toList()));
        boolean hasSchedule = shopDetailMap.keySet().stream()
                .anyMatch(shopId -> scheduleMinutesMap.getOrDefault(scheduleKey(periodCode, massagistId, shopId), 0) > 0);
        if (!hasSchedule) {
            result.countedMinutes = receptionList.stream().mapToInt(OrderDetail::getDuration).sum();
            result.countedWorkingHours = receptionList.stream().mapToDouble(OrderDetail::getWorkingHours).sum();
            result.countedWorkingHours = BigDecimal.valueOf(result.countedWorkingHours)
                    .setScale(2, RoundingMode.HALF_UP).doubleValue();
            return result;
        }
        shopDetailMap.forEach((shopId, shopDetails) -> {
            int scheduledMinutes = scheduleMinutesMap.getOrDefault(scheduleKey(periodCode, massagistId, shopId), 0);
            int percent = percentMap.getOrDefault(shopId, DEFAULT_RECEPTION_CAP_PERCENT);
            // 该门店当月无排班（常见于调店未补排班）：本店接待不封顶，避免数据缺口导致工资被清零。
            int capMinutes = scheduledMinutes <= 0 ? Integer.MAX_VALUE
                    : BigDecimal.valueOf(scheduledMinutes)
                    .multiply(BigDecimal.valueOf(percent))
                    .divide(BigDecimal.valueOf(100), 0, RoundingMode.DOWN).intValue();
            if (scheduledMinutes > 0) {
                result.capApplied = true;
                result.capMinutes += capMinutes;
            }
            int remaining = capMinutes;
            List<OrderDetail> sortedDetails = new ArrayList<>(shopDetails);
            sortedDetails.sort(Comparator.comparing(OrderDetail::getStartTime,
                    Comparator.nullsLast(Comparator.<LocalDateTime>naturalOrder())));
            for (OrderDetail detail : sortedDetails) {
                int duration = detail.getDuration() == null ? 0 : detail.getDuration();
                int countedMinutes = Math.min(duration, Math.max(remaining, 0));
                int excessMinutes = duration - countedMinutes;
                remaining -= countedMinutes;
                BigDecimal coefficient = detail.getCoefficient() == null ? BigDecimal.ONE : detail.getCoefficient();
                double countedWorking = coefficient.multiply(BigDecimal.valueOf(countedMinutes))
                        .setScale(2, RoundingMode.HALF_UP).doubleValue();
                double detailWorking = coefficient.multiply(BigDecimal.valueOf(duration))
                        .setScale(2, RoundingMode.HALF_UP).doubleValue();
                result.countedMinutes += countedMinutes;
                result.excessMinutes += excessMinutes;
                result.countedWorkingHours += countedWorking;
                // 用「整单工时 - 计入工时」得到超出工时，保证计入 + 超出 = 整单，避免逐项四舍五入产生分位差
                result.excessWorkingHours += detailWorking - countedWorking;
            }
        });
        result.countedWorkingHours = BigDecimal.valueOf(result.countedWorkingHours)
                .setScale(2, RoundingMode.HALF_UP).doubleValue();
        result.excessWorkingHours = BigDecimal.valueOf(result.excessWorkingHours)
                .setScale(2, RoundingMode.HALF_UP).doubleValue();
        return result;
    }

    private String scheduleKey(String periodCode, Long massagistId, Long shopId) {
        return periodCode + "|" + massagistId + "|" + shopId;
    }

    private static class ReceptionCapResult {
        private int countedMinutes;
        private int excessMinutes;
        private int capMinutes;
        private double countedWorkingHours;
        private double excessWorkingHours;
        private boolean capApplied;
    }

    public void serviceDurationExport(Long shopId, String startTime, String endTime, Long massagistId) {
        writeServiceDurationExport(serviceDuration(shopId, startTime, endTime, massagistId));
    }

    /** 对外导出与分页查询使用相同筛选；逐页加载，不将页面页码当作导出范围。 */
    @org.springframework.transaction.annotation.Transactional(readOnly = true)
    public void serviceDurationExport(Long shopId, String startTime, String endTime, Long massagistId, Integer status) {
        List<JSONObject> rows = new ArrayList<>();
        for (int page = 1; ; page++) {
            Map<String, Object> result = serviceDurationPage(shopId, startTime, endTime, massagistId, status, page, 100);
            rows.addAll((List<JSONObject>) result.get("list"));
            if ((long) page * 100 >= ((Number) result.get("total")).longValue()) break;
        }
        writeServiceDurationExport(rows);
    }

    private void writeServiceDurationExport(List<JSONObject> jsonObjectList) {
        if (ObjUtil.isEmpty(jsonObjectList)) {
            throw new BusinessException("根据查询条件查询不到数据，无需导出");
        }
        List<ServiceDurationDto> collect = jsonObjectList.stream().map(e -> {
            ServiceDurationDto serviceDurationDto = new ServiceDurationDto();
            serviceDurationDto.setShopId(e.getLong("shopId"));
            serviceDurationDto.setMassagistId(e.getLong("massagistId"));
            serviceDurationDto.setPeriodCode(e.getString("periodCode"));
            serviceDurationDto.setServiceCount(e.getInteger("serviceCount"));
            serviceDurationDto.setTotalWorkingHours(e.getString("totalWorkingHours") + "分钟");
            serviceDurationDto.setAdjustDuration(e.getString("adjustDuration") + "分钟");
            serviceDurationDto.setServiceDuration(e.getString("serviceDuration") + "分钟");
            serviceDurationDto.setServiceWorkingHours(e.getString("serviceWorkingHours") + "分钟");
            serviceDurationDto.setReceptionDuration(e.getString("receptionDuration") + "分钟");
            serviceDurationDto.setReceptionWorkingHours(e.getString("receptionWorkingHours") + "分钟");
            String dateRangeWorkTime = e.getString("dateRangeWorkTime");
            String workTime = dateRangeWorkTime + "小时";
            if (!StringUtils.hasText(dateRangeWorkTime)) {
                workTime = "0小时";
            }
            double currentDate = e.getDoubleValue("currentDateWorkTime");
            if (currentDate > 0) {
                workTime += "(当天在岗" + currentDate + "小时)";
            }
            serviceDurationDto.setWorkTime(workTime);
            return serviceDurationDto;
        }).collect(Collectors.toList());
        List<Long> massagistIds = collect.stream().map(ServiceDurationDto::getMassagistId).collect(Collectors.toList());
        List<Massagist> massagistList = massagistService.listByIds(massagistIds);
        Map<Long, String> massagistNameMap = massagistList.stream().collect(Collectors.toMap(Massagist::getId, Massagist::getName));
        List<Long> shopIds = collect.stream().map(ServiceDurationDto::getShopId).collect(Collectors.toList());
        List<Shop> shops = shopService.listByIds(shopIds);
        Map<Long, String> shopNameMap = shops.stream().collect(Collectors.toMap(Shop::getId, Shop::getName));
        collect.forEach(e -> {
            e.setShopName(shopNameMap.get(e.getShopId()));
            e.setMassagistName(massagistNameMap.get(e.getMassagistId()));
        });
        ExcelUtil.export(collect, ServiceDurationDto.class, "服务时长.xlsx");
    }

    public PageInfo<OperatingRevenueDto> operatingRevenue(OperatingRevenueDto operatingRevenueDto) {
        PageHelper.startPage(operatingRevenueDto.getPage(), operatingRevenueDto.getSize());
        List<OperatingRevenueDto> operatingRevenueDtoList = orderService.operatingRevenue(operatingRevenueDto);
        PageInfo<OperatingRevenueDto> pageInfo = new PageInfo<>(operatingRevenueDtoList);
        return pageInfo;
    }

    public JSONObject operatingRevenueTop(OperatingRevenueDto operatingRevenueDto) {
        return orderService.operatingRevenueTop(operatingRevenueDto);
    }

    /**
     * 经营日报导出：沿用经营流水的筛选条件，仅统计“收入”行，按入账日期逐日汇总（无收入日补 0），末行合计。
     */
    public void operatingRevenueDailyExport(OperatingRevenueDto dto) {
        LocalDate start = parseDay(dto.getStartPayTime());
        LocalDate end = parseDay(dto.getEndPayTime());
        if (start == null || end == null) throw new BusinessException("请选择导出的日期区间");
        if (end.isBefore(start)) throw new BusinessException("结束日期不能早于开始日期");
        if (java.time.temporal.ChronoUnit.DAYS.between(start, end) + 1 > DailyRevenueReport.MAX_DAYS) {
            throw new BusinessException("日报单次最多导出 " + DailyRevenueReport.MAX_DAYS + " 天");
        }
        dto.setType("收入");
        List<OperatingRevenueDto> rows = orderService.operatingRevenue(dto);
        ExcelUtil.export(DailyRevenueReport.build(rows, start, end), com.macro.mall.dto.DailyRevenueRow.class, "经营日报.xlsx");
    }

    private static LocalDate parseDay(String value) {
        if (!StringUtils.hasText(value) || value.trim().length() < 10) return null;
        try {
            return LocalDate.parse(value.trim().substring(0, 10));
        } catch (java.time.format.DateTimeParseException e) {
            throw new BusinessException("日期格式不正确");
        }
    }

    public void operatingRevenueExport(OperatingRevenueDto operatingRevenueDto) {
        List<OperatingRevenueDto> operatingRevenueDtoList = orderService.operatingRevenue(operatingRevenueDto);
        List<Long> shopIds = operatingRevenueDtoList.stream().filter(e -> !ObjUtil.isEmpty(e.getShopId())).map(OperatingRevenueDto::getShopId).collect(Collectors.toList());
        if (!CollectionUtils.isEmpty(shopIds)) {
            List<Shop> shops = shopService.listByIds(shopIds);
            Map<Long, String> shopNameMap = shops.stream().collect(Collectors.toMap(Shop::getId, Shop::getName));
            operatingRevenueDtoList.forEach(e -> {
                if (e.getShopId() != null) {
                    e.setShopName(shopNameMap.get(e.getShopId()));
                } else {
                    e.setShopName("-");
                }
            });
        }
        List<Long> orderIds = operatingRevenueDtoList.stream().filter(e -> !ObjUtil.isEmpty(e.getOrderId())).map(OperatingRevenueDto::getOrderId).collect(Collectors.toList());
        if (!CollectionUtils.isEmpty(orderIds)) {
            Map<Long, String> orderCodeMap = orderService.idToCodeMap(orderIds);
            operatingRevenueDtoList.forEach(e -> {
                if (e.getOrderId() != null) {
                    e.setOrderCode(orderCodeMap.get(e.getOrderId()));
                } else {
                    e.setOrderCode("-");
                }
            });
        }
        ExcelUtil.export(operatingRevenueDtoList, OperatingRevenueDto.class, "经营流水.xlsx");
    }

    public void operatingRevenueFuWuExport(Map<String, Object> params) {
        List<Long> shopIdList=new ArrayList<>();
        if (params.get("shopIdArrNew") != null) {
            int[] shopIdArrNew = (int[]) params.get("shopIdArrNew");
            shopIdList = Arrays.stream(shopIdArrNew).mapToObj(Long::valueOf).collect(Collectors.toList());
        }else{
            shopIdList= shopService.list().stream().map(Shop::getId).collect(Collectors.toList());
        }
        LocalDate monthNumber = LocalDate.parse(params.get("monthNumber").toString());


        //String startTime = monthNumber.with(TemporalAdjusters.firstDayOfMonth()).toString();
        String startTime=monthNumber.toString()+" 00:00:00";
        String endTime=monthNumber.withDayOfMonth(monthNumber.lengthOfMonth()).toString()+" 23:59:59";
        List<ServiceDurationDto> ServiceDurationDtoList = new ArrayList<>();
        for (int i = 0; i < shopIdList.size(); i++) {
            long shopId = shopIdList.get(i);
            String shopName=shopService.getById(shopId).getName();
            /*List<Massagist> massagistListNew = massagistService.listByShopId(shopId, null);
            for (Massagist massagist : massagistListNew) {*/
                List<JSONObject> jsonObjectList = serviceDuration(shopId, startTime, endTime, null);
                if (ObjUtil.isEmpty(jsonObjectList)) {
                    continue;
                }
                List<ServiceDurationDto> collect = jsonObjectList.stream().map(e -> {
                    ServiceDurationDto serviceDurationDto = new ServiceDurationDto();
                    serviceDurationDto.setShopId(e.getLong("shopId"));
                    serviceDurationDto.setMassagistId(e.getLong("massagistId"));
                    serviceDurationDto.setPeriodCode(e.getString("periodCode"));
                    serviceDurationDto.setServiceCount(e.getInteger("serviceCount"));
                    serviceDurationDto.setTotalWorkingHours(e.getString("totalWorkingHours") + "分钟");
                    serviceDurationDto.setAdjustDuration(e.getString("adjustDuration") + "分钟");
                    serviceDurationDto.setServiceDuration(e.getString("serviceDuration") + "分钟");
                    serviceDurationDto.setServiceWorkingHours(e.getString("serviceWorkingHours") + "分钟");
                    serviceDurationDto.setReceptionDuration(e.getString("receptionDuration") + "分钟");
                    serviceDurationDto.setReceptionWorkingHours(e.getString("receptionWorkingHours") + "分钟");
                    String dateRangeWorkTime = e.getString("dateRangeWorkTime");
                    String workTime = dateRangeWorkTime + "小时";
                    if (!StringUtils.hasText(dateRangeWorkTime)) {
                        workTime = "0小时";
                    }
                    double currentDate = e.getDoubleValue("currentDateWorkTime");
                    if (currentDate > 0) {
                        workTime += "(当天在岗" + currentDate + "小时)";
                    }
                    serviceDurationDto.setWorkTime(workTime);
                    return serviceDurationDto;
                }).collect(Collectors.toList());
                List<Long> massagistIds = collect.stream().map(ServiceDurationDto::getMassagistId).collect(Collectors.toList());
                List<Massagist> massagistList = massagistService.listByIds(massagistIds);
                Map<Long, String> massagistNameMap = massagistList.stream().collect(Collectors.toMap(Massagist::getId, Massagist::getName));
                List<Long> shopIds = collect.stream().map(ServiceDurationDto::getShopId).collect(Collectors.toList());
                List<Shop> shops = shopService.listByIds(shopIds);
                Map<Long, String> shopNameMap = shops.stream().collect(Collectors.toMap(Shop::getId, Shop::getName));
                collect.forEach(e -> {
                    e.setShopName(shopName);
                    e.setMassagistName(massagistNameMap.get(e.getMassagistId()));
                });
                for (ServiceDurationDto collect1 : collect) {
                    ServiceDurationDtoList.add(collect1);
                }
               // ServiceDurationDtoList.add(collect.get(0));
            //}
        }
        ExcelUtil.export(ServiceDurationDtoList, ServiceDurationDto.class, "疗愈师服务时长.xlsx");
    }

}
