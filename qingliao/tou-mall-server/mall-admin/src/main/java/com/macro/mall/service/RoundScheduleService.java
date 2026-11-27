package com.macro.mall.service;

import com.alibaba.fastjson2.JSONArray;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.github.pagehelper.PageInfo;
import com.macro.mall.common.exception.BusinessException;
import com.macro.mall.dto.MassagistQueuePosition;
import com.macro.mall.dto.ReceptionBoardItem;
import com.macro.mall.entity.MassagistSchedules;
import com.macro.mall.entity.OrderDetail;
import com.macro.mall.entity.ReceptionIssue;
import com.macro.mall.entity.ReceptionQueue;
import com.macro.mall.entity.RoundSchedule;
import com.macro.mall.enums.AppointmentState;
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

import java.time.Duration;
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
    @Autowired
    @Lazy
    ReceptionQueueService receptionQueueService;
    @Autowired
    ReceptionIssueService receptionIssueService;

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
        boolean persist = Boolean.TRUE.equals(save);
        // 顺序只认轮牌队列的队序(seq)；队列还没生成就按班次顺序（调店置前、每日轮换）惰性生成
        List<ReceptionQueue> queue = receptionQueueService.dispatchOrder(day, shopId, availableMassagistIdList,
                ReceptionQueueService.KIND_SERVICE);
        if (CollectionUtils.isEmpty(queue)) {
            log.info("轮牌队列为空，当天无人可排 shop={} day={}", shopId, day);
            return Collections.emptyList();
        }
        List<RoundSchedule> allRows = list(new LambdaQueryWrapper<RoundSchedule>()
                .eq(RoundSchedule::getAppointmentDate, day)
                .eq(RoundSchedule::getShopId, shopId)
                .orderByAsc(RoundSchedule::getRound));
        // 每人当前还能挂单的那一行：没上钟、没关闭
        Map<Long, RoundSchedule> openRowMap = allRows.stream()
                .filter(r -> !RoundScheduleState.SCHEDULED.getValue().equals(r.getState())
                        && !RoundScheduleState.CLOSED.getValue().equals(r.getState()))
                .collect(Collectors.toMap(RoundSchedule::getMassagistId, Function.identity(),
                        BinaryOperator.minBy(Comparator.comparingLong((RoundSchedule a) -> a.getRound() == null ? 0L : a.getRound()))));
        Map<Long, Long> maxRoundMap = new HashMap<>();
        allRows.forEach(r -> maxRoundMap.merge(r.getMassagistId(), r.getRound() == null ? 0L : r.getRound(), Math::max));
        Set<Long> mayAssign = CollectionUtils.isEmpty(availableMassagistIdList)
                ? Collections.emptySet() : new HashSet<>(availableMassagistIdList);

        List<RoundSchedule> result = new ArrayList<>();
        List<RoundSchedule> created = new ArrayList<>();
        for (ReceptionQueue q : queue) {
            Long massagistId = q.getMassagistId();
            RoundSchedule row = openRowMap.get(massagistId);
            if (row == null) {
                row = buildRoundSchedule(massagistId, day, shopId, maxRoundMap.getOrDefault(massagistId, 0L) + 1);
                if (persist && mayAssign.contains(massagistId)) {
                    created.add(row);
                }
            }
            // 队列口径随行带出去，看板直接显示，不再自己算序号
            row.setQueueSeq(q.getSeq());
            row.setSortNo(q.getReceiptNo());
            row.setOnDuty(q.getOnDuty());
            row.setRoundCount(q.getAssignCount() == null ? 0L : q.getAssignCount().longValue());
            result.add(row);
        }
        if (!created.isEmpty()) {
            saveBatch(created);
        }
        log.info("轮牌顺序 shop={} day={} → {}", shopId, day, result.stream()
                .map(r -> r.getMassagistId() + "#" + r.getSortNo()).collect(Collectors.joining(",")));
        return result;
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
        updateByDetailList(detailList, day, shopId, true);
    }

    /**
     * @param advanceQueue 是否顺带把人排到队尾。抢单时位移由 grabAssign 落（要记成 GRAB），这里传 false，避免推两次
     */
    public void updateByDetailList(List<OrderDetail> detailList, String day, Long shopId, boolean advanceQueue) {
        updateByDetailList(detailList, day, shopId, advanceQueue, ReceptionQueueService.KIND_SERVICE);
    }

    /**
     * @param queueKind 推进哪一套轮牌：服务单走服务单队，接待单走接待单队，两套队列互不影响
     */
    public void updateByDetailList(List<OrderDetail> detailList, String day, Long shopId, boolean advanceQueue, int queueKind) {
        if (CollectionUtils.isEmpty(detailList) || day == null || shopId == null) {
            return;
        }
        List<OrderDetail> assignList = detailList.stream()
                .filter(d -> d.getMassagistId() != null && d.getId() != null)
                .collect(Collectors.toList());
        if (assignList.isEmpty()) {
            return;
        }
        List<Long> massagistIdList = assignList.stream().map(OrderDetail::getMassagistId).distinct().collect(Collectors.toList());
        List<RoundSchedule> list = findSortMassagistIdList(day, shopId, assignList.size(), massagistIdList, true);
        Map<Long, Long> map = assignList.stream().collect(Collectors.toMap(OrderDetail::getMassagistId, OrderDetail::getId, (a, b) -> a));
        list = list.stream()
                .filter(s -> s.getId() != null && massagistIdList.contains(s.getMassagistId()))
                .collect(Collectors.toMap(RoundSchedule::getMassagistId, Function.identity(),
                        BinaryOperator.minBy(Comparator.comparingLong((RoundSchedule a) -> a.getRound() == null ? 0L : a.getRound()))))
                .values().stream().peek(s -> {
                    s.setState(RoundScheduleState.SCHEDULED.getValue());
                    s.setOrderDetailId(map.get(s.getMassagistId()));
                }).collect(Collectors.toList());
        if (!list.isEmpty()) {
            updateBatchById(list);
        }
        // 上钟：队列把人移到队尾。按明细幂等，同一单重复调用不会把人往后推两次
        if (advanceQueue) {
            assignList.forEach(d -> receptionQueueService.assign(day, shopId, d.getMassagistId(), d.getId(), null, queueKind));
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
        // 回位要用清空前拿到的明细id
        String queueDay = DateUtil.toYYYYMMDD(list.get(0).getAppointmentDate());
        Long queueShopId = list.get(0).getShopId();
        List<Long> assignedDetailIds = list.stream().map(RoundSchedule::getOrderDetailId)
                .filter(Objects::nonNull).distinct().collect(Collectors.toList());
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
        // 取消/改期/换人：把人放回上钟前的位置，只回位置，不做别的变更
        // 流水里要能分辨是哪种操作引起的回位，复盘时不用再翻订单日志对时间
        String revertReason;
        if (RoundScheduleState.UPDATE_DATE.equals(roundScheduleState)) {
            revertReason = "改期";
        } else if (RoundScheduleState.CANCEL.equals(roundScheduleState)) {
            revertReason = "取消";
        } else if (RoundScheduleState.EXCHANGE.equals(roundScheduleState)) {
            revertReason = "互换";
        } else {
            revertReason = "换人";
        }
        assignedDetailIds.forEach(detailId -> receptionQueueService.revert(queueDay, queueShopId, detailId, null, revertReason));
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
        // 以前这里会「移除请假的技师的当前轮次排序」：位置一删，后面的人就顶上来了，取消之后也回不去，顺序就乱了。
        // 现在顺序由轮牌队列负责，不在班的人在选人时按班次过滤，这里只留备注，不删行、不动位置。
        List<RoundSchedule> commentList = skipMassagistList.stream().filter(s -> s.getId() != null).collect(Collectors.toList());
        if (CollectionUtils.isEmpty(commentList)) {
            return;
        }
        commentList.forEach(s -> {
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
        updateBatchById(commentList);
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
        applyQueueOrder(shopId, date, roundScheduleList);
        return roundScheduleList;
    }

    /**
     * 排班表显示顺序以轮牌队列为准：seq 升序（值班不参与排序），round 重编为 1..n（展示用）。
     * 队列里还没有的人（当天没起过轮牌/休息未纳入）保持原顺序垫后，所以队列未生成时行为与老逻辑完全一致。
     */
    private void applyQueueOrder(Long shopId, String date, List<RoundSchedule> list) {
        if (CollectionUtils.isEmpty(list)) {
            return;
        }
        List<ReceptionQueue> queue = receptionQueueService.orderList(date, shopId);
        if (CollectionUtils.isEmpty(queue)) {
            return;
        }
        Map<Long, ReceptionQueue> byId = new HashMap<>();
        for (ReceptionQueue q : queue) {
            byId.putIfAbsent(q.getMassagistId(), q);
        }
        List<RoundSchedule> inQueue = new ArrayList<>();
        List<RoundSchedule> others = new ArrayList<>();
        for (RoundSchedule rs : list) {
            (byId.containsKey(rs.getMassagistId()) ? inQueue : others).add(rs);
        }
        inQueue.sort(Comparator.comparingInt(rs -> queue.indexOf(byId.get(rs.getMassagistId()))));
        long no = 0;
        for (RoundSchedule rs : inQueue) {
            ReceptionQueue q = byId.get(rs.getMassagistId());
            rs.setRound(++no);
            if (q.getAssignCount() != null) {
                rs.setRoundCount(q.getAssignCount().longValue());
            }
        }
        for (RoundSchedule rs : others) {
            rs.setRound(++no);
        }
        list.clear();
        list.addAll(inQueue);
        list.addAll(others);
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

    // ==================== 轮牌（接待排队）对外的动作 ====================

    /** 轮牌看板：顺序 + 谁在忙 + 谁能抢（kind：0服务单轮牌 1接待单轮牌） */
    public List<ReceptionBoardItem> receptionBoard(Long shopId, String date, int kind) {
        return receptionQueueService.board(date, shopId, kind);
    }

    /** 派单顺序的疗愈师id（只看队序 seq，不看值班分组），接待单排单用接待队 */
    public List<Long> receptionOrder(Long shopId, String date, int kind) {
        return receptionQueueService.dispatchOrder(date, shopId, kind).stream()
                .map(ReceptionQueue::getMassagistId).collect(Collectors.toList());
    }

    /**
     * 队序 + 今日接单数（只读，不建队列）：服务队、接待队各算一份，按人合并。
     *
     * <p>看板疗愈师卡片要知道「排第几个、今天接了几单」：卡片列是按班次顺序排的，跟队序无关，
     * 所以只能单独取。刻意走只读的 orderList 而不是 board()——翻到还没起队的日期就返回空，
     * 前端整块不显示，免得看一眼前面的号就把那天（哪怕是过去）的队列建出来。</p>
     *
     * <p>队序读队列，单数读订单明细（{@link OrderDetailService#servedCountByMassagist}）：
     * 队列里的 assign_count 只是「这一队推了几次」，不能当单数用。</p>
     */
    public List<MassagistQueuePosition> queuePositions(Long shopId, String date) {
        if (shopId == null || date == null) {
            return Collections.emptyList();
        }
        Map<Long, MassagistQueuePosition> map = new LinkedHashMap<>();
        putPositions(map, receptionQueueService.orderList(date, shopId, ReceptionQueueService.KIND_SERVICE), true);
        putPositions(map, receptionQueueService.orderList(date, shopId, ReceptionQueueService.KIND_RECEPTION), false);
        // 已接单数按订单明细算：队列的 assign_count 只记「这一队推了几次」，手工改技师/互换、
        // 改期后重新排回来都会让它漏记或错减（线上就出现过做 8 单显示 1 单）
        orderDetailService.servedCountByMassagist(shopId, DateUtil.stringToLocalDate(date)).forEach((massagistId, c) -> {
            MassagistQueuePosition p = map.get(massagistId);
            if (p == null) {
                p = new MassagistQueuePosition();
                p.setMassagistId(massagistId);
                map.put(massagistId, p);
            }
            p.setServiceCount(c.getServiceCount() == null ? 0 : c.getServiceCount());
            p.setReceptionCount(c.getReceptionCount() == null ? 0 : c.getReceptionCount());
        });
        return new ArrayList<>(map.values());
    }

    /** 服务队/接待队各刷一遍：顺序号就是派单顺序（seq 升序，作废行已剔掉）里的第几个 */
    private void putPositions(Map<Long, MassagistQueuePosition> map, List<ReceptionQueue> order, boolean service) {
        int no = 0;
        for (ReceptionQueue q : order) {
            if (q.getMassagistId() == null) {
                continue;
            }
            no++;
            MassagistQueuePosition p = map.get(q.getMassagistId());
            if (p == null) {
                p = new MassagistQueuePosition();
                p.setMassagistId(q.getMassagistId());
                map.put(q.getMassagistId(), p);
            }
            if (service) {
                p.setServiceNo(no);
            } else {
                p.setReceptionNo(no);
            }
        }
    }

    /** 值班 / 下值班（只换分组，不动位置） */
    public ReceptionQueue switchDuty(Long shopId, String date, Long massagistId, boolean onDuty, String operator, int kind) {
        return receptionQueueService.switchDuty(date, shopId, massagistId, onDuty, operator, kind);
    }

    /** 接待完成：回到休息区，位置保留 */
    public void finishReception(Long shopId, String date, Long massagistId, String operator, int kind) {
        receptionQueueService.finish(date, shopId, massagistId, operator, kind);
    }

    /** 调店进店：插到队头 */
    public void joinReceptionQueue(Long shopId, String date, Long massagistId, String operator, int kind) {
        receptionQueueService.joinFromOtherShop(date, shopId, massagistId, operator, kind);
    }

    /** 手工调序：交换两个人的顺序（只动位置，不动值班分组与结果编号） */
    public void swapReceptionOrder(Long shopId, String date, Long massagistIdA, Long massagistIdB, String operator, int kind) {
        receptionQueueService.swap(date, shopId, massagistIdA, massagistIdB, operator, kind);
    }

    /** 当天轮牌事项（值班意向/无值班可接待/超时未接待） */
    public List<ReceptionIssue> receptionIssues(Long shopId, String date) {
        return receptionIssueService.listByDay(date, shopId);
    }

    /** 一键安排预览：下一单该谁上 */
    public ReceptionQueue nextMassagist(Long shopId, String date, LocalDateTime startTime, Integer durationMinutes, int kind) {
        LocalDateTime end = startTime == null ? null : startTime.plusMinutes(durationMinutes == null ? 60 : durationMinutes);
        return receptionQueueService.pickNext(date, shopId, startTime, end, null, kind);
    }

    /**
     * 抢单：客人还没被接待、原疗愈师超过接待确认时限也没点接待，其他人可以把这单接过去。
     */
    @Transactional(rollbackFor = Exception.class)
    public void grab(Long shopId, String date, Long massagistId, Long detailId, String operator) {
        if (shopId == null || date == null || massagistId == null || detailId == null) {
            throw new BusinessException("参数不完整");
        }
        synchronized (("receptionGrab:" + date + ":" + shopId).intern()) {
            OrderDetail detail = orderDetailService.getById(detailId);
            if (detail == null) {
                throw new BusinessException("订单明细不存在");
            }
            if (!Objects.equals(detail.getShopId(), shopId)) {
                throw new BusinessException("门店不一致，不能抢单");
            }
            if (!AppointmentState.WAITING.getValue().equals(detail.getState())) {
                throw new BusinessException("客人已经被接待了，抢不了");
            }
            // 接待单抢的是接待队、服务单抢的是服务队：以这单当初上钟时记下的队列为准
            int kind = receptionQueueService.kindOfDetail(date, shopId, detailId);
            Long fromMassagistId = detail.getMassagistId();
            if (Objects.equals(fromMassagistId, massagistId)) {
                throw new BusinessException("这单本来就是你的");
            }
            if (receptionQueueService.find(date, shopId, massagistId, kind) == null) {
                throw new BusinessException("你不在今天的排班里");
            }
            // 接待确认时限没过，这单还轮不到别人抢
            ReceptionQueue fromQueue = receptionQueueService.find(date, shopId, fromMassagistId, kind);
            int window = receptionQueueService.grabWindowMinutes(shopId);
            if (fromQueue != null && fromQueue.getLastAssignTime() != null) {
                LocalDateTime deadline = fromQueue.getLastAssignTime().plusMinutes(window);
                if (LocalDateTime.now().isBefore(deadline)) {
                    long left = Duration.between(LocalDateTime.now(), deadline).toMinutes() + 1;
                    throw new BusinessException("对方还有" + left + "分钟接待确认时间，先等等");
                }
            }
            // 自己这个时段不能有冲突（正在上钟的人抢不了，这也是店里反馈过的问题）
            if (detail.getStartTime() != null && detail.getEndTime() != null
                    && orderDetailService.count(new LambdaQueryWrapper<OrderDetail>()
                    .eq(OrderDetail::getShopId, shopId)
                    .eq(OrderDetail::getMassagistId, massagistId)
                    .ne(OrderDetail::getState, AppointmentState.CANCELED.getValue())
                    .lt(OrderDetail::getStartTime, detail.getEndTime())
                    .gt(OrderDetail::getEndTime, detail.getStartTime())) > 0) {
                throw new BusinessException("你这个时段正在上钟，抢不了");
            }
            detail.setMassagistId(massagistId);
            orderDetailService.updateById(detail);
            // 排班行：原疗愈师的行释放、新疗愈师的行挂上；队列：原疗愈师回原位，抢到的人排到队尾（由 grabAssign 落）
            recoverByDetailList(Collections.singletonList(detailId), RoundScheduleState.UPDATE);
            updateByDetailList(Collections.singletonList(detail), date, shopId, false, kind);
            receptionQueueService.grabAssign(date, shopId, massagistId, detailId, operator, kind);
            receptionIssueService.grabbed(date, shopId, detailId, fromMassagistId,
                    "超过" + window + "分钟未接待，被" + massagistService.findNameById(massagistId) + "抢单",
                    massagistService.findNameById(massagistId));
            log.info("抢单成功 shop={} detail={} {}→{}", shopId, detailId, fromMassagistId, massagistId);
        }
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