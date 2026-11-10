package com.macro.mall.service;

import com.alibaba.fastjson2.JSONArray;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.github.pagehelper.PageInfo;
import com.macro.mall.entity.MassagistSchedules;
import com.macro.mall.entity.OrderDetail;
import com.macro.mall.entity.RoundSchedule;
import com.macro.mall.enums.RoundScheduleState;
import com.macro.mall.mapper.RoundScheduleMapper;
import com.macro.mall.service.base.BaseService;
import com.macro.mall.service.base.WrapperBuilder;
import com.macro.mall.utils.DateUtil;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.CollectionUtils;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.*;
import java.util.function.BinaryOperator;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * 服务类
 *
 * @author
 * @date 2025/08/13
 */
@Service
@Slf4j
public class RoundScheduleService extends BaseService<RoundScheduleMapper, RoundSchedule> {
    @Autowired
    MassagistSchedulesService massagistSchedulesService;
    @Autowired
    @Lazy
    OrderDetailService orderDetailService;
    @Autowired
    @Lazy
    MassagistService massagistService;

    @Override
    protected QueryWrapper<RoundSchedule> buildWrapper(Map<String, Object> params, QueryWrapper<RoundSchedule> queryWrapper) {
        return WrapperBuilder.init(queryWrapper, params)
                .equal("appointment_date")
                .equal("round")
                .equal("massagist_id")
                .equal("shop_id")
                .getQueryWrapper();
    }

    public PageInfo<RoundSchedule> pageInfo(Map<String, Object> params) {
        PageInfo<RoundSchedule> page = page(params);
        buildDetail(page.getList());
        return page;
    }

    /**
     * 补全
     *
     * @param roundScheduleList
     */
    private void buildDetail(List<RoundSchedule> roundScheduleList) {
        List<Long> orderDetailIdList = roundScheduleList.stream().map(RoundSchedule::getOrderDetailId).collect(Collectors.toList());
        List<OrderDetail> orderDetailList = orderDetailService.listByIds(orderDetailIdList);
        Map<Long, OrderDetail> orderDetailMap = orderDetailList.stream().collect(Collectors.toMap(OrderDetail::getId, s -> s));
        roundScheduleList.forEach(s -> s.setOrderDetail(orderDetailMap.get(s.getOrderDetailId())));
    }

    /**
     * 获取排序后的技师列表
     *
     * @param day
     * @param shopId
     * @param personCount
     * @param availableMassagistIdList
     * @param save
     * @return
     */
    public List<RoundSchedule> findSortMassagistIdList(String day, Long shopId, Integer personCount, List<Long> availableMassagistIdList, Boolean save) {
        LambdaQueryWrapper<RoundSchedule> lqw = new LambdaQueryWrapper<>();
        lqw.eq(RoundSchedule::getAppointmentDate, day);
        lqw.eq(RoundSchedule::getShopId, shopId);
        lqw.notIn(RoundSchedule::getState, Arrays.asList(RoundScheduleState.SCHEDULED.getValue(), RoundScheduleState.CLOSED.getValue()));
        lqw.orderByAsc(RoundSchedule::getRound);
        List<RoundSchedule> list = list(lqw);
        List<Long> massgistIdList = list.stream().map(RoundSchedule::getMassagistId).collect(Collectors.toList());
        Long currentRound = findCurrentRound(day, shopId);
        //检查当前排序是否起作用,没起作用，移除重新添加++++++++++++++++++++++++++++ start   2026-06-09
        if (currentRound > 0) {
            LambdaQueryWrapper<RoundSchedule> lqw2 = new LambdaQueryWrapper<>();
            lqw2.eq(RoundSchedule::getAppointmentDate, day);
            lqw2.eq(RoundSchedule::getShopId, shopId);
            lqw2.eq(RoundSchedule::getRound, currentRound);
            lqw2.orderByAsc(RoundSchedule::getRound);
            List<RoundSchedule> listCheck = list(lqw2);
            if(!listCheck.isEmpty()&&listCheck.stream().filter(t->t.getState()==1).collect(Collectors.toList()).size()==0) {
                currentRound=currentRound-1;
                listCheck.forEach(s -> {removeById(s.getId());});
                list = list(lqw);
                massgistIdList = list.stream().map(RoundSchedule::getMassagistId).collect(Collectors.toList());
            }
        }
        //+++++++++++++++++++++++++++++++++++++++++++++++++++  end

        if(currentRound>0){

            //说明技师排班表里已经有值了，查看当前技师值日表里是否有调店人员的存在，不存在则加入进去。存在则跳过；
            lqw = new LambdaQueryWrapper<>();
            lqw.eq(RoundSchedule::getAppointmentDate, day);
            lqw.eq(RoundSchedule::getShopId, shopId);
            lqw.eq(RoundSchedule::getRound, currentRound);
            lqw.orderByAsc(RoundSchedule::getRound);
            List<RoundSchedule> listCheck = list(lqw);
            List<Long> massgistIdListCheck = listCheck.stream().map(RoundSchedule::getMassagistId).collect(Collectors.toList());
            final long num= currentRound;
            List<RoundSchedule> finalList = list;
            List<Long> finalMassgistIdList = massgistIdList;
            availableMassagistIdList.forEach(s -> {
                if (!massgistIdListCheck.contains(s)) {
                    RoundSchedule obj= buildRoundSchedule(s, day, shopId, num);
                    save(obj);
                    finalList.add(obj);
                    finalMassgistIdList.add(s);
                }
            });
            list.addAll(finalList);
            massgistIdList.addAll(finalMassgistIdList);
        }

        if (CollectionUtils.isEmpty(list) || (personCount != null && list.size() <= personCount) || (!CollectionUtils.isEmpty(availableMassagistIdList) && !massgistIdList.containsAll(availableMassagistIdList))) {
            List<Long> massagistSchedulesList = massagistSchedulesService.getMassagistSchedulesList(day, shopId);
            //添加调店人员Id;获取调店人员id
            List<Long> massagistSchedulesListDiaoDian=massagistSchedulesService.getMassagistSchedulesListDiaoDian(day,shopId);
            massagistSchedulesListDiaoDian.forEach(s->{
                if(!massagistSchedulesList.contains(s)) {
                    massagistSchedulesList.add(0, s);
                }
            });

            currentRound += 1;
            Long finalCurrentRound = currentRound;
            List<RoundSchedule> roundScheduleList = massagistSchedulesList.stream().map(s -> buildRoundSchedule(s, day, shopId, finalCurrentRound)).collect(Collectors.toList());

            //当初次添加时，有增加调店人员添加到轮值表中
            /*if (currentRound == 1) {*/
                final long num1= currentRound;
                availableMassagistIdList.forEach(s -> {
                    if (!massagistSchedulesList.contains(s)) {
                        roundScheduleList.add(buildRoundSchedule(s, day, shopId, num1));
                    }
                });
            //}

            if (save) {
                saveBatch(roundScheduleList);
            }else {
                //只对调用方法查询技师当前轮次有作用，方法名：getMassagistRound
                if (currentRound != 1) {
                    /*final long num1= currentRound;
                    availableMassagistIdList.forEach(s -> {
                        if (!massagistSchedulesList.contains(s)) {
                            roundScheduleList.add(buildRoundSchedule(s, day, shopId, num1));
                        }
                    });*/
                }
            }
            list.addAll(roundScheduleList);
        }
        log.info("当前轮次：{}", currentRound);
        Set<Long> transferred = new HashSet<>(massagistSchedulesService.getMassagistSchedulesListDiaoDian(day, shopId));
        return list.stream().collect(Collectors.groupingBy(
                RoundSchedule::getMassagistId,
                LinkedHashMap::new,
                Collectors.minBy(Comparator.comparingLong(RoundSchedule::getRound))
        )).values().stream().map(Optional::get).sorted(Comparator.comparingLong(RoundSchedule::getRound)
                .thenComparingInt(s -> transferred.contains(s.getMassagistId()) ? 0 : 1)).collect(Collectors.toList());
    }

    private RoundSchedule buildRoundSchedule(Long massagistId, String day, Long shopId, Long round) {
        RoundSchedule roundSchedule = new RoundSchedule();
        roundSchedule.setAppointmentDate(DateUtil.stringToLocalDate(day));
        roundSchedule.setRound(round);
        roundSchedule.setMassagistId(massagistId);
        roundSchedule.setState(RoundScheduleState.INIT.getValue());
        roundSchedule.setShopId(shopId);
        return roundSchedule;
    }

    /**
     * 获取当前轮次
     *
     * @param day
     * @param shopId
     * @return
     */
    public Long findCurrentRound(String day, Long shopId) {
        LambdaQueryWrapper<RoundSchedule> lqw = new LambdaQueryWrapper<>();
        lqw.eq(RoundSchedule::getAppointmentDate, day);
        lqw.eq(RoundSchedule::getShopId, shopId);
        lqw.orderByDesc(RoundSchedule::getRound);
        RoundSchedule roundSchedule = getOnlyOne(lqw);
        if (roundSchedule == null) {
            return 0L;
        }
        return roundSchedule.getRound();
    }

    /**
     * 根据详情更新，并判断是否关闭一些轮次
     *
     * @param detailList
     * @param day
     * @param shopId
     */
    @Transactional(rollbackFor = Exception.class)
    public void updateByDetailList(List<OrderDetail> detailList, String day, Long shopId) {
        if (CollectionUtils.isEmpty(detailList) || day == null || shopId == null) {
            return;
        }
        List<Long> massagistIdList = detailList.stream().map(OrderDetail::getMassagistId).collect(Collectors.toList());
        List<RoundSchedule> list = findSortMassagistIdList(day, shopId, detailList.size(), massagistIdList, true);
        list = list.stream().filter(s -> massagistIdList.contains(s.getMassagistId())).collect(Collectors.toList());
        Map<Long, Long> map = detailList.stream().collect(Collectors.toMap(OrderDetail::getMassagistId, OrderDetail::getId));
        list = list.stream()
                .collect(Collectors.toMap(RoundSchedule::getMassagistId, Function.identity(), BinaryOperator.minBy(Comparator.comparingLong(RoundSchedule::getRound))))
                .values().stream().peek(s -> {
                    s.setState(RoundScheduleState.SCHEDULED.getValue());
                    s.setOrderDetailId(map.get(s.getMassagistId()));
                }).collect(Collectors.toList());
        updateBatchById(list);
        Long lastRound = findCurrentRound(day, shopId);
        Long minRound = list.stream().map(RoundSchedule::getRound).min(Long::compareTo).orElse(null);
        if (minRound != null && !minRound.equals(lastRound)) {
            closeRoundsWithAllMassagistsOffDuty(day, shopId, minRound);
        }
    }

    /**
     * 取消更新
     *
     * @param detailIdList
     * @param roundScheduleState
     */
    public void recoverByDetailList(List<Long> detailIdList, RoundScheduleState roundScheduleState) {
        if (CollectionUtils.isEmpty(detailIdList)) {
            return;
        }
        LambdaQueryWrapper<RoundSchedule> lqw = new LambdaQueryWrapper<>();
        lqw.in(RoundSchedule::getOrderDetailId, detailIdList);
        List<RoundSchedule> list = list(lqw);
        if (CollectionUtils.isEmpty(list)) {
            return;
        }
        LocalDateTime now = LocalDateTime.now();
        list.forEach(schedule -> {
            schedule.setState(roundScheduleState.getValue());
            String comment = schedule.getComment();
            JSONArray commentArray = new JSONArray();
            if (comment != null) {
                commentArray = JSONArray.parseArray(comment);
            }
            if (RoundScheduleState.UPDATE_DATE.equals(roundScheduleState)) {
                commentArray.add(DateUtil.toStandString(now) + "日期变更被取消, 原id=" + schedule.getOrderDetailId());
            } else if (RoundScheduleState.CANCEL.equals(roundScheduleState)) {
                commentArray.add(DateUtil.toStandString(now) + "排班被操作取消, 原id=" + schedule.getOrderDetailId());
            } else if (RoundScheduleState.UPDATE.equals(roundScheduleState)) {
                commentArray.add(DateUtil.toStandString(now) + "技师变更被取消, 原id=" + schedule.getOrderDetailId());
            }
            if (commentArray.size() > 10) {
                commentArray.remove(0);
            }
            if (commentArray.size() > 0) {
                schedule.setComment(commentArray.toJSONString());
            }
            schedule.setOrderDetailId(null);
            schedule.setUpdateTime(now);
        });
        updateBatchById(list);
    }

    /**
     * 验证跳过技师的原因
     *
     * @param skipMassagistList 跳过技师
     * @param startTime         开始时间
     * @param endTime           结束时间
     */
    public void verifySkipMassagistReason(List<RoundSchedule> skipMassagistList, LocalDateTime startTime, LocalDateTime endTime, Long shopId) {
        if (CollectionUtils.isEmpty(skipMassagistList)) {
            return;
        }
        log.info("本次被跳过技师：");
        for (RoundSchedule roundSchedule : skipMassagistList) {
            log.info("技师id={},轮次={}", massagistService.findNameById(roundSchedule.getMassagistId()), roundSchedule.getRound());
        }
        Set<Long> workMassagistIdList = new HashSet<>();
        if (startTime != null && endTime != null && shopId != null) {
            List<MassagistSchedules> massagistSchedulesList = massagistSchedulesService.simpleListByDateAndShopId(DateUtil.toYYYYMMDD(startTime), shopId);
            if (!CollectionUtils.isEmpty(massagistSchedulesList)) {
                massagistSchedulesList.forEach(m -> {
                    if (DateUtil.toHHmm(m.getStartTime()).compareTo(DateUtil.toHHmm(startTime)) > 0
                            || DateUtil.toHHmm(m.getEndTime()).compareTo(DateUtil.toHHmm(endTime)) < 0) {
                        return;
                    }
                    workMassagistIdList.add(m.getMassagistId());
                });
            } else {
                workMassagistIdList.addAll(skipMassagistList.stream().map(RoundSchedule::getMassagistId).collect(Collectors.toSet()));
            }
        } else {
            workMassagistIdList.addAll(skipMassagistList.stream().map(RoundSchedule::getMassagistId).collect(Collectors.toSet()));
        }
        LocalDateTime now = LocalDateTime.now();
        //获取请假的列表
        List<RoundSchedule> skipMassagistListNew = skipMassagistList.stream().filter(s -> !workMassagistIdList.contains(s.getMassagistId())).collect(Collectors.toList());
        //移除请假的技师的当前轮次排序
        removeBatchByIds(skipMassagistListNew.stream().map(RoundSchedule::getId).collect(Collectors.toList()));
        skipMassagistList.forEach(s -> {
            String comment = s.getComment();
            JSONArray commentArray = new JSONArray();
            if (comment != null) {
                commentArray = JSONArray.parseArray(comment);
            }
            commentArray.add(DateUtil.toStandString(startTime) + " - " + DateUtil.toStandString(endTime) + (workMassagistIdList.contains(s.getMassagistId()) ? "时间冲突" : "休假") + "被跳过");
            if (commentArray.size() > 10) {
                commentArray.remove(0);
            }
            s.setComment(commentArray.toJSONString());
            s.setUpdateTime(now);
        });
        updateBatchById(skipMassagistList);
    }

    /**
     * 校验之前轮次是否包含未上班
     *
     * @param day
     * @param shopId
     * @param lastRound
     * @return
     */
    public void closeRoundsWithAllMassagistsOffDuty(String day, Long shopId, Long lastRound) {
        if (lastRound < 1 || shopId == null || day == null) {
            return;
        }
        List<MassagistSchedules> massagistSchedulesList = massagistSchedulesService.simpleListByDateAndShopId(day, shopId);
        if (CollectionUtils.isEmpty(massagistSchedulesList)) {
            return;
        }
        LambdaQueryWrapper<RoundSchedule> lqw = new LambdaQueryWrapper<>();
        lqw.eq(RoundSchedule::getAppointmentDate, day);
        lqw.eq(RoundSchedule::getShopId, shopId);
        lqw.ne(RoundSchedule::getState, RoundScheduleState.CLOSED.getValue());
        lqw.le(RoundSchedule::getRound, lastRound);
        List<RoundSchedule> roundScheduleList = list(lqw);
        if (CollectionUtils.isEmpty(roundScheduleList)) {
            return;
        }
        List<RoundSchedule> noScheduleList = roundScheduleList.stream()
                .filter(s -> !RoundScheduleState.SCHEDULED.getValue().equals(s.getState())).collect(Collectors.toList());
        if (CollectionUtils.isEmpty(noScheduleList)) {
            log.info("前{}轮次暂无需要关闭的排班", lastRound);
            return;
        }
        Map<Long, List<RoundSchedule>> roundMap = noScheduleList.stream().collect(Collectors.groupingBy(RoundSchedule::getRound));
        Set<Long> roundSet = roundMap.keySet();

        List<RoundSchedule> scheduledScheduleList = roundScheduleList.stream()
                .filter(s -> {
                    if (!roundSet.contains(s.getRound())) {
                        return false;
                    }
                    return RoundScheduleState.SCHEDULED.getValue().equals(s.getState());
                }).collect(Collectors.toList());
        if (CollectionUtils.isEmpty(scheduledScheduleList)){
            return;
        }
        buildDetail(scheduledScheduleList);
        Map<Long, String[]> roundTimeMap = new HashMap<>();
        for (RoundSchedule schedule : scheduledScheduleList) {
            Long round = schedule.getRound();
            OrderDetail orderDetail = schedule.getOrderDetail();
            if (orderDetail == null) {
                continue;
            }
            String startTime = DateUtil.toHHmm(orderDetail.getStartTime());
            String endTime = DateUtil.toHHmm(orderDetail.getEndTime());

            roundTimeMap.compute(round, (k, v) -> {
                if (v == null) {
                    return new String[]{startTime, endTime};
                }
                if (startTime.compareTo(v[0]) < 0) {
                    v[0] = startTime;
                }
                if (endTime.compareTo(v[1]) > 0) {
                    v[1] = endTime;
                }
                return v;
            });
        }
        Map<Long, List<MassagistSchedules>> massagistSchedulesMap = massagistSchedulesList.stream()
                .collect(Collectors.groupingBy(MassagistSchedules::getMassagistId));
        List<RoundSchedule> closeList = new ArrayList<>();
        Set<Long> closeRoundSet = new HashSet<>();
        roundMap.forEach((round, schedules) -> {
            String[] timeRange = roundTimeMap.get(round);
            if (timeRange == null) {
                return;
            }
            String minTime = timeRange[0];
            String maxTime = timeRange[1];
            boolean canClose = schedules.stream().map(RoundSchedule::getMassagistId)
                    .noneMatch(massagistId ->
                            massagistSchedulesMap.getOrDefault(massagistId, Collections.emptyList()).stream()
                                    .anyMatch(range -> DateUtil.toHHmm(range.getEndTime()).compareTo(minTime) > 0 && DateUtil.toHHmm(range.getStartTime()).compareTo(maxTime) < 0)
                    );
            if (!canClose) {
                log.info("第{}轮次未关闭,时间范围: {} - {}", round, minTime, maxTime);
                return;
            }
            closeList.addAll(schedules);
            closeRoundSet.add(round);
        });
        if (CollectionUtils.isEmpty(closeList)) {
            log.info("前{}轮次暂无需要关闭的排班", lastRound);
            return;
        }
        log.info("本次要关闭的轮次：");
        for (Long round : closeRoundSet) {
            log.info("轮次={}", round);
        }

        LocalDateTime now = LocalDateTime.now();
        closeList.forEach(schedule -> {
            schedule.setState(RoundScheduleState.CLOSED.getValue());
            String comment = schedule.getComment();
            JSONArray commentArray = new JSONArray();
            if (comment != null) {
                commentArray = JSONArray.parseArray(comment);
            }
            commentArray.add(DateUtil.toStandString(now) + "第" + schedule.getRound() + "轮次期间未排班被关闭");
            if (commentArray.size() > 10) {
                commentArray.remove(0);
            }
            schedule.setComment(commentArray.toJSONString());
            schedule.setUpdateTime(now);
        });
        updateBatchById(closeList);
    }

    /**
     * 查询技师当前轮次
     *
     * @param shopId
     * @return
     */
    public List<RoundSchedule> getMassagistRound(Long shopId, String date) {
        List<MassagistSchedules> allMassagistList = massagistSchedulesService.simpleListByDateAndShopId(date, shopId);
        List<Long> availableMassagistIdList = allMassagistList.stream().map(MassagistSchedules::getMassagistId).collect(Collectors.toList());
        List<RoundSchedule> list = findSortMassagistIdList(date, shopId, allMassagistList.size(), availableMassagistIdList, false);
        if (CollectionUtils.isEmpty(list)) {
            return Collections.emptyList();
        }
        log.info("根据排序轮次修正后：");
        for (RoundSchedule roundSchedule : list) {
            log.info("技师={}", massagistService.findNameById(roundSchedule.getMassagistId()));
        }
        List<RoundSchedule> roundScheduleList = new ArrayList<>();
        Set<Long> massagistIdList = new HashSet<>();
        for (RoundSchedule roundSchedule : list) {
            if (massagistIdList.containsAll(availableMassagistIdList)) {
                break;
            }
            Long massagistId = roundSchedule.getMassagistId();
            if (availableMassagistIdList.contains(massagistId)) {
                roundScheduleList.add(roundSchedule);
                massagistIdList.add(massagistId);
            }
        }
        log.info("根据空闲修正后：");
        for (RoundSchedule roundSchedule : roundScheduleList) {
            log.info("技师={},轮次={}", massagistService.findNameById(roundSchedule.getMassagistId()), roundSchedule.getRound());
        }
        Map<Long, Long> map = getMassagistRoundCountMap(shopId, date);
        roundScheduleList.forEach(s -> s.setRoundCount(map.getOrDefault(s.getMassagistId(), 0L)));
        return roundScheduleList;
    }

    /**
     * 已排轮次
     *
     * @param shopId
     * @param date
     * @return
     */
    private Map<Long, Long> getMassagistRoundCountMap(Long shopId, String date) {
        LambdaQueryWrapper<RoundSchedule> lqw = new LambdaQueryWrapper<>();
        lqw.eq(RoundSchedule::getAppointmentDate, date);
        lqw.eq(RoundSchedule::getShopId, shopId);
        lqw.eq(RoundSchedule::getState, RoundScheduleState.SCHEDULED.getValue());
        List<RoundSchedule> list = list(lqw);
        return list.stream().collect(Collectors.groupingBy(RoundSchedule::getMassagistId, Collectors.counting()));
    }

    public void removeExistData(LocalDate day, Long shopId) {
        LambdaQueryWrapper<RoundSchedule> lqw = new LambdaQueryWrapper<>();
        lqw.eq(RoundSchedule::getAppointmentDate, day);
        lqw.eq(RoundSchedule::getShopId, shopId);
        //根据Round字段降序
        lqw.orderByDesc(RoundSchedule::getRound);
        List<RoundSchedule> list = list(lqw);
        if (CollectionUtils.isEmpty(list)) {
            return;
        }
        //获取第一个对象
        RoundSchedule first = list.get(0);
        List<RoundSchedule> ckData = list.stream().filter(s -> s.getRound() == first.getRound()&&s.getState()==1).collect(Collectors.toList());
        if (CollectionUtils.isEmpty(ckData)) {
            List<RoundSchedule> removeList = list.stream().filter(s -> s.getRound() == first.getRound()).collect(Collectors.toList());
            removeList.forEach(s -> removeById(s.getId()));
        }

    }
}