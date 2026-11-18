package com.macro.mall.service;

import cn.hutool.core.util.ObjUtil;
import com.alibaba.fastjson.JSON;
import com.alibaba.fastjson2.JSONObject;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.UpdateWrapper;
import com.macro.mall.common.exception.BusinessException;
import com.macro.mall.dto.OrderDetailDto;
import com.macro.mall.dto.SchedulingParam;
import com.macro.mall.entity.*;
import com.macro.mall.enums.*;
import com.macro.mall.mapper.OrderDetailMapper;
import com.macro.mall.service.base.BaseService;
import com.macro.mall.service.base.WrapperBuilder;
import com.macro.mall.service.job.MassagistScheduled;
import com.macro.mall.service.shop.BedService;
import com.macro.mall.service.shop.ShopService;
import com.macro.mall.utils.DateUtil;
import com.macro.mall.utils.BookingAvailability;
import com.macro.mall.utils.EarlyBirdPrice;
import com.macro.mall.utils.RedisUtil;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.CollectionUtils;
import org.springframework.util.ObjectUtils;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * 订单详情 服务类
 *
 * @author ST
 * @date 2025/05/30
 */
@Service
@Slf4j
public class OrderDetailService extends BaseService<OrderDetailMapper, OrderDetail> {
    @Autowired
    ProductService productService;
    @Autowired
    ProjectService projectService;
    @Autowired
    BedService bedService;
    @Autowired
    MassagistService massagistService;
    @Autowired
    CustomerService customerService;
    @Autowired
    @Lazy
    MassagistSchedulesService massagistSchedulesService;
    @Autowired
    @Lazy
    ShopService shopService;
    @Autowired
    @Lazy
    OrderService orderService;
    @Autowired
    RedisUtil redisUtil;
    @Autowired
    RoundScheduleService roundScheduleService;
    @Autowired
    private MassagistScheduled massagistScheduled;
    @Autowired
    CustomerMassagistBlockService customerMassagistBlockService;

    /** 床位周转间隔统一由 {@link com.macro.mall.utils.BookingAvailability#BED_TURNOVER_MINUTES} 提供。 */
    private static final int BED_TURNOVER_MINUTES = BookingAvailability.BED_TURNOVER_MINUTES;

    @Override
    protected QueryWrapper<OrderDetail> buildWrapper(Map<String, Object> params, QueryWrapper<OrderDetail> queryWrapper) {
        return WrapperBuilder.init(queryWrapper, params)
                .equal("appointment_id")
                .equal("user_id")
                .equal("start_time")
                .equal("end_time")
                .in("state")
                .getQueryWrapper();
    }

    /**
     * 构建订单详情
     *
     * @param orderDetailDto
     * @param isManage
     * @param isCreate       是否为新建订单
     */
    @Transactional(rollbackFor = Exception.class)
    /**
     * 已到店/已服务的明细行已经进了不可回退的阶段：改单时既不能删、也不能重建，
     * 否则技师、到店状态、完成时间和点数归属都会被覆盖。
     */
    public static boolean isServedDetail(OrderDetail detail) {
        if (detail == null) {
            return false;
        }
        Integer state = detail.getState();
        return AppointmentState.DOING.getValue().equals(state)
                || AppointmentState.FINISHED.getValue().equals(state)
                || detail.getFinishTime() != null;
    }

    /** 按项目统计已到店/已服务的行数，用于扣减改单时还需要重建的人数。 */
    private Map<Long, Integer> countServedByProject(List<OrderDetail> servedDetails) {
        if (CollectionUtils.isEmpty(servedDetails)) {
            return Collections.emptyMap();
        }
        return servedDetails.stream()
                .filter(d -> d.getProjectId() != null)
                .collect(Collectors.groupingBy(OrderDetail::getProjectId, Collectors.summingInt(d -> 1)));
    }

    /** 单项目还需要重建的人数 = 下单人数 - 该项目已到店/已服务的人数。 */
    private int effectivePersonCount(Integer personCount, Map<Long, Integer> servedByProject, Long projectId) {
        int total = personCount == null ? 0 : personCount;
        return Math.max(0, total - servedByProject.getOrDefault(projectId, 0));
    }

    public void createDetail(OrderDetailDto orderDetailDto, boolean isManage, boolean isCreate) {
        Long shopId = orderDetailDto.getShopId();
        String key = "lockKey" + shopId;
        synchronized (key.intern()) {
            Long productId = orderDetailDto.getProductId();
            List<JSONObject> jsonList = productService.getProductContent(productId);
            List<Long> projectIdList = jsonList.stream().map(s -> s.getLong("projectId")).collect(Collectors.toList());
            if (CollectionUtils.isEmpty(projectIdList)) {
                return;
            }
            projectIdList = projectIdList.stream().distinct().collect(Collectors.toList());
            List<OrderDetail> detailList = new ArrayList<>();
            Long massagistId = orderDetailDto.getMassagistId();
            if (massagistId != null) {
                List<Long> massagistIdList = orderDetailDto.getMassagistIdList();
                if (CollectionUtils.isEmpty(massagistIdList)) {
                    massagistIdList = new ArrayList<>();
                }
                massagistIdList.add(massagistId);
                orderDetailDto.setMassagistIdList(massagistIdList);
            }
            List<OrderDetail> oldOrderDetailList = orderDetailDto.getOldOrderDetails();
            if (!CollectionUtils.isEmpty(oldOrderDetailList)) {
                //已到店/已服务的行不参与重建，避免被换技师或回退成待服务
                List<OrderDetail> editableOldList = oldOrderDetailList.stream()
                        .filter(d -> !isServedDetail(d))
                        .collect(Collectors.toList());
                oldOrderDetailList = editableOldList.isEmpty() ? null : editableOldList;
                orderDetailDto.setOldOrderDetails(oldOrderDetailList);
            }
            if (!CollectionUtils.isEmpty(oldOrderDetailList)) {
                OrderDetail orderDetail = oldOrderDetailList.get(0);
                if (DateUtil.toYYYYMMDD(orderDetail.getStartTime()).compareTo(DateUtil.toYYYYMMDD(orderDetailDto.getStartTime())) != 0) {
                    recoverSortId(oldOrderDetailList, RoundScheduleState.UPDATE_DATE);
                    orderDetailDto.setOldOrderDetails(null);
                } else {
                    List<Long> massagistIdList = orderDetailDto.getMassagistIdList();
                    if (!CollectionUtils.isEmpty(massagistIdList)) {
                        if (massagistIdList.contains(orderDetail.getMassagistId())) {
                            recoverSortId(oldOrderDetailList, RoundScheduleState.EXCHANGE);
                        } else {
                            recoverSortId(oldOrderDetailList, RoundScheduleState.UPDATE);
                        }
                    } else {
                        recoverSortId(oldOrderDetailList, RoundScheduleState.UPDATE);
                    }
                }
            }
            LocalDateTime startTime = orderDetailDto.getStartTime();
            Map<Long, Integer> servedByProject = countServedByProject(orderDetailDto.getServedOrderDetails());
            for (Long projectId : projectIdList) {
                int personCount = effectivePersonCount(orderDetailDto.getPersonCount(), servedByProject, projectId);
                if (personCount <= 0) {
                    //该项目的人已经全部到店/服务完毕，保留原明细行即可
                    continue;
                }
                if (isManage) {
                    detailList.addAll(pcNoCheckAndBuildOrderList(orderDetailDto.getShopId(), projectId, startTime,
                            orderDetailDto.getDurationMinutes(),
                            personCount,
                            orderDetailDto.getMassagistIdList(),
                            orderDetailDto.getBedIdList(),
                            orderDetailDto.getOldOrderDetails(),
                            isCreate, orderDetailDto.getAddType(), orderDetailDto.getCustomerId()
                    ));
                } else {
                    detailList.addAll(checkAndBuildOrderList(orderDetailDto.getShopId(), projectId, startTime,
                            orderDetailDto.getDurationMinutes(),
                            personCount,
                            orderDetailDto.getMassagistIdList(),
                            orderDetailDto.getBedIdList(),
                            orderDetailDto.getOldOrderDetails(),
                            isCreate, orderDetailDto.getCustomerId(), orderDetailDto.getAddType()
                    ));
                }
            }
            Long fromOrderId = orderDetailDto.getFromOrderId();
            boolean isAddService = orderDetailDto.getAddType() != null && orderDetailDto.getAddType() == 1;
            detailList.forEach(s -> {
                s.setOrderId(orderDetailDto.getOrderId());
                s.setCustomerId(orderDetailDto.getCustomerId());
                //加钟单记下原订单，后续自动分配疗愈师时据此优先原单疗愈师
                if (fromOrderId != null && fromOrderId > 0) {
                    s.setFromOrderId(fromOrderId);
                }
                if (isCreate) {
                    s.setIsUpdateSort(orderDetailDto.getIsUpdateSort());
                }
                //加钟是原单的延续，不占新一轮轮牌（视同指定疗愈师）
                if (isAddService) {
                    s.setIsUpdateSort(false);
                }
            });
            if (CollectionUtils.isEmpty(detailList)) {
                return;
            }
            saveBatch(detailList);
            extendShifts(detailList);
            //updateMassagistSort(detailList, DateUtil.toYYYYMMDD(startTime), shopId);
            if (orderDetailDto.getIsUpdateSort() && !CollectionUtils.isEmpty(orderDetailDto.getMassagistIdList())) {
                updateMassagistSort(detailList, DateUtil.toYYYYMMDD(startTime), shopId);//更新技师排序
            }
        }
    }

    /**
     * 占用明细：按服务时段查交集（两侧各留整理期缓冲），替代「按 DATE(start_time) 查当天」。
     * 当天口径会漏掉跨零点前一单在凌晨那段（23:30→00:30 的 00:00-00:30 不在次日列表里），
     * 于是同一疗愈师/床位在 00:00 之后还能被重复预约。
     */
    public List<OrderDetail> findOccupiedDetails(Long shopId, LocalDateTime startTime, Integer durationMinutes) {
        if (shopId == null || startTime == null || durationMinutes == null) {
            return Collections.emptyList();
        }
        return findOccupiedDetails(shopId, startTime, DateUtil.addTimeByMinutes(startTime, durationMinutes));
    }

    public List<OrderDetail> findOccupiedDetails(Long shopId, LocalDateTime startTime, LocalDateTime endTime) {
        if (shopId == null || startTime == null || endTime == null) {
            return Collections.emptyList();
        }
        int buffer = BookingAvailability.BED_TURNOVER_MINUTES;
        return BookingAvailability.withoutFinishedFuture(getBaseMapper().findOverlapListByShopAndTime(
                shopId, startTime.minusMinutes(buffer), endTime.plusMinutes(buffer)));
    }

    /**
     * 再次检查是否可以下订单预约（可约的话返回订单明细并填充床位和疗愈师）
     * 不可预约时抛异常
     *
     * @param shopId          门店id
     * @param projectId       项目id
     * @param startTime       到店时间
     * @param durationMinutes 理疗时长
     * @param personCount     人数
     * @param oldOrderDetails
     * @return 填充了预约信息的订单详情列表
     */
    @Transactional(rollbackFor = Exception.class)
    public List<OrderDetail> checkAndBuildOrderList(Long shopId, Long projectId, LocalDateTime startTime, Integer durationMinutes, Integer personCount, List<Long> massgistIdList, List<Long> bedIdList, List<OrderDetail> oldOrderDetails, boolean isCreate, Long customerId, Integer addType) {
        boolean isSelectJiShi=!CollectionUtils.isEmpty(massgistIdList);//用于判断是否选了技师
        //加钟是原单的延续，不占新一轮轮牌：全程不碰轮次排序，没指定疗愈师就留空待分配
        boolean isAddService = Objects.equals(addType, 1);
        if (shopId == null) {
            shopId = 1L;
        }
        Shop shop = shopService.findAvailableById(shopId);
        if (shop == null) {
            throw new BusinessException("抱歉，门店不可用");
        }
        Integer bedType = projectService.findTypeById(projectId);
        if (bedType == null) {
            throw new BusinessException("项目类型有误");
        }
        List<Bed> allBedList = bedService.listByStatusAndTypeAndShopId(NormalState.EFFECTIVE.getValue(), bedType, shopId);
        if (CollectionUtils.isEmpty(allBedList)) {
            log.error("查询到店时间失败，所有床位状态不可用");
            throw new BusinessException("抱歉，没有找到可用的床位");
        } else if (personCount > allBedList.size()) {
            throw new BusinessException("抱歉，床位不满足人数要求");
        }
        String date = DateUtil.toYYYYMMDD(startTime);
        /*List<MassagistSchedules> allMassagistList = massagistSchedulesService.simpleListByDateAndShopId(date, shopId);*/
        List<MassagistSchedules> allMassagistList = massagistSchedulesService.getBaseMapper().findListByProjectIdAndShopId(shopId,"%"+projectId+"%",date);
        if (CollectionUtils.isEmpty(allMassagistList)) {
            if (!isAddService) {
                log.error("查询到店时间失败，没有疗愈师排班数据，date={}", date);
                throw new BusinessException("抱歉，没有疗愈师排班数据");
            }
            allMassagistList = new ArrayList<>();
        } else if (!isAddService && personCount > allMassagistList.size()) {
            throw new BusinessException("抱歉，疗愈师不满足人数要求");
        }
        //加钟可以超过下班时间：与前台加钟口径一致，下班时间顺延119分钟，否则原单疗愈师过了下班点就选不上
        if (isAddService) {
            allMassagistList.forEach(m -> {
                if (m.getEndTime() != null) {
                    m.setEndTime(m.getEndTime().plusMinutes(119));
                }
            });
        }
        List<OrderDetail> detailList = findOccupiedDetails(shopId, startTime, durationMinutes);
        Map<Long, List<OrderDetail>> bedDetailMap = new HashMap<>(detailList.size());
        Map<Long, List<OrderDetail>> massagistDetailMap = new HashMap<>(detailList.size());
        detailList.forEach(d -> {
            //luxin修改了  增加固定值1标识湿区项目
            if (d.getProjectId()==1) {
                List<OrderDetail> bedDetailList = bedDetailMap.get(d.getBedId());
                if (bedDetailList == null) {
                    bedDetailList = new ArrayList<>();
                }
                bedDetailList.add(d);
                bedDetailMap.put(d.getBedId(), bedDetailList);
            }
            //luxin新增，当项目为全感项目时，把采耳项目加进来，并且采耳项目id为4
            if (d.getProjectId()==2||d.getProjectId()==4) {
                List<OrderDetail> bedDetailList = bedDetailMap.get(d.getBedId());
                if (bedDetailList == null) {
                    bedDetailList = new ArrayList<>();
                }
                bedDetailList.add(d);
                bedDetailMap.put(d.getBedId(), bedDetailList);
            }
            List<OrderDetail> massagistDetailList = massagistDetailMap.get(d.getMassagistId());
            if (massagistDetailList == null) {
                massagistDetailList = new ArrayList<>();
            }
            massagistDetailList.add(d);
            massagistDetailMap.put(d.getMassagistId(), massagistDetailList);
        });
        LocalDateTime endTime = DateUtil.addTimeByMinutes(startTime, durationMinutes);
        List<Bed> availableBedList = new ArrayList<>();
        allBedList.forEach(bed -> {
            List<OrderDetail> bedDetailList = bedDetailMap.get(bed.getId());
            boolean isAvailable;
            if (CollectionUtils.isEmpty(bedDetailList)) {
                isAvailable = true;
            } else {
                isAvailable = bedDetailList.stream().noneMatch(d ->
                        BookingAvailability.bedOccupied(startTime, endTime, d, customerId));
            }
            if (isAvailable) {
                availableBedList.add(bed);
            }
        });
        if (CollectionUtils.isEmpty(availableBedList)) {
            throw new BusinessException("抱歉，没有可用的床位");
        } else if (personCount > availableBedList.size()) {
            throw new BusinessException("抱歉，床位不满足人数要求");
        }

        //luxin当选择的床位被占用了，系统自动选择合适的床位,去除已占用的床位
        List<Long> bedIdListTep = new ArrayList<>();
        bedIdList.stream().forEach(t->{
            if(availableBedList.stream().map(Bed::getId).collect(Collectors.toList()).contains(t)){
                bedIdListTep.add(t);
            }
        });
        bedIdList = bedIdListTep;

        List<Bed> sortedBedList = availableBedList.stream().sorted(Comparator.comparing(Bed::getSerialNumber)).collect(Collectors.toList());
        List<Long> sortedBedIdList = sortedBedList.stream().map(Bed::getId).collect(Collectors.toList());
        if (!CollectionUtils.isEmpty(bedIdList)) {
            if (bedIdList.size() < personCount) {
                int remainingCount = personCount - bedIdList.size();
                for (int i = 0; i < remainingCount; i++) {
                    if (sortedBedIdList.size() < remainingCount) {
                        continue;
                    }
                    Long bedId = sortedBedIdList.get(i);
                    if (bedId != null && !bedIdList.contains(bedId)) {
                        bedIdList.add(bedId);
                    }
                }
            }
        } else {
            if (personCount <= sortedBedIdList.size()) {
                bedIdList = sortedBedIdList;
            } else {
                for (Long bedId : sortedBedIdList) {
                    if (bedId != null && !bedIdList.contains(bedId)) {
                        bedIdList.add(bedId);
                    }
                }
            }
        }

        List<MassagistSchedules> allPeople = massagistSchedulesService.getBaseMapper()
                .findListByProjectIdAndShopId(shopId, "%%", date);
        if (!isAddService && (personCount > BookingAvailability.freeCount(startTime, endTime, allPeople, detailList, null)
                || personCount > BookingAvailability.freeCount(startTime, endTime, allMassagistList, detailList, projectId))) {
            throw new BusinessException("抱歉，疗愈师不满足人数要求!");
        }
        if (!CollectionUtils.isEmpty(massgistIdList)) {
            Set<Long> ids = BookingAvailability.scheduledIds(startTime, allMassagistList);
            for (Long specifiedId : massgistIdList) {
                if (!ids.contains(specifiedId)) {
                    throw new BusinessException(specifiedTherapistMessage(specifiedId, date, shopId,
                            "所选疗愈师在当前门店没有该时段排班，请核对预约门店"));
                }
                List<OrderDetail> booked = massagistDetailMap.getOrDefault(specifiedId, Collections.emptyList());
                if (booked.stream().anyMatch(d -> BookingAvailability.overlaps(startTime, endTime, d.getStartTime(), d.getEndTime(), 0))) {
                    throw new BusinessException("所选疗愈师在该时段已有预约，请选择其他时段");
                }
            }
        }

        List<MassagistSchedules> availableMassagistList = new ArrayList<>();
        allMassagistList.forEach(m -> {
            // 已约疗愈师
            List<OrderDetail> massagistDetailList = massagistDetailMap.get(m.getMassagistId());
            boolean isAvailable;
            if (!BookingAvailability.scheduledIds(startTime, Collections.singletonList(m)).contains(m.getMassagistId())) {
                log.info("技师id={},{}", m.getMassagistId(), "不在排班时间");
                isAvailable = false;
            } else if (CollectionUtils.isEmpty(massagistDetailList)) {
                isAvailable = true;
            } else {
                isAvailable = massagistDetailList.stream().allMatch(d -> {
                    return !BookingAvailability.overlaps(startTime, endTime, d.getStartTime(), d.getEndTime(), 0);
                });
                if (!isAvailable) {
                    log.info("技师id={},{}", massagistService.findNameById(m.getMassagistId()), "时间冲突");
                }
            }
            if (isAvailable) {
                availableMassagistList.add(m);
            }
        });
        //luxin增加下单人数是否大于空闲技师人数，大于抛出异常；加钟只校验指定技师是否可用，不校验空闲总人数
        if(!isAddService && availableMassagistList.size() < personCount){
            throw new BusinessException("抱歉，疗愈师不满足人数要求!");
        }
        /*if (CollectionUtils.isEmpty(availableMassagistList)) {
            throw new BusinessException("抱歉，没有可用的疗愈师");
        } else if (personCount > availableMassagistList.size()) {
            throw new BusinessException("抱歉，疗愈师不满足人数要求");
        }*/

        //luxin当选择的技师被占用了，系统自动选择合适的技师去除已占用的技师
        List<Long> massagistIdTemp = new ArrayList<>();
        massgistIdList.stream().forEach(t->{
            if(availableMassagistList.stream().map(MassagistSchedules::getMassagistId).collect(Collectors.toList()).contains(t)){
                massagistIdTemp.add(t);
            }
        });
        massgistIdList = massagistIdTemp;


        List<Long> availableMassagistIdList = availableMassagistList.stream().map(MassagistSchedules::getMassagistId).collect(Collectors.toList());
        //自动派单跳过客户已设为暂别的疗愈师；员工明确指定的技师不受影响
        availableMassagistIdList = customerMassagistBlockService.excludeBlocked(customerId, availableMassagistIdList);
        // 空闲疗愈师排序：加钟不碰轮牌（不读轮次、不写跳过原因），所以不做轮次排序
        List<Long> sortedMassagistIdList = isAddService
                ? new ArrayList<>()
                : sortMassagist(availableMassagistIdList, startTime, endTime, shopId, personCount);
        List<Long> specifyMassagistIdList = new ArrayList<>();
        if (!CollectionUtils.isEmpty(massgistIdList)) {
            if (CollectionUtils.isEmpty(oldOrderDetails)) {//没有老详情，代表是创建，创建时记录指定技师
                specifyMassagistIdList.addAll(massgistIdList);
            }
            // 如果还不足够人数，从availableMassagistList补充
            if (massgistIdList.size() < personCount) {
                int remainingCount = personCount - massgistIdList.size();
                for (int i = 0; i < remainingCount; i++) {
                    if (sortedMassagistIdList.size() < remainingCount) {
                        continue;
                    }
                    Long massagistId = sortedMassagistIdList.get(i);
                    if (massagistId != null && !massgistIdList.contains(massagistId)) {
                        massgistIdList.add(massagistId);
                    }
                }
            }
        } else {
            if (personCount <= sortedMassagistIdList.size()) {
                massgistIdList = sortedMassagistIdList;
            } else {
                for (Long massgistId : sortedMassagistIdList) {
                    if (massgistId != null && !massgistIdList.contains(massgistId)) {
                        massgistIdList.add(massgistId);
                    }
                }
            }
        }
        // 如果还不足够人数，从全部中补充
        int bedRemainingCount = personCount - bedIdList.size();
        if (bedRemainingCount > 0) {
            List<Long> allBedIdList = allBedList.stream().map(Bed::getId).sorted((bedId1, bedId2) -> {
                List<OrderDetail> orderDetailList1 = bedDetailMap.get(bedId1);
                List<OrderDetail> orderDetailList2 = bedDetailMap.get(bedId2);
                int size1 = orderDetailList1 != null ? orderDetailList1.size() : 0;
                int size2 = orderDetailList2 != null ? orderDetailList2.size() : 0;
                return Integer.compare(size1, size2);
            }).collect(Collectors.toList());
            for (Long bedId : allBedIdList) {
                if (bedId != null && !bedIdList.contains(bedId)) {
                    bedIdList.add(bedId);
                }
            }
        }
        int massagistRemainingCount = personCount - massgistIdList.size();
        //加钟不从轮牌里补人：没指定疗愈师的行留空待分配
        if (massagistRemainingCount > 0 && !isAddService) {
            List<Long> allMassagistIdList = allMassagistList.stream().map(MassagistSchedules::getMassagistId).collect(Collectors.toList());
            allMassagistIdList = customerMassagistBlockService.excludeBlocked(customerId, allMassagistIdList);
            allMassagistIdList = sortMassagist(allMassagistIdList, startTime, endTime, shopId, personCount);
            for (Long massgistId : allMassagistIdList) {
                if (massgistId != null && !massgistIdList.contains(massgistId)) {
                    massgistIdList.add(massgistId);
                }
            }
        }

        List<OrderDetail> orderDetailList = new ArrayList<>(personCount);
        Map<Long, OrderDetail> orderDetailMap = new HashMap<>();
        Map<Long, OrderDetail> specifyTypeMap = new HashMap<>();
        if (!CollectionUtils.isEmpty(oldOrderDetails)) {
            List<Long> finalMassagistIdList = massgistIdList;
            specifyTypeMap = oldOrderDetails.stream().filter(e -> finalMassagistIdList.contains(e.getMassagistId()))
                    .collect(Collectors.toMap(OrderDetail::getMassagistId, Function.identity()));
            orderDetailMap = oldOrderDetails.stream().filter(e -> !finalMassagistIdList.contains(e.getMassagistId()))
                    .collect(Collectors.toMap(OrderDetail::getId, Function.identity()));
            Set<Long> specifyTypeMassagistIds = specifyTypeMap.keySet();
            if (!CollectionUtils.isEmpty(specifyTypeMassagistIds)) {
                //将指定的技师排到最前边
                massgistIdList.sort(Comparator.comparingLong(item -> specifyTypeMassagistIds.contains(item) ? 0 : 1));
            }
        } else {
            //将指定的技师排到最前边
            massgistIdList.sort(Comparator.comparingLong(item -> specifyMassagistIdList.contains(item) ? 0 : 1));
        }
        Set<Long> idSet = orderDetailMap.keySet();
        Iterator<Long> iterator = idSet.iterator();
        for (int i = 0; i < personCount; i++) {
            //加钟单没指定疗愈师的行留空：人数比已排的疗愈师多时不再取人，直接待分配
            Long massagistId = i < massgistIdList.size() ? massgistIdList.get(i) : null;
            OrderDetail detail = new OrderDetail();
            detail.setShopId(shopId);
            detail.setProjectId(projectId);
            Integer specifyType = !CollectionUtils.isEmpty(specifyMassagistIdList) && specifyMassagistIdList.contains(massagistId) ? SpecifyType.MINI.getValue() : null;
            detail.setSpecifyType(specifyType);
            OrderDetail orderDetail = specifyTypeMap.getOrDefault(massagistId, null);
            //指定类型不被修改
            if (isSelectJiShi&&Objects.isNull(orderDetail)) {
                detail.setSpecifyType(SpecifyType.MINI.getValue());
            }
            if (orderDetail != null) {
                detail.setId(orderDetail.getId());
                detail.setState(orderDetail.getState());
                detail.setSpecifyType(orderDetail.getSpecifyType());
                detail.setComment(orderDetail.getComment());
                detail.setIsUpdateSort(orderDetail.getIsUpdateSort());
                detail.setProjectId(orderDetail.getProjectId());
            } else if (iterator.hasNext()) {
                Long id = iterator.next();
                orderDetail = orderDetailMap.get(id);
                detail.setId(id);
                detail.setState(orderDetail.getState());
                detail.setComment(orderDetail.getComment());
                detail.setIsUpdateSort(orderDetail.getIsUpdateSort());
                detail.setProjectId(orderDetail.getProjectId());
            }
            detail.setProjectId(projectId);
            detail.setBedId(bedIdList.get(i));

            //增加判断，如果没有指定就不安排技师
            if (isSelectJiShi) {
                detail.setMassagistId(massagistId);
            }


            detail.setDuration(durationMinutes);
            detail.setStartTime(startTime);
            detail.setEndTime(DateUtil.addTimeByMinutes(startTime, durationMinutes));
            orderDetailList.add(detail);
        }
        return orderDetailList;
    }

    @Transactional(rollbackFor = Exception.class)
    public List<OrderDetail> pcNoCheckAndBuildOrderList(Long shopId, Long projectId, LocalDateTime startTime, Integer durationMinutes, Integer personCount, List<Long> massgistIdList, List<Long> bedIdList, List<OrderDetail> oldOrderDetails, boolean isCreate, Integer addType, Long customerId) {
        //获取startTime年月日
        int lxCk=0;
        String dateStartlx = DateUtil.toYYYYMMDD(startTime);
        String dateEndlx= DateUtil.toYYYYMMDD(DateUtil.addTimeByMinutes(startTime, durationMinutes));
        if(!dateStartlx.equals(dateEndlx)){//判断是否跨天
            lxCk=1;
        }
            boolean isSelectJiShi = !CollectionUtils.isEmpty(massgistIdList);//用于判断是否选了技师
            //加钟是原单的延续，不占新一轮轮牌：全程不碰轮次排序，没指定疗愈师就留空待分配
            boolean isAddService = Objects.equals(addType, 1);
            if (shopId == null) {
                shopId = 1L;
            }
            Shop shop = shopService.findAvailableById(shopId);
            if (shop == null) {
                throw new BusinessException("抱歉，门店不可用");
            }
            Integer bedType = projectService.findTypeById(projectId);
            if (bedType == null) {
                throw new BusinessException("项目类型有误");
            }
            List<Bed> allBedList = bedService.listByStatusAndTypeAndShopId(NormalState.EFFECTIVE.getValue(), bedType, shopId);
            if (CollectionUtils.isEmpty(allBedList)) {
                log.error("查询到店时间失败，所有床位状态不可用");
                throw new BusinessException("抱歉，没有找到可用的床位");
            } else if (personCount > allBedList.size()) {
                throw new BusinessException("抱歉，床位不满足人数要求");
            }
            String date = DateUtil.toYYYYMMDD(startTime);
            //luxin新增此处已放弃使用，新增下边方法
            // List<MassagistSchedules> allMassagistList = massagistSchedulesService.simpleListByDateAndShopId(date, shopId);
            //luxin新增方法，验证技师所会技能
            List<MassagistSchedules> allMassagistList = massagistSchedulesService.getBaseMapper().findListByProjectIdAndShopId(shopId, "%" + projectId + "%", date);

            if (CollectionUtils.isEmpty(allMassagistList)) {
                if (!isAddService) {
                    log.error("查询到店时间失败，没有疗愈师排班数据，date={}", date);
                    throw new BusinessException("抱歉，没有疗愈师排班数据");
                }
                allMassagistList = new ArrayList<>();
            } else if (!isAddService && personCount > allMassagistList.size()) {
                throw new BusinessException("抱歉，疗愈师不满足人数要求");
            }
            List<OrderDetail> detailList = findOccupiedDetails(shopId, startTime, durationMinutes);
            Map<Long, List<OrderDetail>> bedDetailMap = new HashMap<>(detailList.size());
            Map<Long, List<OrderDetail>> massagistDetailMap = new HashMap<>(detailList.size());
            detailList.forEach(d -> {
                //luxin修改了  增加固定值1标识湿区项目
                if (d.getProjectId() == 1) {
                    List<OrderDetail> bedDetailList = bedDetailMap.get(d.getBedId());
                    if (bedDetailList == null) {
                        bedDetailList = new ArrayList<>();
                    }
                    bedDetailList.add(d);
                    bedDetailMap.put(d.getBedId(), bedDetailList);
                }
                //luxin新增，当项目为全感项目时，把采耳项目加进来，并且采耳项目id为4
                if (d.getProjectId() == 2 || d.getProjectId() == 4) {
                    List<OrderDetail> bedDetailList = bedDetailMap.get(d.getBedId());
                    if (bedDetailList == null) {
                        bedDetailList = new ArrayList<>();
                    }
                    bedDetailList.add(d);
                    bedDetailMap.put(d.getBedId(), bedDetailList);
                }
                List<OrderDetail> massagistDetailList = massagistDetailMap.get(d.getMassagistId());
                if (massagistDetailList == null) {
                    massagistDetailList = new ArrayList<>();
                }
                massagistDetailList.add(d);
                massagistDetailMap.put(d.getMassagistId(), massagistDetailList);
            });
            LocalDateTime endTime = DateUtil.addTimeByMinutes(startTime, durationMinutes);
            List<Bed> availableBedList = new ArrayList<>();
            allBedList.forEach(bed -> {
                List<OrderDetail> bedDetailList = bedDetailMap.get(bed.getId());
                boolean isAvailable;
                if (CollectionUtils.isEmpty(bedDetailList)) {
                    isAvailable = true;
                } else {
                    isAvailable = bedDetailList.stream().noneMatch(d ->
                            BookingAvailability.bedOccupied(startTime, endTime, d, customerId));
                }
                if (isAvailable) {
                    availableBedList.add(bed);
                }
            });

            //增加空闲床位大于下单人数判断，小于是抛出异常
            if (availableBedList.size() < personCount) {
                throw new BusinessException("抱歉，床位不满足人数要求");
            }

            //luxin当选择的床位被占用了，系统自动选择合适的床位,去除已占用的床位
            List<Long> bedIdListTep = new ArrayList<>();
            bedIdList.stream().forEach(t -> {
                if (availableBedList.stream().map(Bed::getId).collect(Collectors.toList()).contains(t)) {
                    bedIdListTep.add(t);
                }
            });
            bedIdList = bedIdListTep;


            List<Bed> sortedBedList = availableBedList.stream().sorted(Comparator.comparing(Bed::getSerialNumber)).collect(Collectors.toList());
            List<Long> sortedBedIdList = sortedBedList.stream().map(Bed::getId).collect(Collectors.toList());
            if (!CollectionUtils.isEmpty(bedIdList)) {
                if (bedIdList.size() < personCount) {
                    int remainingCount = personCount - bedIdList.size();
                    for (int i = 0; i < remainingCount; i++) {
                        if (sortedBedIdList.size() < remainingCount) {
                            continue;
                        }
                        Long bedId = sortedBedIdList.get(i);
                        if (bedId != null && !bedIdList.contains(bedId)) {
                            bedIdList.add(bedId);
                        }
                    }
                }
            } else {
                if (personCount <= sortedBedIdList.size()) {
                    bedIdList = sortedBedIdList;
                } else {
                    for (Long bedId : sortedBedIdList) {
                        if (bedId != null && !bedIdList.contains(bedId)) {
                            bedIdList.add(bedId);
                        }
                    }
                }
            }


            //不提前分配技师，需要验证此时此刻此项目订单量和技师数量是否匹配
            //同一时刻的所有订单量不能大于技师上班人数
            //detailList   allMassagistList
            int count = 0;
            //需要增加判断开始下单时间以后的每个15分钟内的订单量
            List<MassagistSchedules> allPeople = massagistSchedulesService.getBaseMapper().findListByProjectIdAndShopId(shopId, "%%", date);
            List<MassagistSchedules> projectAllPeople = massagistSchedulesService.getBaseMapper().findListByProjectIdAndShopId(shopId, "%" + projectId + "%", date);
            //去掉不在此工作时间的技师
            List<MassagistSchedules> allPeopleCountNew = new ArrayList<>();
        /*allPeople.forEach(m->{if((m.getStartTime().isBefore(startTime.toLocalTime())||m.getStartTime().equals(startTime.toLocalTime()) )&& (m.getEndTime().isAfter(endTime.toLocalTime())||m.getEndTime().equals(endTime.toLocalTime()))){
            allPeopleCountNew.add(m);
        }});*/
            allPeople.forEach(m -> {
                //如果是加钟，给疗愈师下班时间增加119分钟（只参与判断，不改排班对象，避免后面再叠加一次）
                LocalDateTime closeAt = BookingAvailability.shiftEnd(m, startTime);
                if (closeAt == null) return;
                if (Objects.equals(addType, 1)) {
                    closeAt = DateUtil.addTimeByMinutes(closeAt, 119);
                }
                // 判断预约开始时间是否不早于疗愈师上班时间 (>=)
                boolean isAfterStart = m.getStartTime() != null && !startTime.toLocalTime().isBefore(m.getStartTime());
                // 判断预约开始时间是否不晚于疗愈师下班时间 (<=)，普通下单必须早于下班时间
                boolean isBeforeEnd = Objects.equals(addType, 1) ? !startTime.isAfter(closeAt) : startTime.isBefore(closeAt);
                if (isAfterStart && isBeforeEnd) {
                    // 显示疗愈师
                    allPeopleCountNew.add(m);
                }
            });
            allPeople = allPeopleCountNew;
            //去掉不在此工作时间的技师
            List<MassagistSchedules> projectAllPeopleCountNew = new ArrayList<>();
        /*projectAllPeople.forEach(m->{if((m.getStartTime().isBefore(startTime.toLocalTime())||m.getStartTime().equals(startTime.toLocalTime()) ) && (m.getEndTime().isAfter(endTime.toLocalTime())||m.getEndTime().equals(endTime.toLocalTime()))){
            projectAllPeopleCountNew.add(m);
        }});*/
            projectAllPeople.forEach(m -> {
                //如果是加钟，给疗愈师下班时间增加119分钟（只参与判断，不改排班对象，避免后面再叠加一次）
                LocalDateTime closeAt = BookingAvailability.shiftEnd(m, startTime);
                if (closeAt == null) return;
                if (Objects.equals(addType, 1)) {
                    closeAt = DateUtil.addTimeByMinutes(closeAt, 119);
                }

                // 判断预约开始时间是否不早于疗愈师上班时间 (>=)
                boolean isAfterStart = m.getStartTime() != null && !startTime.toLocalTime().isBefore(m.getStartTime());
                // 判断预约开始时间是否不晚于疗愈师下班时间 (<=)，普通下单必须早于下班时间
                boolean isBeforeEnd = Objects.equals(addType, 1) ? !startTime.isAfter(closeAt) : startTime.isBefore(closeAt);
                if (isAfterStart && isBeforeEnd) {
                    projectAllPeopleCountNew.add(m);
                }
            });
            projectAllPeople = projectAllPeopleCountNew;

            //需要增加判断开始下单时间以后的每个15分钟（加钟不占轮牌，不做人数拦截）
            for (int i = 1; i <= (durationMinutes / 15); i++) {
                count = personCount;
                LocalDateTime startTimeCheck = startTime.plusMinutes((i - 1) * 15);
                LocalDateTime endTimeCheck = startTime.plusMinutes(i * 15);
                if (detailList != null && detailList.size() > 0) {

                    LocalDateTime dtt = startTimeCheck;
                    List<OrderDetail> startAndEndList = detailList.stream().filter(e -> e.getStartTime().equals(dtt) || e.getEndTime().equals(dtt)).filter(t -> t.getMassagistId() != null && t.getProjectId() != 3).collect(Collectors.toList());
                    //startAndEndList  以massagistid 分组，获取每组的集合,并找到集合数据大于2的组合；
                    Map<Long, List<OrderDetail>> startAndEndListGroupByMassagistId = startAndEndList.stream().collect(Collectors.groupingBy(OrderDetail::getMassagistId));
                    Map<Long, List<OrderDetail>> result = startAndEndListGroupByMassagistId.entrySet().stream()
                            .filter(entry -> entry.getValue().size() >= 2)
                            .collect(Collectors.toMap(
                                    Map.Entry::getKey,   // Key 保持不变
                                    Map.Entry::getValue  // Value 保持不变
                            ));


                    for (OrderDetail d : detailList) {
                        LocalDateTime detailStartTime = d.getStartTime();
                        //0 分钟周转：服务结束即可接下一单
                        LocalDateTime detailEndTime = d.getEndTime();
                        boolean bl = DateUtil.toHHmm(startTimeCheck).compareTo(DateUtil.toHHmm(detailStartTime)) >= 0
                                && DateUtil.toHHmm(endTimeCheck).compareTo(DateUtil.toHHmm(detailEndTime)) <= 0;
                        if (bl) {
                            //说明此订单在下单的时间内
                            count++;
                        }
                    }
                    count = count - result.size();
                }
                if (count > allPeople.size()&&lxCk != 1 && !isAddService) {//lxck==1  说明订单是跨天订单 ，不再验证人数，只对结束的订单起作用
                    throw new BusinessException("抱歉，疗愈师不满足人数要求!");
                }
                count = personCount;
                if (detailList != null && detailList.size() > 0) {
                    LocalDateTime dtt = startTimeCheck;
                    List<OrderDetail> startAndEndList = detailList.stream().filter(e -> e.getStartTime().equals(dtt) || e.getEndTime().equals(dtt)).filter(t -> t.getMassagistId() != null && t.getProjectId() != 3).collect(Collectors.toList());
                    //startAndEndList  以massagistid 分组，获取每组的集合,并找到集合数据大于2的组合；
                    Map<Long, List<OrderDetail>> startAndEndListGroupByMassagistId = startAndEndList.stream().collect(Collectors.groupingBy(OrderDetail::getMassagistId));
                    Map<Long, List<OrderDetail>> result = startAndEndListGroupByMassagistId.entrySet().stream()
                            .filter(entry -> entry.getValue().size() >= 2)
                            .collect(Collectors.toMap(
                                    Map.Entry::getKey,   // Key 保持不变
                                    Map.Entry::getValue  // Value 保持不变
                            ));

                    for (OrderDetail d : detailList) {
                        if (d.getProjectId() == projectId) {
                            LocalDateTime detailStartTime = d.getStartTime();
                            // 0 分钟周转：服务结束即可接下一单
                            LocalDateTime detailEndTime = d.getEndTime();
                            boolean bl = DateUtil.toHHmm(startTimeCheck).compareTo(DateUtil.toHHmm(detailStartTime)) >= 0
                                    && DateUtil.toHHmm(endTimeCheck).compareTo(DateUtil.toHHmm(detailEndTime)) <= 0;
                            if (bl) {
                                //说明此订单在下单的时间内
                                count++;
                            }
                        }
                    }
                    count = count - result.size();
                }
                if (count > projectAllPeople.size()&&lxCk != 1 && !isAddService) {
                    throw new BusinessException("抱歉，疗愈师不满足人数要求!");
                }
            }

            // 空余疗愈师列表
            List<MassagistSchedules> availableMassagistList = new ArrayList<>();
            allMassagistList.forEach(m -> {
                // 已约疗愈师
                List<OrderDetail> massagistDetailList = massagistDetailMap.get(m.getMassagistId());
                boolean isAvailable;
                //增加22:00点之前都可以下单，将技师下边时间往后调整1小时
           /* if(shop.getClockOutTime().equals(DateUtil.toHHmm(m.getEndTime()).toString())){
                LocalDateTime lt=m.getEndTime().atDate(LocalDate.now());
                m.setEndTime(DateUtil.addTimeByMinutes(lt, 100).toLocalTime());
            }*/
                //下班时间换算成当天的绝对时间点：不晚于到店时间说明跨了午夜（自动延班到 00:xx），按次日算
                LocalDateTime closeAt = BookingAvailability.shiftEnd(m, startTime);
                //下班后还能接的截止时间：加钟客户还在店里，可以开在下班点之后；普通下单只按老口径算服务结束时间
                LocalDateTime closeLimit = closeAt == null ? null : DateUtil.addTimeByMinutes(closeAt, 119);
                //加钟允许在下班点上直接接续，普通下单仍需在下班前开始
                boolean startingInShift = closeAt != null && (startTime.isBefore(closeAt)
                        || (Objects.equals(addType, 1) && startTime.isBefore(closeLimit)));
                boolean beforeShiftStart = m.getStartTime() != null && startTime.toLocalTime().isBefore(m.getStartTime());

                if (!startingInShift || beforeShiftStart || endTime.isAfter(closeLimit)) {
                    log.info("技师id={},{}", m.getMassagistId(), "不在排班时间");
                    isAvailable = false;
                } else if (CollectionUtils.isEmpty(massagistDetailList)) {
                    isAvailable = true;
                } else {
                    isAvailable = massagistDetailList.stream().noneMatch(d ->
                            BookingAvailability.overlaps(startTime, endTime, d.getStartTime(), d.getEndTime(), 0));
                    if (!isAvailable) {
                        log.info("技师id={},{}", massagistService.findNameById(m.getMassagistId()), "时间冲突");
                    }
                }
                if (isAvailable) {
                    availableMassagistList.add(m);
                }
            });

            //luxin增加下单人数是否大于空闲技师人数，大于抛出异常（加钟不占轮牌，没疗愈师也要能先建单）
            if (availableMassagistList.size() < personCount && lxCk != 1 && !isAddService) {
                throw new BusinessException("抱歉，疗愈师不满足人数要求!");
            }

            //luxin当选择的技师被占用了，系统自动选择合适的技师去除已占用的技师
            List<Long> massagistIdTemp = new ArrayList<>();
            massgistIdList.stream().forEach(t -> {
                if (availableMassagistList.stream().map(MassagistSchedules::getMassagistId).collect(Collectors.toList()).contains(t)) {
                    massagistIdTemp.add(t);
                }
            });
            massgistIdList = massagistIdTemp;

            List<Long> availableMassagistIdList = availableMassagistList.stream().map(MassagistSchedules::getMassagistId).collect(Collectors.toList());
            //自动派单跳过客户已设为暂别的疗愈师；员工明确指定的技师不受影响
            availableMassagistIdList = customerMassagistBlockService.excludeBlocked(customerId, availableMassagistIdList);
            // 空闲疗愈师排序：加钟不碰轮牌（不读轮次、不写跳过原因），所以不做轮次排序
            List<Long> sortedMassagistIdList = isAddService
                    ? new ArrayList<>()
                    : sortMassagist(availableMassagistIdList, startTime, endTime, shopId, personCount);
            //记录客户指定的技师
            List<Long> specifyMassagistIdList = new ArrayList<>();
            if (!CollectionUtils.isEmpty(massgistIdList)) {
                if (CollectionUtils.isEmpty(oldOrderDetails)) {//没有老详情，代表是创建，创建时记录指定技师
                    specifyMassagistIdList.addAll(massgistIdList);
                }
                // 如果还不足够人数，从availableMassagistList补充
                if (massgistIdList.size() < personCount) {
                    int remainingCount = personCount - massgistIdList.size();
                    for (int i = 0; i < remainingCount; i++) {
                        if (sortedMassagistIdList.size() < remainingCount) {
                            continue;
                        }
                        Long massagistId = sortedMassagistIdList.get(i);
                        if (massagistId != null && !massgistIdList.contains(massagistId)) {
                            massgistIdList.add(massagistId);
                        }
                    }
                }
            } else {
                if (personCount <= sortedMassagistIdList.size()) {
                    massgistIdList = sortedMassagistIdList;
                } else {
                    for (Long massgistId : sortedMassagistIdList) {
                        if (massgistId != null && !massgistIdList.contains(massgistId)) {
                            massgistIdList.add(massgistId);
                        }
                    }
                }
            }

            // 如果还不足够人数，从全部中补充
            int bedRemainingCount = personCount - bedIdList.size();
            if (bedRemainingCount > 0) {
                List<Long> allBedIdList = allBedList.stream().map(Bed::getId).sorted((bedId1, bedId2) -> {
                    List<OrderDetail> orderDetailList1 = bedDetailMap.get(bedId1);
                    List<OrderDetail> orderDetailList2 = bedDetailMap.get(bedId2);
                    int size1 = orderDetailList1 != null ? orderDetailList1.size() : 0;
                    int size2 = orderDetailList2 != null ? orderDetailList2.size() : 0;
                    return Integer.compare(size1, size2);
                }).collect(Collectors.toList());
                for (Long bedId : allBedIdList) {
                    if (bedId != null && !bedIdList.contains(bedId)) {
                        bedIdList.add(bedId);
                    }
                }
            }
            int massagistRemainingCount = personCount - massgistIdList.size();
            //加钟不从轮牌里补人：没指定疗愈师的行留空待分配
            if (massagistRemainingCount > 0 && !isAddService) {
                List<Long> allMassagistIdList = allMassagistList.stream().map(MassagistSchedules::getMassagistId).collect(Collectors.toList());
                allMassagistIdList = customerMassagistBlockService.excludeBlocked(customerId, allMassagistIdList);
                allMassagistIdList = sortMassagist(allMassagistIdList, startTime, endTime, shopId, personCount);
                for (Long massgistId : allMassagistIdList) {
                    if (massgistId != null && !massgistIdList.contains(massgistId)) {
                        massgistIdList.add(massgistId);
                    }
                }
            }

            List<OrderDetail> orderDetailList = new ArrayList<>(personCount);
            Map<Long, OrderDetail> orderDetailMap = new HashMap<>();
            Map<Long, OrderDetail> specifyTypeMap = new HashMap<>();
            if (!CollectionUtils.isEmpty(oldOrderDetails)) {
                List<Long> finalMassagistIdList = massgistIdList;
                specifyTypeMap = oldOrderDetails.stream().filter(e -> finalMassagistIdList.contains(e.getMassagistId()))
                        .collect(Collectors.toMap(OrderDetail::getMassagistId, Function.identity()));
                orderDetailMap = oldOrderDetails.stream().filter(e -> !finalMassagistIdList.contains(e.getMassagistId()))
                        .collect(Collectors.toMap(OrderDetail::getId, Function.identity()));
                Set<Long> specifyTypeMassagistIds = specifyTypeMap.keySet();
                if (!CollectionUtils.isEmpty(specifyTypeMassagistIds)) {
                    //将指定的技师排到最前边
                    massgistIdList.sort(Comparator.comparingLong(item -> specifyTypeMassagistIds.contains(item) ? 0 : 1));
                }
            } else {
                //将指定的技师排到最前边
                massgistIdList.sort(Comparator.comparingLong(item -> specifyMassagistIdList.contains(item) ? 0 : 1));
            }
            Set<Long> idSet = orderDetailMap.keySet();
            Iterator<Long> iterator = idSet.iterator();
            for (int i = 0; i < personCount; i++) {
                //加钟单没指定疗愈师的行留空：人数比已排的疗愈师多时不再取人，直接待分配
                Long massagistId = i < massgistIdList.size() ? massgistIdList.get(i) : null;
                OrderDetail detail = new OrderDetail();
                detail.setShopId(shopId);
                detail.setProjectId(projectId);
                Integer specifyType = !CollectionUtils.isEmpty(specifyMassagistIdList) && specifyMassagistIdList.contains(massagistId) ? SpecifyType.PC.getValue() : null;
                detail.setSpecifyType(specifyType);
                OrderDetail orderDetail = specifyTypeMap.getOrDefault(massagistId, null);
                //指定类型不被修改
                if (isSelectJiShi && Objects.isNull(orderDetail)) {
                    detail.setSpecifyType(SpecifyType.PC.getValue());
                }
                if (orderDetail != null) {
                    detail.setId(orderDetail.getId());
                    detail.setState(orderDetail.getState());
                    detail.setSpecifyType(orderDetail.getSpecifyType());
                    detail.setComment(orderDetail.getComment());
                    detail.setIsUpdateSort(orderDetail.getIsUpdateSort());
                    detail.setProjectId(orderDetail.getProjectId());
                } else if (iterator.hasNext()) {
                    Long id = iterator.next();
                    orderDetail = orderDetailMap.get(id);
                    detail.setId(id);
                    detail.setState(orderDetail.getState());
                    detail.setComment(orderDetail.getComment());
                    detail.setIsUpdateSort(orderDetail.getIsUpdateSort());
                    detail.setProjectId(orderDetail.getProjectId());
                }
                detail.setProjectId(projectId);
                detail.setBedId(bedIdList.get(i));

                //增加判断，如果没有指定就不安排技师
                if (isSelectJiShi) {
                    detail.setMassagistId(massagistId);
                }


                detail.setDuration(durationMinutes);
                detail.setStartTime(startTime);
                detail.setEndTime(DateUtil.addTimeByMinutes(startTime, durationMinutes));
                orderDetailList.add(detail);
            }
            return orderDetailList;
    }

    /**
     * 可用疗愈师排序
     *
     * @param availableMassagistIdList 可用疗愈师id列表
     * @param startTime                开始日期
     * @param endTime                  结束日期
     * @param shopId                   门店id
     * @param personCount              预约人数
     * @return
     */
    public List<Long> sortMassagist(List<Long> availableMassagistIdList, LocalDateTime startTime, LocalDateTime endTime, Long shopId, Integer personCount) {
        String day = DateUtil.toYYYYMMDD(startTime);
        log.info("空闲的技师：{}", availableMassagistIdList.stream().map(s -> massagistService.findNameById(s)).collect(Collectors.toList()));
        List<RoundSchedule> list = roundScheduleService.findSortMassagistIdList(day, shopId, personCount, availableMassagistIdList, true);
        if (CollectionUtils.isEmpty(list)) {
            throw new BusinessException("获取技师轮次列表失败");
        }
        log.info("根据排序轮次修正后：");
        for (RoundSchedule roundSchedule : list) {
            log.info("技师={}", massagistService.findNameById(roundSchedule.getMassagistId()));
        }
        List<RoundSchedule> massagistList = new ArrayList<>();
        List<RoundSchedule> skipMassagistList = new ArrayList<>();
        Set<Long> massagistIdList = new HashSet<>();
        for (RoundSchedule roundSchedule : list) {
            if (massagistIdList.containsAll(availableMassagistIdList)) {
                break;
            }
            Long massagistId = roundSchedule.getMassagistId();
            // 如果是空闲，则添加到 massagistList
            if (availableMassagistIdList.contains(massagistId)) {
                massagistList.add(roundSchedule);
                massagistIdList.add(massagistId);
            } else if (!availableMassagistIdList.contains(massagistId)) {
                // 如果不在空闲中，则属于被跳过
                skipMassagistList.add(roundSchedule);
            }
        }
        log.info("根据空闲修正后：");
        for (RoundSchedule roundSchedule : massagistList) {
            log.info("技师={},轮次={}", massagistService.findNameById(roundSchedule.getMassagistId()), roundSchedule.getRound());
        }
        if (!CollectionUtils.isEmpty(skipMassagistList)) {
            roundScheduleService.verifySkipMassagistReason(skipMassagistList, startTime, endTime, shopId);
        }
        return massagistList.stream().map(RoundSchedule::getMassagistId).distinct().collect(Collectors.toList());
    }

    /**
     * 完成更新排序
     *
     * @param detailList
     * @param day
     * @param shopId
     */
    private void updateMassagistSort(List<OrderDetail> detailList, String day, Long shopId) {
        if (CollectionUtils.isEmpty(detailList)) {
            return;
        }
        detailList = detailList.stream().filter(OrderDetail::getIsUpdateSort).collect(Collectors.toList());
        roundScheduleService.updateByDetailList(detailList, day, shopId);
    }

    /**
     * 取消更新排班
     *
     * @param detailList
     * @param roundScheduleState
     */
    private void recoverSortId(List<OrderDetail> detailList, RoundScheduleState roundScheduleState) {
        if (CollectionUtils.isEmpty(detailList)) {
            return;
        }
        List<Long> detailIdList = detailList.stream().map(OrderDetail::getId).collect(Collectors.toList());
        roundScheduleService.recoverByDetailList(detailIdList, roundScheduleState);
    }

    public List<OrderDetail> listByOrderId(Long orderId) {
        LambdaQueryWrapper<OrderDetail> lqw = new LambdaQueryWrapper<>();
        lqw.eq(OrderDetail::getOrderId, orderId);
        List<OrderDetail> list = list(lqw);
        return list;
    }

    public void buildBedName(List<OrderDetail> list) {
        if (CollectionUtils.isEmpty(list)) {
            return;
        }
        List<Long> bedIds = list.stream().filter(e -> !ObjUtil.isEmpty(e.getBedId())).map(OrderDetail::getBedId).collect(Collectors.toList());
        if (CollectionUtils.isEmpty(bedIds)) {
            return;
        }
        List<Bed> beds = bedService.listByIds(bedIds);
        if (CollectionUtils.isEmpty(beds)) {
            return;
        }
        Map<Long, Bed> bedMap = beds.stream().filter(e -> !ObjUtil.isEmpty(e.getName())).collect(Collectors.toMap(Bed::getId, Function.identity()));
        list.forEach(e -> {
                    Bed bed = bedMap.getOrDefault(e.getBedId(), null);
                    if (bed != null) {
                        e.setBedName(bedMap.get(e.getBedId()).getName());
                        e.setBedType(bedMap.get(e.getBedId()).getType());
                    }
                }
        );
    }

    public void buildProjectTitle(List<OrderDetail> list) {
        if (CollectionUtils.isEmpty(list)) {
            return;
        }
        List<Long> projectIds = list.stream().filter(e -> !ObjUtil.isEmpty(e.getProjectId())).map(OrderDetail::getProjectId).collect(Collectors.toList());
        if (CollectionUtils.isEmpty(projectIds)) {
            return;
        }
        List<Project> projects = projectService.listByIds(projectIds);
        if (CollectionUtils.isEmpty(projects)) {
            return;
        }
        Map<Long, String> idTitleMap = projects.stream().filter(e -> !ObjUtil.isEmpty(e.getTitle())).collect(Collectors.toMap(Project::getId, Project::getTitle));
        list.forEach(e -> e.setProjectTitle(idTitleMap.get(e.getProjectId())));
    }

    public void buildMassagist(List<OrderDetail> list) {
        if (CollectionUtils.isEmpty(list)) {
            return;
        }
        List<Long> massagistIds = list.stream().filter(e -> !ObjUtil.isEmpty(e.getMassagistId())).map(OrderDetail::getMassagistId).collect(Collectors.toList());
        if (CollectionUtils.isEmpty(massagistIds)) {
            return;
        }
        List<Massagist> massagistList = massagistService.listByIds(massagistIds);
        if (CollectionUtils.isEmpty(massagistList)) {
            return;
        }
        Map<Long, Massagist> massagistMap = massagistList.stream().collect(Collectors.toMap(Massagist::getId, Function.identity()));
        list.forEach(e -> e.setMassagist(massagistMap.get(e.getMassagistId())));
    }

    public void buildCustomer(List<OrderDetail> list) {
        if (CollectionUtils.isEmpty(list)) {
            return;
        }
        List<Long> customerIds = list.stream().filter(e -> !ObjUtil.isEmpty(e.getCustomerId())).map(OrderDetail::getCustomerId).distinct().collect(Collectors.toList());
        if (CollectionUtils.isEmpty(customerIds)) {
            return;
        }
        List<Customer> customerList = customerService.listByIds(customerIds);
        if (CollectionUtils.isEmpty(customerList)) {
            return;
        }
        customerService.buildCustomerVipLevel(customerList);
        Map<Long, Customer> customerMap = customerList.stream().collect(Collectors.toMap(Customer::getId, Function.identity()));
        list.forEach(e -> e.setCustomer(customerMap.get(e.getCustomerId())));
    }

    public void buildOrder(List<OrderDetail> list) {
        if (CollectionUtils.isEmpty(list)) {
            return;
        }
        List<Long> orderIds = list.stream().filter(e -> !ObjUtil.isEmpty(e.getOrderId())).map(OrderDetail::getOrderId).distinct().collect(Collectors.toList());
        if (CollectionUtils.isEmpty(orderIds)) {
            return;
        }
        List<Order> orderList = orderService.listByIds(orderIds);
        if (CollectionUtils.isEmpty(orderList)) {
            return;
        }
        orderService.buildCouponAmount(orderList);
        Map<Long, Order> orderMap = orderList.stream().collect(Collectors.toMap(Order::getId, Function.identity()));
        list.forEach(e -> e.setOrder(orderMap.get(e.getOrderId())));
    }

    /**
     * 根据订单获取订单详情
     *
     * @param orderIdList
     * @return
     */
    public Map<Long, List<OrderDetail>> massagistMapByOrderIdList(List<Long> orderIdList) {
        if (CollectionUtils.isEmpty(orderIdList)) {
            return Collections.emptyMap();
        }
        LambdaQueryWrapper<OrderDetail> lqw = new LambdaQueryWrapper<>();
        lqw.in(OrderDetail::getOrderId, orderIdList);
        List<OrderDetail> list = list(lqw);
        if (CollectionUtils.isEmpty(list)) {
            return Collections.emptyMap();
        }
        return list.stream().collect(Collectors.groupingBy(OrderDetail::getOrderId));
    }

    public List<OrderDetail> timeList(Long shopId, String startTime, String endTime, List<Long> massagistIdList) {
        LambdaQueryWrapper<OrderDetail> lqw = new LambdaQueryWrapper<>();
        lqw.eq(OrderDetail::getState, AppointmentState.FINISHED.getValue());
        if (!CollectionUtils.isEmpty(massagistIdList)) {
            lqw.in(OrderDetail::getMassagistId, massagistIdList);
        }
        if (!ObjUtil.isEmpty(shopId)) {
            lqw.eq(OrderDetail::getShopId, shopId);
        }
        lqw.between(OrderDetail::getEndTime, startTime, endTime);//根据预约完成时间做，完成时间可能不准
        return list(lqw);
    }

    /**
     * 根据订单id删除
     *
     * @param orderId
     */
    public void removeByOrderId(Long orderId) {
        LambdaQueryWrapper<OrderDetail> lqw = new LambdaQueryWrapper<>();
        lqw.eq(OrderDetail::getOrderId, orderId);
        remove(lqw);
    }

    /** 自动延班只做补充，失败不影响预约主流程。 */
    void extendShifts(List<OrderDetail> details) {
        try {
            massagistSchedulesService.extendShiftForOrders(details);
        } catch (Exception e) {
            log.warn("订单延时自动延班失败: {}", e.getMessage());
        }
    }

    /**
     * 指定疗愈师不可约时的提示：当天在本店有排班则用 sameShopMessage，
     * 否则点出其实际排班门店，引导切换门店（点钟门店一致性）。
     */
    String specifiedTherapistMessage(Long massagistId, String date, Long shopId, String sameShopMessage) {
        try {
            List<MassagistSchedules> dayShifts = massagistSchedulesService.listMassagistSchedulesByDate(date, massagistId);
            if (dayShifts == null) {
                dayShifts = Collections.emptyList();
            }
            if (dayShifts.stream().anyMatch(s -> shopId != null && shopId.equals(BookingAvailability.effectiveShopId(s)))) {
                return sameShopMessage;
            }
            Map<Long, String> names = new HashMap<>();
            for (MassagistSchedules s : dayShifts) {
                Long sid = BookingAvailability.effectiveShopId(s);
                if (sid != null && !names.containsKey(sid)) {
                    names.put(sid, shopService.findNameById(sid));
                }
            }
            return BookingAvailability.shopMismatchMessage(dayShifts, names);
        } catch (Exception e) {
            log.warn("查询疗愈师排班门店失败: {}", e.getMessage());
            return sameShopMessage;
        }
    }

    /**
     * 完成疗愈服务
     *
     * @param id
     * @return
     */
    @Transactional(rollbackFor = Exception.class)
    public void finish(Long id) {
        OrderDetail detail = getById(id);
        if (detail == null) {
            throw new BusinessException("记录不存在");
        }
        if (!AppointmentState.DOING.getValue().equals(detail.getState())) {
            throw new BusinessException("状态异常");
        }
        detail.setState(AppointmentState.FINISHED.getValue());
        detail.setFinishTime(LocalDateTime.now());
        updateById(detail);
        Long orderId = detail.getOrderId();
        LambdaQueryWrapper<OrderDetail> queryWrapper = new LambdaQueryWrapper();
        queryWrapper.eq(OrderDetail::getOrderId, orderId);
        queryWrapper.ne(OrderDetail::getId, id);
        queryWrapper.eq(OrderDetail::getState, AppointmentState.DOING.getValue());
        if (count(queryWrapper) > 0) {
            return;
        }
        // 完成订单
        orderService.finish(orderId);
    }

    /**
     * 确认到店
     *
     * @param id
     * @return
     */
    @Transactional(rollbackFor = Exception.class)
    public void doingService(Long id) {
        OrderDetail detail = getById(id);
        if (detail == null) {
            throw new BusinessException("记录不存在");
        }
        if (!AppointmentState.WAITING.getValue().equals(detail.getState())) {
            throw new BusinessException("状态异常");
        }
        detail.setState(AppointmentState.DOING.getValue());
        detail.setFinishTime(LocalDateTime.now());
        //luxin增加，判断订单是否有技师，没有技师将系统自动安排技师
        if (detail.getMassagistId() == null||detail.getMassagistId()<=0) {
            int durationMinutes= (int) DateUtil.diffMinutes(detail.getStartTime(),detail.getEndTime());
            //加钟单优先安排被加钟单的疗愈师
            List<Long> addSourceMassagistIdList = findAddSourceMassagistIdList(detail);
            long massagistId= getCustmerArriverShopDivideMessageId(detail.getShopId(),detail.getProjectId(),detail.getStartTime(),durationMinutes,1,addSourceMassagistIdList);
            detail.setMassagistId(massagistId);
            if (addSourceMassagistIdList.contains(massagistId)) {
                //加钟单沿用原单疗愈师：按"指定疗愈师、不计轮次"处理（看板显示指定角标，轮牌不前进）
                detail.setIsUpdateSort(false);
                detail.setSpecifyType(SpecifyType.PC.getValue());
            } else {
                // 系统按轮牌顺序指派的这一单必须计入轮次，否则该疗愈师轮次不前进、看板上会一直挂着"未计入轮次"角标
                detail.setIsUpdateSort(true);
                // 系统指派不是点名，清掉历史遗留的点钟标记
                detail.setSpecifyType(0);
            }
            //更新技师排班顺序（updateMassagistSort 内部会跳过不计轮次的明细）
            List<OrderDetail> detailList = new ArrayList<>();
            detailList.add(detail);
            updateMassagistSort(detailList, DateUtil.toYYYYMMDD(detail.getStartTime()), detail.getShopId());//更新技师排序
        }
        if (!updateById(detail)) {
            throw new BusinessException("确认到店失败，请刷新后重试");
        }
    }
    /**
     * 一键分配疗愈师
     *
     * @param id 订单详情id
     * @return 实际生效的疗愈师信息，供前端确认"真的安排上了"，而不是只回一个空洞的成功
     */
    @Transactional(rollbackFor = Exception.class)
    public JSONObject exceArganizeMassagist(Long id) {
        OrderDetail detail = getById(id);
        if (detail == null) {
            throw new BusinessException("记录不存在");
        }
        if (AppointmentState.FINISHED.getValue().equals(detail.getState())
                || AppointmentState.CANCELED.getValue().equals(detail.getState())) {
            throw new BusinessException("订单已" + AppointmentState.getLabel(detail.getState()) + "，不能再安排疗愈师");
        }
        Long massagistId = detail.getMassagistId();
        // 已有疗愈师时，先确认这位疗愈师还在职（避免历史脏id：库里是 0/-1 或疗愈师已被删除，前端却一直显示"未安排"）
        boolean alreadyAssigned = massagistId != null && massagistId > 0 && massagistService.getById(massagistId) != null;
        if (!alreadyAssigned) {
            int durationMinutes = (int) DateUtil.diffMinutes(detail.getStartTime(), detail.getEndTime());
            //加钟单优先安排被加钟单的疗愈师
            List<Long> addSourceMassagistIdList = findAddSourceMassagistIdList(detail);
            massagistId = getCustmerArriverShopDivideMessageId(detail.getShopId(), detail.getProjectId(),
                    detail.getStartTime(), durationMinutes, 1, addSourceMassagistIdList);
            detail.setMassagistId(massagistId);
            if (addSourceMassagistIdList.contains(massagistId)) {
                //加钟单沿用原单疗愈师：按"指定疗愈师、不计轮次"处理（看板会显示指定角标，轮牌不前进）
                detail.setIsUpdateSort(false);
                detail.setSpecifyType(SpecifyType.PC.getValue());
            } else {
                // 系统按轮牌顺序指派的这一单必须计入轮次，否则该疗愈师轮次不前进、下次一键安排还会优先选到同一个人，
                // 看板上也会一直挂着"未计入轮次"的角标（一键安排完成后本不该出现这个角标）
                detail.setIsUpdateSort(true);
                // 系统指派不是客户/前台点名，清掉历史遗留的点钟标记（与拖拽换疗愈师的清理口径一致）
                detail.setSpecifyType(0);
            }
            //更新技师排班顺序（updateMassagistSort 内部会跳过不计轮次的明细）
            List<OrderDetail> detailList = new ArrayList<>();
            detailList.add(detail);
            updateMassagistSort(detailList, DateUtil.toYYYYMMDD(detail.getStartTime()), detail.getShopId());//更新技师排序
            if (!updateById(detail)) {
                throw new BusinessException("安排疗愈师失败，请刷新后重试");
            }
        }
        Massagist massagist = massagistService.getById(massagistId);
        if (massagist == null) {
            throw new BusinessException("安排疗愈师失败，疗愈师信息不存在");
        }
        JSONObject result = new JSONObject();
        result.put("massagistId", massagist.getId());
        result.put("massagistName", massagist.getName());
        result.put("alreadyAssigned", alreadyAssigned);
        return result;
    }


    /**
     * 定时完成疗愈服务
     *
     * @return
     */
    @Transactional(rollbackFor = Exception.class)
    public void finishScheduled() {
        LocalDateTime now = LocalDateTime.now();

        //到结束时间自动结束(已付款订单才处理)
        List<OrderDetail> list = baseMapper.findListByEndDate(DateUtil.getCurrentDateTimeCode());
        if (CollectionUtils.isEmpty(list)) {
            return;
        }
        list.forEach(detail -> {
            detail.setState(AppointmentState.FINISHED.getValue());
            detail.setFinishTime(now);
        });
        updateBatchById(list);
        //订单实际结束晚于下班时间时，按订单门店顺延当天排班
        extendShifts(list);

        List<Long> orderIdList = list.stream().filter(detail -> detail.getOrderId() != null).map(OrderDetail::getOrderId).distinct().collect(Collectors.toList());
        if (CollectionUtils.isEmpty(orderIdList)) {
            return;
        }
        List<Long> idList = list.stream().map(OrderDetail::getId).collect(Collectors.toList());
        LambdaQueryWrapper<OrderDetail> queryWrapper = new LambdaQueryWrapper<>();
        queryWrapper.in(OrderDetail::getOrderId, orderIdList);
        queryWrapper.notIn(OrderDetail::getId, idList);
        queryWrapper.in(OrderDetail::getState, Arrays.asList(AppointmentState.WAITING.getValue(), AppointmentState.DOING.getValue()));
        List<OrderDetail> noFinishList = list(queryWrapper);
        if (!CollectionUtils.isEmpty(noFinishList)) {
            List<Long> noFinishOrderIdList = noFinishList.stream().map(OrderDetail::getOrderId).distinct().collect(Collectors.toList());
            orderIdList.removeAll(noFinishOrderIdList);
        }
        if (CollectionUtils.isEmpty(orderIdList)) {
            return;
        }
        // 完成订单
        orderService.finishBatch(orderIdList);
    }

    /**订单的详情订单取消操作
     * **/
    @Transactional(rollbackFor = Exception.class)
    public void refundOrder(Long orderId, boolean needRearrangementBed) {
        LambdaQueryWrapper<OrderDetail> queryWrapper = new LambdaQueryWrapper();
        queryWrapper.eq(OrderDetail::getOrderId, orderId);
        queryWrapper.notIn(OrderDetail::getState, AppointmentState.CANCELED.getValue());
        List<OrderDetail> orderDetails = list(queryWrapper);
        if (CollectionUtils.isEmpty(orderDetails)) {
            return;
        }
        orderDetails.forEach(e -> e.setState(AppointmentState.CANCELED.getValue()));
        if (needRearrangementBed) {
//            rearrangementBed(orderDetails);
        }
        updateBatchById(orderDetails);
        // 恢复排班列表
        recoverSortId(orderDetails, RoundScheduleState.CANCEL);
    }

    private void rearrangementBed(List<OrderDetail> cancelDetailList) {
        if (CollectionUtils.isEmpty(cancelDetailList)) {
            return;
        }
        LocalDateTime startTime = null;
        LocalDateTime endTime = null;
        Long shopId = null;
        Long projectId = null;
        List<Long> cancelBedIdList = new ArrayList<>(cancelDetailList.size());
        List<Long> cancelDetailIdList = new ArrayList<>(cancelDetailList.size());
        for (OrderDetail d : cancelDetailList) {
            startTime = d.getStartTime();
            endTime = d.getEndTime();
            shopId = d.getShopId();
            projectId = d.getProjectId();
            cancelBedIdList.add(d.getBedId());
            cancelDetailIdList.add(d.getId());
        }
        boolean repeat = checkAgain(startTime, endTime, cancelDetailIdList, cancelBedIdList);
        if (repeat) {
            return;
        }
        List<Bed> afterCodeBedList = bedService.findAfterCodeBedList(cancelBedIdList);
        if (CollectionUtils.isEmpty(afterCodeBedList)) {
            return;
        }
        String date = DateUtil.toYYYYMMDD(startTime);
        List<Long> afterBedIdList = new ArrayList<>();
        Map<Long, String> bedCodeMap = new HashMap<>(afterCodeBedList.size());
        afterCodeBedList.forEach(b -> {
            afterBedIdList.add(b.getId());
            bedCodeMap.put(b.getId(), b.getSerialNumber());
        });
        List<OrderDetail> orderDetailList = getBaseMapper().findSimpleListByStartDateAndShopAndProject(date, shopId, projectId);
        if (CollectionUtils.isEmpty(orderDetailList)) {
            return;
        }
        LocalDateTime cancelStartTime = startTime;
        LocalDateTime cancelEndTime = endTime;
        // 在本次取消的床位之后且时间段是在本次取消之间的的订单明细
        orderDetailList = orderDetailList.stream().filter(d -> {
            boolean r = afterBedIdList.contains(d.getBedId()) && !cancelDetailIdList.contains(d.getId());
            if (r) {
                return DateUtil.toHHmm(cancelStartTime).compareTo(DateUtil.toHHmm(d.getStartTime())) <= 0
                        && DateUtil.toHHmm(cancelEndTime).compareTo(DateUtil.toHHmm(d.getEndTime())) >= 0;
            }
            return false;
        }).peek(d -> d.setBedNumber(bedCodeMap.get(d.getBedId()))).sorted(Comparator.comparing(OrderDetail::getBedNumber)).collect(Collectors.toList());
        if (CollectionUtils.isEmpty(orderDetailList)) {
            return;
        }
        orderDetailList.forEach(d -> cancelBedIdList.add(d.getBedId()));
        List<Long> sortedBedIdList = bedService.sortById(cancelBedIdList);
        if (CollectionUtils.isEmpty(sortedBedIdList)) {
            return;
        }
        for (int i = 0; i < orderDetailList.size(); i++) {
            OrderDetail detail = orderDetailList.get(i);
            detail.setBedId(sortedBedIdList.get(i));
        }
        updateBatchById(orderDetailList);
    }

    private boolean checkAgain(LocalDateTime startTime, LocalDateTime endTime, List<Long> detailIdList, List<Long> cancelBedIdList) {
        // 再次检查是否有重复床位
        LambdaQueryWrapper<OrderDetail> queryWrapper = new LambdaQueryWrapper();
        queryWrapper.notIn(OrderDetail::getId, detailIdList);
        queryWrapper.in(OrderDetail::getBedId, cancelBedIdList);
        queryWrapper.ne(OrderDetail::getState, AppointmentState.CANCELED.getValue());
        queryWrapper.and(wrapper -> wrapper.between(OrderDetail::getEndTime, startTime, endTime).or().between(OrderDetail::getStartTime, startTime, endTime));
        return count(queryWrapper) > 0;
    }

    public void changeCancel2Doing(Long orderId) {
        LambdaQueryWrapper<OrderDetail> queryWrapper = new LambdaQueryWrapper();
        queryWrapper.eq(OrderDetail::getOrderId, orderId);
        queryWrapper.in(OrderDetail::getState, AppointmentState.CANCELED.getValue());
        List<OrderDetail> orderDetails = list(queryWrapper);
        orderDetails.forEach(e -> e.setState(AppointmentState.WAITING.getValue()));
        updateBatchById(orderDetails);
    }

    public List<?> schedulingMap(SchedulingParam schedulingParam) {
        if (SchedulingType.BED.getValue().equals(schedulingParam.getType())) {
            List<Bed> resources = bedService.listByShopId(schedulingParam.getShopId());

            //接待
            Bed bed = new Bed();
            bed.setId(0L);
            bed.setType(0);
            bed.setName("接待");
            bed.setShopId(schedulingParam.getShopId());
            resources.add(bed);

            resources.sort(Comparator.comparing(Bed::getType).thenComparing(Bed::getName));
            List<OrderDetail> orderDetails = baseMapper.listBySchedulingParam(schedulingParam);

            //接待
            orderDetails.forEach(s -> {
                if (s.getBedId() == null) {
                    s.setBedId(0L);
                }
            });

            return getScheduledResources(
                    resources,
                    orderDetails,
                    OrderDetail::getBedId
            );
        } else if (SchedulingType.MASSAGIST.getValue().equals(schedulingParam.getType())) {
            List<Massagist> resources = massagistService.schedulingList(schedulingParam.getShopId(), Arrays.asList(JobStatus.JOB_ING.getValue()), schedulingParam.getStartDateTime());
            //把调店技师加进来
            List<Massagist> massagists =massagistSchedulesService.getMassagistSchedulesListByDateShopId( schedulingParam.getStartDateTime().toLocalDate(),schedulingParam.getShopId());
            if(massagists!=null && massagists.size()>0){
                massagists.forEach(m->{
                    if(resources.stream().noneMatch(e->e.getId().equals(m.getId()))){
                        resources.add(m);
                    }
                });
            }
            //疗愈师只读看板：只返回本人一列
            List<Massagist> viewResources = resources;
            if (schedulingParam.getMassagistId() != null) {
                Long onlyId = schedulingParam.getMassagistId();
                viewResources = resources.stream().filter(e -> onlyId.equals(e.getId())).collect(Collectors.toList());
            }
            List<OrderDetail> orderDetails = baseMapper.listBySchedulingParam(schedulingParam).stream().filter(t->t.getMassagistId()!=null).collect(Collectors.toList());
            return getScheduledResources(
                    viewResources,
                    orderDetails,
                    OrderDetail::getMassagistId
            );
        }
        return Collections.emptyList();
    }

    private <T> List<T> getScheduledResources(
            List<T> resources,
            List<OrderDetail> orderDetails,
            Function<OrderDetail, Long> resourceIdExtractor) {

        if (CollectionUtils.isEmpty(resources)) {
            return resources;
        }

        if (CollectionUtils.isEmpty(orderDetails)) {
            resources.forEach(r -> setOrderDetails(r, Collections.emptyList()));
            return resources;
        }
        buildOrder(orderDetails);
        buildProjectTitle(orderDetails);
        buildMassagist(orderDetails);
        buildCustomer(orderDetails);
        buildOrderCount(orderDetails);
        buildBedName(orderDetails);
        Map<Long, List<OrderDetail>> schedules = orderDetails.stream()
                .collect(Collectors.groupingBy(resourceIdExtractor, Collectors.collectingAndThen(
                        Collectors.toList(),
                        list -> list.stream()
                                .sorted(Comparator.comparing(OrderDetail::getStartTime))
                                .collect(Collectors.toList())
                )));

        resources.forEach(r -> {
            Long resourceId = getResourceId(r);
            setOrderDetails(r, schedules.getOrDefault(resourceId, Collections.emptyList()));
        });

        return resources;
    }

    private void buildOrderCount(List<OrderDetail> orderDetails) {
        //到店次数优先用订单上静态写入的自然日编号；历史订单没写编号时按自然日排名现算（不回填库）
        Set<Long> legacyCustomerIds = orderDetails.stream()
                .filter(e -> e.getOrder() != null && e.getOrder().getVisitNo() == null)
                .map(OrderDetail::getCustomerId)
                .filter(Objects::nonNull)
                .collect(Collectors.toSet());
        Map<Long, Integer> legacyOrderVisitNoMap = new HashMap<>();
        legacyCustomerIds.forEach(customerId ->
                legacyOrderVisitNoMap.putAll(orderService.visitNoMapByCustomer(customerId)));
        orderDetails.forEach(e -> {
            Customer customer = e.getCustomer();
            if (customer == null) {
                return;
            }
            Order order = e.getOrder();
            if (order != null) {
                //取消/退款/超时的订单不占自然日，也不显示到店次数
                if (!orderService.isVisitCounted(order)) {
                    return;
                }
                Integer visitNo = order.getVisitNo() != null
                        ? order.getVisitNo() : legacyOrderVisitNoMap.get(order.getId());
                if (visitNo != null) {
                    customer.setOrderCount(visitNo.longValue());
                    return;
                }
            }
            Long orderCount = orderService.countByCustomerId(e.getCustomerId());
            long l = orderCount != null ? orderCount : 0;
            customer.setOrderCount(l + 1);//已完成订单数+1
        });
    }

    private Long getResourceId(Object resource) {
        if (resource instanceof Bed) {
            return ((Bed) resource).getId();
        } else if (resource instanceof Massagist) {
            return ((Massagist) resource).getId();
        }
        throw new BusinessException("传入的Object不支持");
    }

    private void setOrderDetails(Object resource, List<OrderDetail> orderDetails) {
        if (resource instanceof Bed) {
            ((Bed) resource).setOrderDetailList(orderDetails);
        } else if (resource instanceof Massagist) {
            ((Massagist) resource).setOrderDetailList(orderDetails);
        }
    }

    public OrderDetail info(Long id) {
        OrderDetail orderDetail = getById(id);
        List<OrderDetail> list = new ArrayList<>();
        list.add(orderDetail);
        buildOrder(list);
        buildProjectTitle(list);
        buildMassagist(list);
        buildCustomer(list);
        buildOrderCount(list);
        buildBedName(list);
        return list.get(0);
    }

    public void updateComment(Long id, String comment) {
        OrderDetail orderDetail = getById(id);
        if (orderDetail == null) {
            throw new BusinessException("订单明细不存在");
        }
        orderDetail.setComment(comment);
        updateById(orderDetail);
    }

    /**
     * 拖动修改订单
     *
     * @param id
     * @param bedId
     * @param massagistId
     * @param startTime
     * @return
     */
    @Transactional(rollbackFor = Exception.class)
    public JSONObject updateDetail(Long id, Long bedId, Long massagistId, String startTime) {
        LocalDateTime startDateTime = DateUtil.string2DateTime(startTime);
        if (startDateTime == null) {
            throw new BusinessException("开始时间不能为空");
        }
        Bed bed = bedService.getById(bedId);
        if (bed != null && NormalState.INVALID.getValue().equals(bed.getStatus())) {
            throw new BusinessException(bed.getName() + "床位已经被关闭了");
        }

        OrderDetail orderDetail = getById(id);
        if (orderDetail == null) {
            throw new BusinessException("订单详情不存在");
        }
        Long shopId = orderDetail.getShopId();
        String key = "lockKey" + shopId;
        synchronized (key.intern()) {
            //更新前数据，用于替换
            LocalDateTime oldStartDateTime = orderDetail.getStartTime();
            // 早鸟价单把服务日期拖早会缩短提前期，等于白拿提前价，直接拦截；
            // 已完成明细只是事后补录，不参与这条限制
            if (!isFinishedState(orderDetail.getState())) {
                Order order = orderService.getById(orderDetail.getOrderId());
                if (order != null && EarlyBirdPrice.isEarlyBird(order.getPriceSource())) {
                    LocalDate bookedDate = order.getAdvanceDate() != null ? order.getAdvanceDate()
                            : (oldStartDateTime == null ? null : oldStartDateTime.toLocalDate());
                    EarlyBirdPrice.assertNotEarlier(order.getPriceSource(), bookedDate, startDateTime.toLocalDate());
                }
            }
            Long oldBedId = orderDetail.getBedId();
            Long oldMassagistId = orderDetail.getMassagistId();
            Integer duration = orderDetail.getDuration();
            LocalDateTime endDateTime = DateUtil.addTimeByMinutes(startDateTime, duration);

            //变更前数据用于补充日志
            JSONObject jsonObject = new JSONObject();
            jsonObject.put("bedId", oldBedId);
            jsonObject.put("startTime", oldStartDateTime);
            jsonObject.put("massagistId", oldMassagistId);

            // 已完成/已取消的明细只是运营动作的事后调整：只挪它自己，不校验冲突、不互换、不动别人的排期
            if (isFinishedState(orderDetail.getState())) {
                if (bedId != null) {
                    orderDetail.setBedId(bedId);
                    orderDetail.setIsLockBed(true);
                }
                if (massagistId != null) {
                    orderDetail.setMassagistId(massagistId);
                }
                orderDetail.setStartTime(startDateTime);
                orderDetail.setEndTime(endDateTime);
                updateById(orderDetail);
                return jsonObject;
            }

            Map<Long, Integer> typeMap = new HashMap<>();
            Map<Integer, Long> projectIdMap = new HashMap<>();
            if (bedId != null) {
                //目标床位在该时段已经有单：本次拖动直接不生效，不去改原来那单
                throwIfOccupied(findOverlappingSchedules(shopId, null, bedId, startDateTime, endDateTime, id),
                        "床位「" + (bed != null ? bed.getName() : bedId) + "」");
                orderDetail.setBedId(bedId);
                //换床位可能涉及到换项目
                typeMap = bedService.findTypeMapByIdList(Arrays.asList(bedId, oldBedId));
                Integer oldType = typeMap.getOrDefault(oldBedId, null);
                Integer type = typeMap.getOrDefault(bedId, null);
                if (oldType != null && type != null && !oldType.equals(type)) {
                    projectIdMap = projectService.findIdMapByTypeList(Arrays.asList(oldType, type));
                    orderDetail.setProjectId(projectIdMap.getOrDefault(type, orderDetail.getProjectId()));

                    if (oldMassagistId != null) {
                        //将表OrderDetail 中massagistid 列设置为null
                        UpdateWrapper<OrderDetail> updateWrapper = new UpdateWrapper<>();
                        updateWrapper.eq("id", id)
                                .set("massagist_id", null);
                        orderDetail.setMassagistId(null);
                        update(orderDetail, updateWrapper);
                        if(orderDetail.getIsUpdateSort()){
                            List<OrderDetail> orderDetailList=new ArrayList<>();
                            orderDetailList.add(orderDetail);
                            recoverSortId(orderDetailList, RoundScheduleState.UPDATE);
                        }
                    }
                    //对订单order 中的产品id 进行修改
                    Order order = orderService.getById(orderDetail.getOrderId());
                    if(type==2){
                        order.setProductId(5L);
                        order.setProductTitle("全感舒筋");
                    }
                    if(type==1){
                        order.setProductId(4L);
                        order.setProductTitle("头部水疗");
                    }
                    orderService.updateById(order);

                }
                orderDetail.setIsLockBed(true);
            } else if (massagistId != null) {
                //该疗愈师在这个时段已有排单或正在服务：本次拖动直接不生效，不去改原来那单
                String massagistName = massagistService.findNameById(massagistId);
                throwIfOccupied(findOverlappingSchedules(shopId, massagistId, null, startDateTime, endDateTime, id),
                        "疗愈师「" + (massagistName != null ? massagistName : massagistId) + "」");
                if (!massagistId.equals(oldMassagistId)) {
                    recoverSortId(Collections.singletonList(orderDetail), RoundScheduleState.UPDATE);
                    if (!ObjectUtils.isEmpty(orderDetail.getSpecifyType())) {
                        orderDetail.setSpecifyType(0);
                    }
                }

                //本单原来的床位在新时段被占用时，换一张同类型空床位（只动本单），接待任务除外
                if (!projectService.isReceptionOrder(orderDetail.getProjectId())
                        && !CollectionUtils.isEmpty(findOverlappingSchedules(shopId, null, orderDetail.getBedId(),
                        startDateTime, endDateTime, id))) {
                    Long availableBedId = findAvailableBedId(startDateTime, orderDetail.getProjectId(), orderDetail.getDuration(), shopId);
                    if (availableBedId != null) {
                        orderDetail.setBedId(availableBedId);
                    }
                }
                orderDetail.setMassagistId(massagistId);
            }
            orderDetail.setStartTime(startDateTime);
            orderDetail.setEndTime(endDateTime);

            updateById(orderDetail);
            extendShifts(Collections.singletonList(orderDetail));
            if (massagistId != null && !massagistId.equals(oldMassagistId)) {
                updateMassagistSort(Collections.singletonList(orderDetail), DateUtil.toYYYYMMDD(startDateTime), orderDetail.getShopId());
            }
            return jsonObject;
        }
    }

    /**
     * 改单弹窗原地更新：只换到店日期/时间、床位、疗愈师（改单弹窗没有人数、项目、时长字段，金额不变）。
     * 因此不删明细行、不重建，保留明细 id、到店状态、排序与金额归属，避免"改个时间把单搞乱"。
     * 已到店/已完成的行保持原样（只跟随支付方式）。
     *
     * @param orderDetails 订单现有明细（含已到店行）
     * @param startDateTime 改单弹窗里的到店时间
     * @param bedIdList     改单弹窗勾选的床位（为空表示不改床位）
     * @param massagistIdList 改单弹窗勾选的疗愈师（null 表示没传、保留原值；空集合表示运营清空了疗愈师）
     * @param shopId        改单弹窗里的门店（为空表示不改门店）
     */
    @Transactional(rollbackFor = Exception.class)
    public void applyOrderEdit(List<OrderDetail> orderDetails, LocalDateTime startDateTime,
                               List<Long> bedIdList, List<Long> massagistIdList, Long shopId) {
        if (CollectionUtils.isEmpty(orderDetails) || startDateTime == null) {
            return;
        }
        List<OrderDetail> details = orderDetails.stream()
                .filter(Objects::nonNull)
                .sorted(Comparator.comparing(OrderDetail::getId))
                .collect(Collectors.toList());
        for (int i = 0; i < details.size(); i++) {
            OrderDetail detail = details.get(i);
            if (isServedDetail(detail) || isFinishedState(detail.getState())) {
                continue;
            }
            Long targetBedId = pickByIndex(bedIdList, i);
            boolean massagistProvided = massagistIdList != null;
            Long targetMassagistId = massagistProvided ? pickByIndex(massagistIdList, i) : detail.getMassagistId();
            editDetailInPlace(detail, startDateTime, targetBedId, targetMassagistId, massagistProvided, shopId);
        }
    }

    /** 多人单已拆单，一般只有一行；按下标对齐勾选项，缺失时保留原值。 */
    private Long pickByIndex(List<Long> list, int index) {
        if (CollectionUtils.isEmpty(list) || index < 0 || index >= list.size()) {
            return null;
        }
        return list.get(index);
    }

    /**
     * 单行原地更新：时间/床位/疗愈师。只校验本次真正变化的资源，冲突时直接报错并说明被哪条单挡住。
     */
    private void editDetailInPlace(OrderDetail orderDetail, LocalDateTime startDateTime, Long bedId,
                                   Long massagistId, boolean massagistProvided, Long shopId) {
        Long oldBedId = orderDetail.getBedId();
        Long oldMassagistId = orderDetail.getMassagistId();
        LocalDateTime oldStart = orderDetail.getStartTime();
        Long oldShopId = orderDetail.getShopId();
        Long targetShopId = shopId != null ? shopId : oldShopId;
        Integer duration = orderDetail.getDuration() == null ? 0 : orderDetail.getDuration();

        boolean timeChanged = !startDateTime.equals(oldStart);
        boolean bedChanged = bedId != null && !bedId.equals(oldBedId);
        boolean massagistChanged = massagistProvided && !Objects.equals(massagistId, oldMassagistId);
        boolean shopChanged = !Objects.equals(targetShopId, oldShopId);
        if (!timeChanged && !bedChanged && !massagistChanged && !shopChanged) {
            return;
        }
        Long effectiveBedId = bedId != null ? bedId : oldBedId;
        LocalDateTime endDateTime = DateUtil.addTimeByMinutes(startDateTime, duration);
        String date = DateUtil.toYYYYMMDD(startDateTime);
        boolean dateChanged = oldStart == null || !date.equals(DateUtil.toYYYYMMDD(oldStart));

        Bed bed = effectiveBedId != null ? bedService.getById(effectiveBedId) : null;
        if (bed != null && NormalState.INVALID.getValue().equals(bed.getStatus())) {
            throw new BusinessException(bed.getName() + "床位已经被关闭了");
        }
        String key = "lockKey" + targetShopId;
        synchronized (key.intern()) {
            //床位占用：15 分钟整理期只约束不同客户，同一客户紧接着的加钟段不算冲突
            if (effectiveBedId != null && (bedChanged || timeChanged || shopChanged)) {
                throwIfOccupied(
                        withoutOwnContinuation(findOverlappingSchedules(targetShopId, null, effectiveBedId,
                                startDateTime, endDateTime, orderDetail.getId()), orderDetail.getCustomerId(), startDateTime),
                        "床位「" + (bed != null ? bed.getName() : effectiveBedId) + "」");
            }
            if (massagistId != null && (massagistChanged || timeChanged || shopChanged)) {
                String massagistName = massagistService.findNameById(massagistId);
                throwIfOccupied(findOverlappingSchedules(targetShopId, massagistId, null,
                                startDateTime, endDateTime, orderDetail.getId()),
                        "疗愈师「" + (massagistName != null ? massagistName : massagistId) + "」");
            }
            //轮到序号的还原：换天/换技师后先撤掉旧的轮次占用，再按新时间重排
            if (dateChanged || massagistChanged) {
                recoverSortId(Collections.singletonList(orderDetail),
                        dateChanged ? RoundScheduleState.UPDATE_DATE : RoundScheduleState.UPDATE);
            }
            if (massagistChanged && !ObjectUtils.isEmpty(orderDetail.getSpecifyType())) {
                orderDetail.setSpecifyType(0);
            }
            if (bedId != null) {
                orderDetail.setBedId(bedId);
                orderDetail.setIsLockBed(true);
            }
            if (massagistProvided) {
                orderDetail.setMassagistId(massagistId);
            }
            orderDetail.setShopId(targetShopId);
            orderDetail.setStartTime(startDateTime);
            orderDetail.setEndTime(endDateTime);
            updateById(orderDetail);
            extendShifts(Collections.singletonList(orderDetail));
            if (orderDetail.getMassagistId() != null && (massagistChanged || timeChanged || shopChanged)) {
                updateMassagistSort(Collections.singletonList(orderDetail), date, targetShopId);
            }
        }
    }

    /** 同一客户在同一床位上的连续服务（加钟）不占用 15 分钟整理期。 */
    private List<OrderDetail> withoutOwnContinuation(List<OrderDetail> conflicts, Long customerId, LocalDateTime start) {
        if (CollectionUtils.isEmpty(conflicts)) {
            return conflicts;
        }
        return conflicts.stream()
                .filter(d -> !BookingAvailability.sameCustomerContinuation(customerId, start, d))
                .collect(Collectors.toList());
    }

    /** 已完成/已取消：明细已进终态，看板上的拖动只是运营的事后调整。 */
    private boolean isFinishedState(Integer state) {
        return AppointmentState.FINISHED.getValue().equals(state)
                || AppointmentState.CANCELED.getValue().equals(state);
    }

    /**
     * 拖动落点的占用明细：同门店当天、状态 0/1/2 的明细，按半开区间判重叠（首尾相接不算冲突）。
     * 已取消的单不占位；未来日期的已完成单不占位（与建单口径一致），当天已过去的已完成单仍然占位，
     * 避免新单叠在已服务的疗愈师明细上把它盖住。massagistId / bedId 只按传入的一项校验。
     */
    private List<OrderDetail> findOverlappingSchedules(Long shopId, Long massagistId, Long bedId,
                                                       LocalDateTime start, LocalDateTime end, Long excludeId) {
        if (start == null || end == null || (massagistId == null && bedId == null)) {
            return Collections.emptyList();
        }
        // 按时段查交集，跨零点单的次日凌晨段才不会漏判
        List<OrderDetail> detailList = findOccupiedDetails(shopId, start, end);
        if (CollectionUtils.isEmpty(detailList)) {
            return Collections.emptyList();
        }
        List<OrderDetail> conflicts = new ArrayList<>();
        for (OrderDetail d : detailList) {
            if (d == null || d.getId() == null) {
                continue;
            }
            if (excludeId != null && excludeId.equals(d.getId())) {
                continue;
            }
            if (AppointmentState.CANCELED.getValue().equals(d.getState())) {
                continue;
            }
            if (massagistId != null && !massagistId.equals(d.getMassagistId())) {
                continue;
            }
            if (massagistId == null && !bedId.equals(d.getBedId())) {
                continue;
            }
            if (!BookingAvailability.overlaps(start, end, d.getStartTime(), d.getEndTime(), 0)) {
                continue;
            }
            conflicts.add(d);
        }
        return conflicts;
    }

    /** 落点被占用时直接让本次拖动失败，并说清是哪条单挡住了，便于运营先调整它。 */
    private void throwIfOccupied(List<OrderDetail> conflicts, String resourceLabel) {
        if (CollectionUtils.isEmpty(conflicts)) {
            return;
        }
        OrderDetail occupied = conflicts.get(0);
        String range = occupied.getStartTime().toLocalTime() + "~" + occupied.getEndTime().toLocalTime();
        throw new BusinessException(resourceLabel + " " + range + " 已有预约，本次拖动没有生效，请先调整原来那单或换个时段");
    }

    /**
     * 预约时间窗口内的订单id
     * 明细在窗口内开始，或昨日/更早开始但仍在窗口内服务（跨零点），都算命中
     *
     * @param startAppointmentTime 窗口起点
     * @param endAppointmentTime   窗口终点
     */
    public List<Long> orderIdListByStartTime(Object startAppointmentTime, Object endAppointmentTime) {
        String start = startAppointmentTime.toString();
        String end = endAppointmentTime.toString();
        LambdaQueryWrapper<OrderDetail> lqw = new LambdaQueryWrapper<>();
        lqw.select(OrderDetail::getOrderId);
        lqw.and(w -> w.between(OrderDetail::getStartTime, start, end)
                .or(n -> n.lt(OrderDetail::getStartTime, start).gt(OrderDetail::getEndTime, start)));
        List<OrderDetail> list = list(lqw);
        if (!CollectionUtils.isEmpty(list)) {
            return list.stream().map(OrderDetail::getOrderId).distinct().collect(Collectors.toList());
        }
        return Collections.emptyList();
    }

    public List<Long> listByReceptionDateTime(LocalDateTime time, LocalDateTime time1, Long shopId) {
        LambdaQueryWrapper<OrderDetail> lqw = new LambdaQueryWrapper<>();
        lqw.select(OrderDetail::getMassagistId);
        lqw.ne(OrderDetail::getState, AppointmentState.CANCELED.getValue());
        lqw.lt(OrderDetail::getStartTime, time1);
        lqw.gt(OrderDetail::getEndTime, time);
        List<OrderDetail> list = list(lqw);
        if (CollectionUtils.isEmpty(list)) {
            list = new ArrayList<>();
        }
        LocalTime startTime = time.toLocalTime();
        LocalTime endTime = time1.toLocalTime();
        //找到已经排班的
        List<Long> bookedMassagistIds = list.stream().map(OrderDetail::getMassagistId).collect(Collectors.toList());
        //找到上班的技师
        List<Long> allMassagistList = massagistSchedulesService.massagistListByTime(time.toLocalDate(), startTime, endTime, shopId);
        if (CollectionUtils.isEmpty(allMassagistList)) {
            return Collections.emptyList();
        }
        //得到空闲的技师
        List<Long> availableMassagistList = allMassagistList.stream()
                .filter(id -> !bookedMassagistIds.contains(id))
                .collect(Collectors.toList());
        return availableMassagistList;
    }

    /**
     * 构建订单详情
     *
     * @param orderDetailDto
     */
    public void createReceptionDetail(OrderDetailDto orderDetailDto) {
        Long shopId = orderDetailDto.getShopId();
        String key = "lockKey" + shopId;
        synchronized (key.intern()) {
            Long projectId = projectService.getReceptionProjectId();
            LocalDateTime startTime = orderDetailDto.getStartTime();
            List<OrderDetail> detailList = buildReceptionDetailList(orderDetailDto.getShopId(), projectId, startTime,
                    orderDetailDto.getDurationMinutes(),
                    orderDetailDto.getMassagistIdList(), orderDetailDto.getOrderId(), orderDetailDto.getIsUpdateSort());
            saveBatch(detailList);
            if (orderDetailDto.getIsUpdateSort()) {
                updateMassagistSort(detailList, DateUtil.toYYYYMMDD(startTime), shopId);
            }
        }
    }

    public List<OrderDetail> buildReceptionDetailList(Long shopId, Long projectId, LocalDateTime startTime, Integer durationMinutes, List<Long> massgistIdList, Long orderId, Boolean isUpdateSort) {
        if (shopId == null) {
            shopId = 1L;
        }
        Shop shop = shopService.findAvailableById(shopId);
        if (shop == null) {
            throw new BusinessException("抱歉，门店不可用");
        }
        Integer personCount = 1;
        if (!CollectionUtils.isEmpty(massgistIdList)) {
            personCount = massgistIdList.size();
        }
        String date = DateUtil.toYYYYMMDD(startTime);
        List<MassagistSchedules> allMassagistList = massagistSchedulesService.simpleListByDateAndShopId(date, shopId);
        if (CollectionUtils.isEmpty(allMassagistList)) {
            log.error("查询到店时间失败，没有疗愈师排班数据，date={}", date);
            throw new BusinessException("抱歉，没有疗愈师排班数据");
        } else if (personCount > allMassagistList.size()) {
            throw new BusinessException("抱歉，疗愈师不满足人数要求");
        }
        List<OrderDetail> detailList = findOccupiedDetails(shopId, startTime, durationMinutes);
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
        // 空余疗愈师列表
        List<MassagistSchedules> availableMassagistList = new ArrayList<>();
        // 空余疗愈师列表
        List<MassagistSchedules> availableMassagistListNot = new ArrayList<>();
        allMassagistList.forEach(m -> {
            // 已约疗愈师
            List<OrderDetail> massagistDetailList = massagistDetailMap.get(m.getMassagistId());
            boolean isAvailable;
            if (DateUtil.toHHmm(m.getStartTime()).compareTo(DateUtil.toHHmm(startTime)) > 0
                    || DateUtil.toHHmm(m.getEndTime()).compareTo(DateUtil.toHHmm(endTime)) < 0) {
                log.info("技师id={},{}", m.getMassagistId(), "不在排班时间");
                isAvailable = false;
            } else if (CollectionUtils.isEmpty(massagistDetailList)) {
                isAvailable = true;
            } else {
                isAvailable = massagistDetailList.stream().noneMatch(d ->
                        BookingAvailability.overlaps(startTime, endTime, d.getStartTime(), d.getEndTime(), 0));
                if (!isAvailable) {
                    log.info("技师id={},{}", massagistService.findNameById(m.getMassagistId()), "时间冲突");
                }
            }
            if (isAvailable) {
                availableMassagistList.add(m);
            }else {
                availableMassagistListNot.add(m);
            }
        });



        //不提前分配技师，需要验证此时此刻此项目订单量和技师数量是否匹配
        //同一时刻的所有订单量不能大于技师上班人数
        //detailList   allMassagistList
        int count=0;
        //需要增加判断开始下单时间以后的每个15分钟内的订单量
        List<MassagistSchedules> allPeople = massagistSchedulesService.getBaseMapper().findListByProjectIdAndShopId(shopId, "%%", date);
        List<MassagistSchedules> projectAllPeople = massagistSchedulesService.getBaseMapper().findListByProjectIdAndShopId(shopId, "%"+projectId+"%", date);
        //去掉不在此工作时间的技师

        /*allPeople.forEach(m->{if((m.getStartTime().isBefore(startTime.toLocalTime())||m.getStartTime().equals(startTime.toLocalTime()) )&& (m.getEndTime().isAfter(endTime.toLocalTime())||m.getEndTime().equals(endTime.toLocalTime()))){
            allPeopleCountNew.add(m);
        }});*/



        for(int i = 1; i <= (durationMinutes / 15); i++){
            LocalDateTime startTimeCheck =startTime.plusMinutes((i-1)*15) ;
            LocalDateTime endTimeCheck = startTime.plusMinutes(i * 15);

            List<MassagistSchedules> allPeopleCountNew = new ArrayList<>();
            allPeople.forEach(m->{
                // 判断预约开始时间是否不早于疗愈师上班时间 (>=)
                boolean isAfterStart = !startTimeCheck.toLocalTime().isBefore(m.getStartTime());
                // 判断预约开始时间是否不晚于疗愈师下班时间 (<=)
                boolean isBeforeEnd = startTimeCheck.toLocalTime().isBefore(m.getEndTime());
                if (isAfterStart && isBeforeEnd) {
                    // 显示疗愈师
                    allPeopleCountNew.add(m);
                }
            });
            ;

            count=personCount;
            //count=0;

            if(detailList!=null && detailList.size()>0){

                LocalDateTime dtt=startTimeCheck;
                List<OrderDetail> startAndEndList= detailList.stream().filter(e -> e.getStartTime().equals(dtt) || e.getEndTime().equals(dtt)).filter(t->t.getMassagistId()!=null&&t.getProjectId()!=3).collect(Collectors.toList());
                //startAndEndList  以massagistid 分组，获取每组的集合,并找到集合数据大于2的组合；
                Map<Long, List<OrderDetail>> startAndEndListGroupByMassagistId = startAndEndList.stream().collect(Collectors.groupingBy(OrderDetail::getMassagistId));
                Map<Long, List<OrderDetail>> result = startAndEndListGroupByMassagistId.entrySet().stream()
                        .filter(entry -> entry.getValue().size() >= 2)
                        .collect(Collectors.toMap(
                                Map.Entry::getKey,   // Key 保持不变
                                Map.Entry::getValue  // Value 保持不变
                        ));

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
                count=count-result.size();
            }
            if(count>allPeopleCountNew.size()){
                throw new BusinessException("抱歉，疗愈师不满足人数要求!");
            }
        }

        List<Long> availableMassagistIdList = availableMassagistList.stream().map(MassagistSchedules::getMassagistId).collect(Collectors.toList());
        // 空闲疗愈师排序
        List<Long> sortedMassagistIdList = sortMassagist(availableMassagistIdList, startTime, endTime, shopId, personCount);

        //疗愈师接待情况
        Map<Long, Integer> projectCountMap = detailList.stream().filter(s -> projectId.equals(s.getProjectId())).collect(Collectors.groupingBy(OrderDetail::getMassagistId, Collectors.collectingAndThen(Collectors.toList(), List::size)));

        //定义可以接单的列表
        List<Long> userJiedan=new ArrayList<>();
        //定义不可以接单的列表
        List<Long> userNotJiedan=new ArrayList<>();
        //获取排班列表顺序
        sortedMassagistIdList= massagistSchedulesService.getMassagistSchedulesList(date, shopId);
        sortedMassagistIdList.forEach(id -> {
            if(availableMassagistIdList.contains(id)){
                userJiedan.add(id);
            }else {
               /* if(!availableMassagistListNot.contains(id)){
                    userNotJiedan.add(id);
                }*/
            }
        });
        //userJiedan和userNotJiedan 相加
        userJiedan.addAll(userNotJiedan);
        //availableMassagistIdList循环里面的数据
        for (Long m : availableMassagistIdList) {
            if(!userJiedan.contains(m)){
                userJiedan.add(m);
            }
        }
        if(userJiedan.size()==0){
            throw new BusinessException("抱歉，疗愈师不满足人数要求!");
        }
        //根据接待情况再调整一次排序
        List<Long> finalSortedMassagistIdList = userJiedan;
        final  Long shopIdFinal=shopId;
        sortedMassagistIdList = userJiedan.stream()
                .sorted((id1, id2) -> {
                    // 获取两个疗愈师的接单数（默认0）
                    int count1 = projectCountMap.getOrDefault(id1, 0);
                    int count2 = projectCountMap.getOrDefault(id2, 0);
                    //id1 获取此人是否全天上班，不是全天上班的话，需要获取上班时间前  最小接待轮次
                  //  count1=count1+GetCountNumber(id1,startTime,shopIdFinal);
                    //id2 获取此人是否全天上班，不是全天上班的话，需要获取上班时间前  最小接待轮次
                  //  count2=count2+GetCountNumber(id2,startTime,shopIdFinal);
                    // 接单数少的排前面（若需接单数多的排前面，此处用 count2 - count1 即可）
                    if (count1 != count2) {
                        return Integer.compare(count1, count2);
                    } else {
                        // 接单数相同时，保持原列表中的顺序（原排序作为第二顺位）
                        return Integer.compare(finalSortedMassagistIdList.indexOf(id1), finalSortedMassagistIdList.indexOf(id2));
                    }
                })
                .collect(Collectors.toList());

        if (!CollectionUtils.isEmpty(massgistIdList)) {
            // 如果还不足够人数，从availableMassagistList补充
            if (massgistIdList.size() < personCount) {
                int remainingCount = personCount - massgistIdList.size();
                for (int i = 0; i < remainingCount; i++) {
                    if (sortedMassagistIdList.size() < remainingCount) {
                        continue;
                    }
                    Long massagistId = sortedMassagistIdList.get(i);
                    if (massagistId != null && !massgistIdList.contains(massagistId)) {
                        massgistIdList.add(massagistId);
                    }
                }
            }
        } else {
            if (personCount <= sortedMassagistIdList.size()) {
                massgistIdList = sortedMassagistIdList;
            } else {
                for (Long massgistId : sortedMassagistIdList) {
                    if (massgistId != null && !massgistIdList.contains(massgistId)) {
                        massgistIdList.add(massgistId);
                    }
                }
            }
        }
        int massagistRemainingCount = personCount - massgistIdList.size();
        if (massagistRemainingCount > 0) {
            List<Long> allMassagistIdList = allMassagistList.stream().map(MassagistSchedules::getMassagistId).collect(Collectors.toList());
            allMassagistIdList = sortMassagist(allMassagistIdList, startTime, endTime, shopId, personCount);
            for (Long massgistId : allMassagistIdList) {
                if (massgistId != null && !massgistIdList.contains(massgistId)) {
                    massgistIdList.add(massgistId);
                }
            }
        }

        List<OrderDetail> orderDetailList = new ArrayList<>(personCount);
        for (int i = 0; i < personCount; i++) {
            Long massagistId = massgistIdList.get(i);
            OrderDetail detail = new OrderDetail();
            detail.setShopId(shopId);
            detail.setProjectId(projectId);
            detail.setMassagistId(massagistId);
            detail.setDuration(durationMinutes);
            detail.setStartTime(startTime);
            detail.setEndTime(DateUtil.addTimeByMinutes(startTime, durationMinutes));
            detail.setOrderId(orderId);
            detail.setIsUpdateSort(isUpdateSort);
            orderDetailList.add(detail);
        }
        return orderDetailList;
    }

    //处理接待问题，如果技师不是全天上班时，根据技师的上班时间获取上班前的最小接待数量
    public int GetCountNumber(Long massagistId, LocalDateTime startTime, Long shopId) {
        //获取技师当天的上班时间
        List<MassagistSchedules> massagistSchedulesList = massagistSchedulesService.listByMassagistIdAndShopIdAndDate(massagistId, shopId, LocalDate.from(startTime));
        if(massagistSchedulesList.size()>0){
            //massagistSchedulesList 集中获取start_time最小的数据列
            MassagistSchedules massagistSchedules = massagistSchedulesList.stream().min(Comparator.comparing(MassagistSchedules::getStartTime)).get();
            //获取当前店铺内的所有接待订单
            String startTimeNew=massagistSchedules.getDay().toString()+" "+"00:00:00";
            String endTimeNew=massagistSchedules.getDay().toString()+" "+massagistSchedules.getStartTime().toString()+":00";
            DateTimeFormatter formatter = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
            LocalDateTime aStart=LocalDateTime.parse(startTimeNew, formatter);
            LocalDateTime aEnd=LocalDateTime.parse(endTimeNew, formatter);
            LambdaQueryWrapper<OrderDetail> lqw = new LambdaQueryWrapper<>();
            lqw.in(OrderDetail::getState, 1,2);
            lqw.eq(OrderDetail::getProjectId, 3);
            lqw.gt(OrderDetail::getStartTime, aStart);
            lqw.lt(OrderDetail::getStartTime,aEnd);
            lqw.eq(OrderDetail::getShopId, shopId);
            List<OrderDetail> list = list(lqw);
            if(list.size()>0){
                //list中OrderDetail表的数据，以字段massagistId分组，显示对应的数量，获取最小值
                Long count = list.stream().collect(Collectors.groupingBy(OrderDetail::getMassagistId, Collectors.counting())).values().stream().max(Long::compareTo).get();
               // int count = list.stream().collect(Collectors.groupingBy(OrderDetail::getMassagistId, Collectors.counting())).values().stream().min(Integer::compareTo).get();
                int i=0;
                return Math.toIntExact(count);

                //Map<Long, Long> countMap = list.stream().collect(Collectors.groupingBy(OrderDetail::getMassagistId, Collectors.counting()));
            }
        }
        //boolean isAllDay = massagistService.isAllDay(massagistId, startTime, shopId);
        //只处理不是全天上班的技师
        return  0;
    }

    /**
     * 详情绑定项目系数
     *
     * @param list
     */
    public void buildCoefficient(List<OrderDetail> list) {
        if (CollectionUtils.isEmpty(list)) {
            return;
        }
        List<Long> projectIdList = list.stream().filter(e -> !ObjUtil.isEmpty(e.getProjectId())).map(OrderDetail::getProjectId).collect(Collectors.toList());
        if (CollectionUtils.isEmpty(projectIdList)) {
            return;
        }
        List<Project> projectList = projectService.listByIds(projectIdList);
        if (CollectionUtils.isEmpty(projectList)) {
            return;
        }
        Map<Long, BigDecimal> projectMap = projectList.stream().collect(Collectors.toMap(Project::getId, Project::getCoefficient));
        list.forEach(e -> {
            e.setCoefficient(projectMap.getOrDefault(e.getProjectId(), BigDecimal.ONE));
            e.setWorkingHours(
                    e.getCoefficient()
                            .multiply(BigDecimal.valueOf(e.getDuration()))
                            .setScale(2, RoundingMode.HALF_UP).doubleValue()
            );
            //e.setWorkingHours(e.getCoefficient().multiply( BigDecimal.valueOf(e.getDuration())).setScale(2, RoundingMode.HALF_UP));
        });
    }

    /**
     * 获取正常床位
     *
     * @param startTime
     * @param projectId
     * @param durationMinutes
     * @param shopId
     * @return
     */
    public Long findAvailableBedId(LocalDateTime startTime, Long projectId, Integer durationMinutes, Long shopId) {
        return findAvailableBedId(startTime, projectId, durationMinutes, shopId, null);
    }

    /**
     * @param customerId 客户 id：同一客户在同一床位的连续服务（加钟）不占用 15 分钟整理期
     */
    public Long findAvailableBedId(LocalDateTime startTime, Long projectId, Integer durationMinutes, Long shopId, Long customerId) {
        Project project = projectService.getById(projectId);
        if (project == null) {
            log.error("查询正常床位失败，所有项目不可用");
            return null;
        }
        List<Bed> allBedList = bedService.listByStatusAndTypeAndShopId(NormalState.EFFECTIVE.getValue(), project.getType(), shopId);
        if (CollectionUtils.isEmpty(allBedList)) {
            log.error("查询正常床位失败，所有床位状态不可用");
            return null;
        }
        String date = DateUtil.toYYYYMMDD(startTime);
        List<OrderDetail> detailList = findOccupiedDetails(shopId, startTime, durationMinutes);
        Map<Long, List<OrderDetail>> bedDetailMap = new HashMap<>(detailList.size());
        Map<Long, List<OrderDetail>> massagistDetailMap = new HashMap<>(detailList.size());
        detailList.forEach(d -> {
            if (projectId.equals(d.getProjectId())) {
                List<OrderDetail> bedDetailList = bedDetailMap.get(d.getBedId());
                if (bedDetailList == null) {
                    bedDetailList = new ArrayList<>();
                }
                bedDetailList.add(d);
                bedDetailMap.put(d.getBedId(), bedDetailList);
            }
            List<OrderDetail> massagistDetailList = massagistDetailMap.get(d.getMassagistId());
            if (massagistDetailList == null) {
                massagistDetailList = new ArrayList<>();
            }
            massagistDetailList.add(d);
            massagistDetailMap.put(d.getMassagistId(), massagistDetailList);
        });
        LocalDateTime endTime = DateUtil.addTimeByMinutes(startTime, durationMinutes);
        // 空余床位列表
        List<Bed> availableBedList = new ArrayList<>();
        allBedList.forEach(bed -> {
            List<OrderDetail> bedDetailList = bedDetailMap.get(bed.getId());
            boolean isAvailable;
            if (CollectionUtils.isEmpty(bedDetailList)) {
                isAvailable = true;
            } else {
                // 床位需要 15 分钟整理时间：上一单结束后 15 分钟内不再接单，下一单开始前 15 分钟内也不接
                isAvailable = bedDetailList.stream().noneMatch(d ->
                        BookingAvailability.bedOccupied(startTime, endTime, d, customerId));
            }
            if (isAvailable) {
                availableBedList.add(bed);
            }
        });
        if (CollectionUtils.isEmpty(availableBedList)) {
            return null;
        }
        return availableBedList.get(0).getId();
    }

    public void buildOrderType(List<OrderDetail> list) {
        if (CollectionUtils.isEmpty(list)) {
            return;
        }
        List<Long> orderIdList = list.stream().filter(e -> !ObjUtil.isEmpty(e.getOrderId())).map(OrderDetail::getOrderId).collect(Collectors.toList());
        if (CollectionUtils.isEmpty(orderIdList)) {
            return;
        }
        List<Order> orderList = orderService.listByIds(orderIdList);
        if (CollectionUtils.isEmpty(orderList)) {
            return;
        }
        Map<Long, Integer> orderMap = orderList.stream().collect(Collectors.toMap(Order::getId, Order::getType));
        list.forEach(e -> e.setType(orderMap.getOrDefault(e.getOrderId(), 0)));
    }
    public List<OrderDetail> getOrderByMassagistId(long massagistId, LocalDateTime startTime, LocalDateTime endTime) {
        LambdaQueryWrapper<OrderDetail> lqw = new LambdaQueryWrapper<>();
        lqw.eq(OrderDetail::getMassagistId, massagistId);
        lqw.in(OrderDetail::getState, 0,1); //1标识进行中的
        lqw.and(w ->w.and(w1 ->
                w1.lt(OrderDetail::getStartTime, startTime).gt(OrderDetail::getEndTime,endTime)).
                or(w2 ->
                        w2.gt(OrderDetail::getStartTime, startTime).lt(OrderDetail::getEndTime, endTime)).
                or(w2 ->
                        w2.le(OrderDetail::getStartTime, startTime).gt(OrderDetail::getEndTime, startTime)).
                or(w2 ->
                        w2.lt(OrderDetail::getStartTime, endTime).gt(OrderDetail::getEndTime, endTime)).
                or(w2 ->
                        w2.eq(OrderDetail::getStartTime, startTime).eq(OrderDetail::getEndTime, endTime))
        );
        /*lqw.between(OrderDetail::getStartTime, startTime, endTime);
        lqw.between(OrderDetail::getEndTime, startTime, endTime);*/

        return getBaseMapper().selectList(lqw);

    }

    /**
     * luxin新增；点击到店后，给未分配技师的订单分配技师
     */
    public long getCustmerArriverShopDivideMessageId(long shopId,long projectId, LocalDateTime startTime, int durationMinutes, int personCount) {
        return getCustmerArriverShopDivideMessageId(shopId, projectId, startTime, durationMinutes, personCount, null);
    }

    /**
     * 自动分配疗愈师，支持"优先疗愈师"（加钟单优先安排被加钟单的疗愈师，其余仍按轮牌顺序）。
     *
     * @param preferredMassagistIdList 优先疗愈师id列表，按优先级从高到低；在空闲列表内时排在轮牌排序结果最前面
     */
    public long getCustmerArriverShopDivideMessageId(long shopId,long projectId, LocalDateTime startTime, int durationMinutes, int personCount, List<Long> preferredMassagistIdList) {

        Shop shop = shopService.findAvailableById(shopId);
        if (shop == null) {
            throw new BusinessException("抱歉，门店不可用");
        }
        Integer bedType = projectService.findTypeById(projectId);
        if (bedType == null) {
            throw new BusinessException("项目类型有误");
        }
        String date = DateUtil.toYYYYMMDD(startTime);

        List<MassagistSchedules> allMassagistList = massagistSchedulesService.getBaseMapper().findListByProjectIdAndShopId(shopId,"%"+projectId+"%",date);
        if (CollectionUtils.isEmpty(allMassagistList)) {
            log.error("查询到店时间失败，没有疗愈师排班数据，date={}", date);
            throw new BusinessException("抱歉，没有疗愈师排班数据");
        } else if (personCount > allMassagistList.size()) {
            throw new BusinessException("抱歉，疗愈师不满足人数要求");
        }
        List<OrderDetail> detailList = findOccupiedDetails(shopId, startTime, durationMinutes);
        Map<Long, List<OrderDetail>> massagistDetailMap = new HashMap<>(detailList.size());
        detailList.forEach(d -> {
            //luxin新增，当项目为全感项目时，把采耳项目加进来，并且采耳项目id为4
            List<OrderDetail> massagistDetailList = massagistDetailMap.get(d.getMassagistId());
            if (massagistDetailList == null) {
                massagistDetailList = new ArrayList<>();
            }
            massagistDetailList.add(d);
            massagistDetailMap.put(d.getMassagistId(), massagistDetailList);
        });
        LocalDateTime endTime = DateUtil.addTimeByMinutes(startTime, durationMinutes);

        // 空余疗愈师列表
        List<MassagistSchedules> availableMassagistList = new ArrayList<>();
        allMassagistList.forEach(m -> {
            // 已约疗愈师
            List<OrderDetail> massagistDetailList = massagistDetailMap.get(m.getMassagistId());
            boolean isAvailable;

            //增加22:00点之前都可以下单，将技师下边时间往后调整1小时
            if(shop.getClockOutTime().equals(DateUtil.toHHmm(m.getEndTime()).toString())){
                LocalDateTime lt=m.getEndTime().atDate(LocalDate.now());
                m.setEndTime(DateUtil.addTimeByMinutes(lt, 119).toLocalTime());
            }

            if (DateUtil.toHHmm(m.getStartTime()).compareTo(DateUtil.toHHmm(startTime)) > 0
                    || DateUtil.toHHmm(m.getEndTime()).compareTo(DateUtil.toHHmm(endTime)) < 0) {
                log.info("技师id={},{}", m.getMassagistId(), "不在排班时间");
                isAvailable = false;
            } else if (CollectionUtils.isEmpty(massagistDetailList)) {
                isAvailable = true;
            } else {
                isAvailable = massagistDetailList.stream().noneMatch(d ->
                        BookingAvailability.overlaps(startTime, endTime, d.getStartTime(), d.getEndTime(), 0));
                if (!isAvailable) {
                    log.info("技师id={},{}", m.getMassagistId(), "时间冲突");
                }
            }
            if (isAvailable) {
                availableMassagistList.add(m);
            }
        });

        //luxin增加下单人数是否大于空闲技师人数，大于抛出异常
        if(availableMassagistList.size() < personCount){
            throw new BusinessException("抱歉，暂时没有空闲的疗愈师!");
        }

        // 过滤脏数据：排班表里可能出现空值/0/-1 这类非法疗愈师id，不能带进排序，更不能写回订单
        List<Long> availableMassagistIdList = availableMassagistList.stream()
                .map(MassagistSchedules::getMassagistId)
                .filter(Objects::nonNull)
                .filter(massagistId -> massagistId > 0)
                .distinct()
                .collect(Collectors.toList());
        if (CollectionUtils.isEmpty(availableMassagistIdList)) {
            throw new BusinessException("抱歉，暂时没有空闲的疗愈师!");
        }
        // 空闲疗愈师排序
        List<Long> sortedMassagistIdList = sortMassagist(availableMassagistIdList, startTime, endTime, shopId, personCount);
        //加钟单优先安排被加钟单的疗愈师：只要他此刻空闲就排到最前面，其余疗愈师顺序不变
        sortedMassagistIdList = prioritizeMassagistIdList(sortedMassagistIdList, preferredMassagistIdList);
        Long massagistId = CollectionUtils.isEmpty(sortedMassagistIdList) ? null : sortedMassagistIdList.get(0);
        // 兜底校验：排序结果必须是一个真实存在的疗愈师，否则宁可报错回滚，也不写 0/-1 这类脏数据（前端会因此一直显示"未安排"）
        if (massagistId == null || massagistId <= 0 || massagistService.getById(massagistId) == null) {
            log.error("一键安排疗愈师失败，排序结果不可用，shopId={}, projectId={}, startTime={}, availableMassagistIdList={}, sortedMassagistIdList={}",
                    shopId, projectId, startTime, availableMassagistIdList, sortedMassagistIdList);
            throw new BusinessException("抱歉，暂时没有可安排的疗愈师，请检查疗愈师排班后重试");
        }
        return massagistId;
    }

    /**
     * 把优先疗愈师提到排序结果最前面（只保留确实在可用列表里的），其余疗愈师顺序不变
     */
    private List<Long> prioritizeMassagistIdList(List<Long> sortedMassagistIdList, List<Long> preferredMassagistIdList) {
        if (CollectionUtils.isEmpty(preferredMassagistIdList) || CollectionUtils.isEmpty(sortedMassagistIdList)) {
            return sortedMassagistIdList;
        }
        List<Long> result = new ArrayList<>(sortedMassagistIdList.size());
        for (Long preferredId : preferredMassagistIdList) {
            if (preferredId != null && preferredId > 0 && sortedMassagistIdList.contains(preferredId) && !result.contains(preferredId)) {
                result.add(preferredId);
            }
        }
        for (Long massagistId : sortedMassagistIdList) {
            if (!result.contains(massagistId)) {
                result.add(massagistId);
            }
        }
        log.info("加钟优先疗愈师排序：preferred={}, available={}, result={}", preferredMassagistIdList, sortedMassagistIdList, result);
        return result;
    }

    /**
     * 加钟来源疗愈师：加钟单应当优先安排"被加钟那一单"的疗愈师。
     * 优先按加钟单上的 fromOrderId 找原单；小程序没传时按"同一客户、同门店、上一单结束时间正好是本单开始时间"推断。
     *
     * @return 来源明细上的疗愈师id（同床位、结束时间正好衔接的排在前面），没有则返回空列表
     */
    public List<Long> findAddSourceMassagistIdList(OrderDetail detail) {
        if (detail == null || detail.getStartTime() == null) {
            return Collections.emptyList();
        }
        List<OrderDetail> sourceList;
        Long fromOrderId = detail.getFromOrderId();
        if (fromOrderId != null && fromOrderId > 0) {
            LambdaQueryWrapper<OrderDetail> lqw = new LambdaQueryWrapper<>();
            lqw.eq(OrderDetail::getOrderId, fromOrderId);
            if (detail.getId() != null && detail.getId() > 0) {
                lqw.ne(OrderDetail::getId, detail.getId());
            }
            sourceList = list(lqw);
        } else if (detail.getCustomerId() != null) {
            LambdaQueryWrapper<OrderDetail> lqw = new LambdaQueryWrapper<>();
            lqw.eq(OrderDetail::getCustomerId, detail.getCustomerId())
                    .eq(OrderDetail::getEndTime, detail.getStartTime())
                    .in(OrderDetail::getState, AppointmentState.WAITING.getValue(), AppointmentState.DOING.getValue())
                    .ne(OrderDetail::getProjectId, 3);
            if (detail.getShopId() != null) {
                lqw.eq(OrderDetail::getShopId, detail.getShopId());
            }
            if (detail.getId() != null && detail.getId() > 0) {
                lqw.ne(OrderDetail::getId, detail.getId());
            }
            sourceList = list(lqw);
        } else {
            return Collections.emptyList();
        }
        if (CollectionUtils.isEmpty(sourceList)) {
            return Collections.emptyList();
        }
        //原单可能有多行（多人单）：先挑结束时间正好衔接本单的，再挑同床位的
        List<OrderDetail> sorted = new ArrayList<>(sourceList);
        sorted.sort(Comparator.comparingInt((OrderDetail d) -> Objects.equals(d.getEndTime(), detail.getStartTime()) ? 0 : 1)
                .thenComparingInt(d -> Objects.equals(d.getBedId(), detail.getBedId()) ? 0 : 1)
                .thenComparing(d -> d.getId() == null ? Long.MAX_VALUE : d.getId()));
        List<Long> result = new ArrayList<>();
        for (OrderDetail source : sorted) {
            Long massagistId = source.getMassagistId();
            if (massagistId != null && massagistId > 0 && !result.contains(massagistId)) {
                result.add(massagistId);
            }
        }
        if (!result.isEmpty()) {
            log.info("加钟来源疗愈师：detailId={}, startTime={}, fromOrderId={}, sourceMassagistIdList={}",
                    detail.getId(), detail.getStartTime(), fromOrderId, result);
        }
        return result;
    }

    /**
     修改订单时调用，不用判断床位数量
     */
    @Transactional(rollbackFor = Exception.class)
    public void createDetail0410(OrderDetailDto orderDetailDto, boolean isManage, boolean isCreate) {
        Long shopId = orderDetailDto.getShopId();
        String key = "lockKey" + shopId;
        synchronized (key.intern()) {
            Long productId = orderDetailDto.getProductId();
            List<JSONObject> jsonList = productService.getProductContent(productId);
            List<Long> projectIdList = jsonList.stream().map(s -> s.getLong("projectId")).collect(Collectors.toList());
            if (CollectionUtils.isEmpty(projectIdList)) {
                return;
            }
            projectIdList = projectIdList.stream().distinct().collect(Collectors.toList());
            List<OrderDetail> detailList = new ArrayList<>();
            Long massagistId = orderDetailDto.getMassagistId();
            if (massagistId != null) {
                List<Long> massagistIdList = orderDetailDto.getMassagistIdList();
                if (CollectionUtils.isEmpty(massagistIdList)) {
                    massagistIdList = new ArrayList<>();
                }
                massagistIdList.add(massagistId);
                orderDetailDto.setMassagistIdList(massagistIdList);
            }
            List<OrderDetail> oldOrderDetailList = orderDetailDto.getOldOrderDetails();
            if (!CollectionUtils.isEmpty(oldOrderDetailList)) {
                //已到店/已服务的行不参与重建，避免被换技师或回退成待服务
                List<OrderDetail> editableOldList = oldOrderDetailList.stream()
                        .filter(d -> !isServedDetail(d))
                        .collect(Collectors.toList());
                oldOrderDetailList = editableOldList.isEmpty() ? null : editableOldList;
                orderDetailDto.setOldOrderDetails(oldOrderDetailList);
            }
            if (!CollectionUtils.isEmpty(oldOrderDetailList)) {
                OrderDetail orderDetail = oldOrderDetailList.get(0);
                if (DateUtil.toYYYYMMDD(orderDetail.getStartTime()).compareTo(DateUtil.toYYYYMMDD(orderDetailDto.getStartTime())) != 0) {
                    if(orderDetail.getIsUpdateSort()){
                        recoverSortId(oldOrderDetailList, RoundScheduleState.UPDATE_DATE);
                        orderDetailDto.setOldOrderDetails(null);
                    }
                } else {
                    List<Long> massagistIdList = orderDetailDto.getMassagistIdList();
                    if (!CollectionUtils.isEmpty(massagistIdList)) {
                        if (massagistIdList.contains(orderDetail.getMassagistId())) {
                            recoverSortId(oldOrderDetailList, RoundScheduleState.EXCHANGE);
                        } else {
                            recoverSortId(oldOrderDetailList, RoundScheduleState.UPDATE);
                        }
                    } else {
                        recoverSortId(oldOrderDetailList, RoundScheduleState.UPDATE);
                    }
                }
            }
            LocalDateTime startTime = orderDetailDto.getStartTime();

            Map<Long, Integer> servedByProject = countServedByProject(orderDetailDto.getServedOrderDetails());
            for (Long projectId : projectIdList) {
                int personCount = effectivePersonCount(orderDetailDto.getPersonCount(), servedByProject, projectId);
                if (personCount <= 0) {
                    //该项目的人已经全部到店/服务完毕，保留原明细行即可
                    continue;
                }
                detailList.addAll(pcNoCheckAndBuildOrderList0410(orderDetailDto.getShopId(), projectId, startTime,
                        orderDetailDto.getDurationMinutes(),
                        personCount,
                        orderDetailDto.getMassagistIdList(),
                        orderDetailDto.getBedIdList(),
                        orderDetailDto.getOldOrderDetails(),
                        isCreate, orderDetailDto.getCustomerId()
                ));
            }
            detailList.forEach(s -> {
                s.setOrderId(orderDetailDto.getOrderId());
                s.setCustomerId(orderDetailDto.getCustomerId());
                if (isCreate) {
                    s.setIsUpdateSort(orderDetailDto.getIsUpdateSort());
                }
            });
            if (CollectionUtils.isEmpty(detailList)) {
                return;
            }
            saveBatch(detailList);
            extendShifts(detailList);
            //updateMassagistSort(detailList, DateUtil.toYYYYMMDD(startTime), shopId);
            if (orderDetailDto.getIsUpdateSort() && !CollectionUtils.isEmpty(orderDetailDto.getMassagistIdList())) {
                updateMassagistSort(detailList, DateUtil.toYYYYMMDD(startTime), shopId);//更新技师排序
            }
        }
    }

    /***
     * 后台修改订单时调用
     */
    @Transactional(rollbackFor = Exception.class)
    public List<OrderDetail> pcNoCheckAndBuildOrderList0410(Long shopId, Long projectId, LocalDateTime startTime, Integer durationMinutes, Integer personCount, List<Long> massgistIdList, List<Long> bedIdList, List<OrderDetail> oldOrderDetails, boolean isCreate, Long customerId) {
        boolean isSelectJiShi=!CollectionUtils.isEmpty(massgistIdList);//用于判断是否选了技师
        if (shopId == null) {
            shopId = 1L;
        }
        Shop shop = shopService.findAvailableById(shopId);
        if (shop == null) {
            throw new BusinessException("抱歉，门店不可用");
        }
        Integer bedType = projectService.findTypeById(projectId);
        if (bedType == null) {
            throw new BusinessException("项目类型有误");
        }

        String date = DateUtil.toYYYYMMDD(startTime);
        //luxin新增此处已放弃使用，新增下边方法
        // List<MassagistSchedules> allMassagistList = massagistSchedulesService.simpleListByDateAndShopId(date, shopId);
        //luxin新增方法，验证技师所会技能
        List<MassagistSchedules> allMassagistList = massagistSchedulesService.getBaseMapper().findListByProjectIdAndShopId(shopId,"%"+projectId+"%",date);

        if (CollectionUtils.isEmpty(allMassagistList)) {
            log.error("查询到店时间失败，没有疗愈师排班数据，date={}", date);
            throw new BusinessException("抱歉，没有疗愈师排班数据");
        } else if (personCount > allMassagistList.size()) {
            throw new BusinessException("抱歉，疗愈师不满足人数要求");
        }
        List<OrderDetail> detailList = findOccupiedDetails(shopId, startTime, durationMinutes);
        Map<Long, List<OrderDetail>> bedDetailMap = new HashMap<>(detailList.size());
        Map<Long, List<OrderDetail>> massagistDetailMap = new HashMap<>(detailList.size());
        detailList.forEach(d -> {
            //luxin修改了  增加固定值1标识湿区项目
            if (d.getProjectId()==1) {
                List<OrderDetail> bedDetailList = bedDetailMap.get(d.getBedId());
                if (bedDetailList == null) {
                    bedDetailList = new ArrayList<>();
                }
                bedDetailList.add(d);
                bedDetailMap.put(d.getBedId(), bedDetailList);
            }
            //luxin新增，当项目为全感项目时，把采耳项目加进来，并且采耳项目id为4
            if (d.getProjectId()==2||d.getProjectId()==4) {
                List<OrderDetail> bedDetailList = bedDetailMap.get(d.getBedId());
                if (bedDetailList == null) {
                    bedDetailList = new ArrayList<>();
                }
                bedDetailList.add(d);
                bedDetailMap.put(d.getBedId(), bedDetailList);
            }
            List<OrderDetail> massagistDetailList = massagistDetailMap.get(d.getMassagistId());
            if (massagistDetailList == null) {
                massagistDetailList = new ArrayList<>();
            }
            massagistDetailList.add(d);
            massagistDetailMap.put(d.getMassagistId(), massagistDetailList);
        });
        LocalDateTime endTime = DateUtil.addTimeByMinutes(startTime, durationMinutes);



        //不提前分配技师，需要验证此时此刻此项目订单量和技师数量是否匹配
        //同一时刻的所有订单量不能大于技师上班人数
        //detailList   allMassagistList
        int count=0;
        //需要增加判断开始下单时间以后的每个15分钟内的订单量
        List<MassagistSchedules> allPeople = massagistSchedulesService.getBaseMapper().findListByProjectIdAndShopId(shopId, "%%", date);
        List<MassagistSchedules> projectAllPeople = massagistSchedulesService.getBaseMapper().findListByProjectIdAndShopId(shopId, "%"+projectId+"%", date);
        //去掉不在此工作时间的技师
        List<MassagistSchedules> allPeopleCountNew = new ArrayList<>();
        /*allPeople.forEach(m->{if((m.getStartTime().isBefore(startTime.toLocalTime())||m.getStartTime().equals(startTime.toLocalTime()) )&& (m.getEndTime().isAfter(endTime.toLocalTime())||m.getEndTime().equals(endTime.toLocalTime()))){
            allPeopleCountNew.add(m);
        }});*/
        allPeople.forEach(m->{
            // 判断预约开始时间是否不早于疗愈师上班时间 (>=)
            boolean isAfterStart = !startTime.toLocalTime().isBefore(m.getStartTime());
            // 判断预约开始时间是否不晚于疗愈师下班时间 (<=)
            boolean isBeforeEnd = startTime.toLocalTime().isBefore(m.getEndTime());
            if (isAfterStart && isBeforeEnd) {
                // 显示疗愈师
                allPeopleCountNew.add(m);
            }
        });
        allPeople = allPeopleCountNew;
        //去掉不在此工作时间的技师
        List<MassagistSchedules> projectAllPeopleCountNew = new ArrayList<>();
        /*projectAllPeople.forEach(m->{if((m.getStartTime().isBefore(startTime.toLocalTime())||m.getStartTime().equals(startTime.toLocalTime()) ) && (m.getEndTime().isAfter(endTime.toLocalTime())||m.getEndTime().equals(endTime.toLocalTime()))){
            projectAllPeopleCountNew.add(m);
        }});*/
        projectAllPeople.forEach(m->{
            // 判断预约开始时间是否不早于疗愈师上班时间 (>=)
            boolean isAfterStart = !startTime.toLocalTime().isBefore(m.getStartTime());
            // 判断预约开始时间是否不晚于疗愈师下班时间 (<=)
            boolean isBeforeEnd = startTime.toLocalTime().isBefore(m.getEndTime());
            if (isAfterStart && isBeforeEnd) {
                // 显示疗愈师
                projectAllPeopleCountNew.add(m);
            }
        });
        projectAllPeople = projectAllPeopleCountNew;

        //需要增加判断开始下单时间以后的每个15分钟
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
                throw new BusinessException("抱歉，疗愈师不满足人数要求!");
            }
            count=personCount;
            if(detailList!=null && detailList.size()>0){
                for (OrderDetail d : detailList) {
                    if(d.getProjectId()==projectId) {
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
            }
            if(count>projectAllPeople.size()){
                throw new BusinessException("抱歉，疗愈师不满足人数要求!");
            }
        }

        // 空余疗愈师列表
        List<MassagistSchedules> availableMassagistList = new ArrayList<>();
        allMassagistList.forEach(m -> {
            // 已约疗愈师
            List<OrderDetail> massagistDetailList = massagistDetailMap.get(m.getMassagistId());
            boolean isAvailable;
            //增加23:40点之前都可以下单，将技师下边时间往后调整1小时
            if(shop.getClockOutTime().equals(DateUtil.toHHmm(m.getEndTime()).toString())){
                LocalDateTime lt=m.getEndTime().atDate(LocalDate.now());
                m.setEndTime(DateUtil.addTimeByMinutes(lt, 100).toLocalTime());
            }

            if (DateUtil.toHHmm(m.getStartTime()).compareTo(DateUtil.toHHmm(startTime)) > 0
                    || DateUtil.toHHmm(m.getEndTime()).compareTo(DateUtil.toHHmm(endTime)) < 0) {
                log.info("技师id={},{}", m.getMassagistId(), "不在排班时间");
                isAvailable = false;
            } else if (CollectionUtils.isEmpty(massagistDetailList)) {
                isAvailable = true;
            } else {
                // 疗愈师侧没有周转间隔：上一单结束即是下一单可开始时间
                isAvailable = massagistDetailList.stream().noneMatch(d ->
                        BookingAvailability.overlaps(startTime, endTime, d.getStartTime(), d.getEndTime(), 0));
                if (!isAvailable) {
                    log.info("技师id={},{}", massagistService.findNameById(m.getMassagistId()), "时间冲突");
                }
            }
            if (isAvailable) {
                availableMassagistList.add(m);
            }
        });

        //luxin增加下单人数是否大于空闲技师人数，大于抛出异常
        if(availableMassagistList.size() < personCount){
            throw new BusinessException("抱歉，疗愈师不满足人数要求!");
        }

        //luxin当选择的技师被占用了，系统自动选择合适的技师去除已占用的技师
        List<Long> massagistIdTemp = new ArrayList<>();
        massgistIdList.stream().forEach(t->{
            if(availableMassagistList.stream().map(MassagistSchedules::getMassagistId).collect(Collectors.toList()).contains(t)){
                massagistIdTemp.add(t);
            }
        });
        massgistIdList = massagistIdTemp;

        List<Long> availableMassagistIdList = availableMassagistList.stream().map(MassagistSchedules::getMassagistId).collect(Collectors.toList());
        //自动派单跳过客户已设为暂别的疗愈师；员工明确指定的技师不受影响
        availableMassagistIdList = customerMassagistBlockService.excludeBlocked(customerId, availableMassagistIdList);
        // 空闲疗愈师排序
        List<Long> sortedMassagistIdList = sortMassagist(availableMassagistIdList, startTime, endTime, shopId, personCount);
        //记录客户指定的技师
        List<Long> specifyMassagistIdList = new ArrayList<>();
        if (!CollectionUtils.isEmpty(massgistIdList)) {
            if (CollectionUtils.isEmpty(oldOrderDetails)) {//没有老详情，代表是创建，创建时记录指定技师
                specifyMassagistIdList.addAll(massgistIdList);
            }
            // 如果还不足够人数，从availableMassagistList补充
            if (massgistIdList.size() < personCount) {
                int remainingCount = personCount - massgistIdList.size();
                for (int i = 0; i < remainingCount; i++) {
                    if (sortedMassagistIdList.size() < remainingCount) {
                        continue;
                    }
                    Long massagistId = sortedMassagistIdList.get(i);
                    if (massagistId != null && !massgistIdList.contains(massagistId)) {
                        massgistIdList.add(massagistId);
                    }
                }
            }
        } else {
            if (personCount <= sortedMassagistIdList.size()) {
                massgistIdList = sortedMassagistIdList;
            } else {
                for (Long massgistId : sortedMassagistIdList) {
                    if (massgistId != null && !massgistIdList.contains(massgistId)) {
                        massgistIdList.add(massgistId);
                    }
                }
            }
        }


        int massagistRemainingCount = personCount - massgistIdList.size();
        if (massagistRemainingCount > 0) {
            List<Long> allMassagistIdList = allMassagistList.stream().map(MassagistSchedules::getMassagistId).collect(Collectors.toList());
            allMassagistIdList = customerMassagistBlockService.excludeBlocked(customerId, allMassagistIdList);
            allMassagistIdList = sortMassagist(allMassagistIdList, startTime, endTime, shopId, personCount);
            for (Long massgistId : allMassagistIdList) {
                if (massgistId != null && !massgistIdList.contains(massgistId)) {
                    massgistIdList.add(massgistId);
                }
            }
        }

        List<OrderDetail> orderDetailList = new ArrayList<>(personCount);
        Map<Long, OrderDetail> orderDetailMap = new HashMap<>();
        Map<Long, OrderDetail> specifyTypeMap = new HashMap<>();
        if (!CollectionUtils.isEmpty(oldOrderDetails)) {
            List<Long> finalMassagistIdList = massgistIdList;
            specifyTypeMap = oldOrderDetails.stream().filter(e -> finalMassagistIdList.contains(e.getMassagistId()))
                    .collect(Collectors.toMap(OrderDetail::getMassagistId, Function.identity()));
            orderDetailMap = oldOrderDetails.stream().filter(e -> !finalMassagistIdList.contains(e.getMassagistId()))
                    .collect(Collectors.toMap(OrderDetail::getId, Function.identity()));
            Set<Long> specifyTypeMassagistIds = specifyTypeMap.keySet();
            if (!CollectionUtils.isEmpty(specifyTypeMassagistIds)) {
                //将指定的技师排到最前边
                massgistIdList.sort(Comparator.comparingLong(item -> specifyTypeMassagistIds.contains(item) ? 0 : 1));
            }
        } else {
            //将指定的技师排到最前边
            massgistIdList.sort(Comparator.comparingLong(item -> specifyMassagistIdList.contains(item) ? 0 : 1));
        }
        Set<Long> idSet = orderDetailMap.keySet();
        Iterator<Long> iterator = idSet.iterator();
        for (int i = 0; i < personCount; i++) {
            Long massagistId = massgistIdList.get(i);
            OrderDetail detail = new OrderDetail();
            detail.setShopId(shopId);
            detail.setProjectId(projectId);
            Integer specifyType = !CollectionUtils.isEmpty(specifyMassagistIdList) && specifyMassagistIdList.contains(massagistId) ? SpecifyType.PC.getValue() : null;
            detail.setSpecifyType(specifyType);
            OrderDetail orderDetail = specifyTypeMap.getOrDefault(massagistId, null);
            //指定类型不被修改
            if (isSelectJiShi&&Objects.isNull(orderDetail)) {
                detail.setSpecifyType(SpecifyType.PC.getValue());
            }
            if (orderDetail != null) {
                detail.setId(orderDetail.getId());
                detail.setState(orderDetail.getState());
                detail.setSpecifyType(orderDetail.getSpecifyType());
                detail.setComment(orderDetail.getComment());
                detail.setIsUpdateSort(orderDetail.getIsUpdateSort());
                detail.setProjectId(orderDetail.getProjectId());
            } else if (iterator.hasNext()) {
                Long id = iterator.next();
                orderDetail = orderDetailMap.get(id);
                detail.setId(id);
                detail.setState(orderDetail.getState());
                detail.setComment(orderDetail.getComment());
                detail.setIsUpdateSort(orderDetail.getIsUpdateSort());
                detail.setProjectId(orderDetail.getProjectId());
            }
            detail.setProjectId(projectId);
            detail.setBedId(bedIdList.get(i));

            //增加判断，如果没有指定就不安排技师
            if (isSelectJiShi) {
                detail.setMassagistId(massagistId);
            }


            detail.setDuration(durationMinutes);
            detail.setStartTime(startTime);
            detail.setEndTime(DateUtil.addTimeByMinutes(startTime, durationMinutes));
            orderDetailList.add(detail);
        }
        return orderDetailList;
    }
}
