package com.macro.mall.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.macro.mall.common.exception.BusinessException;
import com.macro.mall.dto.ReceptionBoardItem;
import com.macro.mall.entity.MassagistSchedules;
import com.macro.mall.entity.OrderDetail;
import com.macro.mall.entity.ReceptionQueue;
import com.macro.mall.entity.ReceptionConfig;
import com.macro.mall.entity.ReceptionQueueLog;
import com.macro.mall.enums.AppointmentState;
import com.macro.mall.enums.ReceptionQueueAction;
import com.macro.mall.mapper.ReceptionConfigMapper;
import com.macro.mall.mapper.ReceptionQueueLogMapper;
import com.macro.mall.mapper.ReceptionQueueMapper;
import com.macro.mall.service.base.BaseService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.CollectionUtils;
import org.springframework.util.StringUtils;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.*;
import java.util.stream.Collectors;

/**
 * 轮牌队列：当天「谁排在谁前面」的唯一真相。
 *
 * <p>设计口径（和前端/店长对齐过的规则）：</p>
 * <ol>
 *   <li><b>顺序只增不减</b>：seq 越大越靠后。上钟 → seq = 队尾+1；撤销 → 回填上钟前的 seq。
 *       取消/改期只是把位置还原，不做「整轮删除重建」，所以不会再出现 7 号插到 3 号前面。</li>
 *   <li><b>值班只是分组，不动顺序</b>：on_duty 只管「在值班区还是休息区」，点值班/下值班都不改 seq。
 *       展示口径 = 值班在前、休息在后，组内按 seq。</li>
 *   <li><b>没点值班的人不会消失</b>：只要有值班的人，休息区的人就排在后面；值班的人都被占用时
 *       才会自动往休息区取（这正是「人数不够才自动调用」），并且留一条事项。</li>
 *   <li><b>结果编号</b>：receipt_no 按 seq 顺序编 1..n，上钟的人跳到队尾拿 n+1；
 *       只有「全员都接待过一遍、且刚才上钟的是队头」时才重排回 1..n。</li>
 *   <li><b>可追</b>：每次换位置都写 s_reception_queue_log，需要人处理的问题写 s_reception_issue。</li>
 * </ol>
 *
 * <p>并发：同一店同一天的所有写操作都串在同一个锁对象上（沿用项目里 synchronized(intern) 的写法），
 * 队列行数小，读多写少。</p>
 *
 * @author reception
 * @date 2026/12/08
 */
@Service
@Slf4j
public class ReceptionQueueService extends BaseService<ReceptionQueueMapper, ReceptionQueue> {

    /** 值班 */
    public static final int DUTY_ON = 1;
    /** 休息/未值班 */
    public static final int DUTY_OFF = 0;
    public static final int VALID = 1;
    public static final int INVALID = 0;
    /** 当日初始化 */
    public static final int SOURCE_INIT = 0;
    /** 补位（有班次但当时不在队列） */
    public static final int SOURCE_SUPPLEMENT = 1;
    /** 调店进店 */
    public static final int SOURCE_TRANSFER = 2;
    /** 手动 */
    public static final int SOURCE_MANUAL = 3;

    /**
     * 服务单轮牌（正常接单用的一队）。
     *
     * <p>接待单轮牌是另一队：接待单把人从接待队里往后排，服务单把人从服务队里往后排，
     * 两边各走各的 seq / 结果编号 / 值班区，互不影响。</p>
     */
    public static final int KIND_SERVICE = 0;
    /** 接待单轮牌（见 {@link #KIND_SERVICE}） */
    public static final int KIND_RECEPTION = 1;

    private static final int DEFAULT_GRAB_WINDOW_MINUTES = 7;

    @Autowired
    MassagistSchedulesService massagistSchedulesService;
    @Autowired
    @Lazy
    MassagistService massagistService;
    @Autowired
    @Lazy
    OrderDetailService orderDetailService;
    @Autowired
    ReceptionQueueLogMapper queueLogMapper;
    @Autowired
    ReceptionIssueService issueService;
    @Autowired
    ReceptionConfigMapper configMapper;

    // ==================== 读 ====================

    /**
     * 当日队列（展示口径）：值班在前、休息在后，组内按 seq。
     * 不初始化、不写库，纯读。
     */
    public List<ReceptionQueue> orderList(String day, Long shopId) {
        return orderList(day, shopId, KIND_SERVICE);
    }

    public List<ReceptionQueue> orderList(String day, Long shopId, int kind) {
        if (day == null || shopId == null) {
            return Collections.emptyList();
        }
        return sorted(rows(day, shopId, kind));
    }

    /**
     * 营业前预生成当日队列（定时任务调）：幂等，已经有队列就只做补位。
     *
     * <p>以前是「谁先打开看板谁触发初始化」，顺序取决于那一刻的班次顺序，
     * 同一天不同时段看可能不一样；改成每天固定预生成后，一天之内顺序稳定。
     * 服务单、接待单两套队列同一天同一套班次顺序起队，之后各自走。</p>
     */
    public int prebuild(String day, Long shopId) {
        if (day == null || shopId == null) {
            return 0;
        }
        int size = ensureDay(day, shopId, null).size();
        ensureDay(day, shopId, null, KIND_RECEPTION);
        log.info("轮牌预生成 shop={} day={} 人数={}（服务单/接待单两套）", shopId, day, size);
        return size;
    }

    /**
     * 保证当日队列存在：没有就按「班次顺序 + 调店置前 + 每日轮换」生成；
     * 有排班但不在队列里的人补到队尾（调店/临时加班/历史数据缺口）。
     */
    public List<ReceptionQueue> ensureDay(String day, Long shopId, Collection<Long> candidateIds) {
        return ensureDay(day, shopId, candidateIds, KIND_SERVICE);
    }

    public List<ReceptionQueue> ensureDay(String day, Long shopId, Collection<Long> candidateIds, int kind) {
        if (day == null || shopId == null) {
            return Collections.emptyList();
        }
        synchronized (lockKey(day, shopId, kind)) {
            List<ReceptionQueue> all = rows(day, shopId, kind);
            if (all.isEmpty()) {
                initDay(day, shopId, candidateIds, kind);
                all = rows(day, shopId, kind);
            }
            if (all.isEmpty()) {
                return Collections.emptyList();
            }
            Set<Long> exist = all.stream().map(ReceptionQueue::getMassagistId).collect(Collectors.toSet());
            LinkedHashSet<Long> missing = new LinkedHashSet<>();
            // 有班次的人一个都不能漏，否则「排班表上有人、队列里没有」
            for (MassagistSchedules schedules : massagistSchedulesService.simpleListByDateAndShopId(day, shopId)) {
                if (schedules.getMassagistId() != null && !exist.contains(schedules.getMassagistId())) {
                    missing.add(schedules.getMassagistId());
                }
            }
            if (!CollectionUtils.isEmpty(candidateIds)) {
                candidateIds.stream().filter(Objects::nonNull).filter(id -> !exist.contains(id)).forEach(missing::add);
            }
            if (missing.isEmpty()) {
                return sorted(all);
            }
            long seq = maxSeq(all);
            int receiptNo = maxReceiptNo(all);
            List<ReceptionQueue> addRows = new ArrayList<>();
            List<ReceptionQueueLog> addLogs = new ArrayList<>();
            for (Long massagistId : missing) {
                seq++;
                receiptNo++;
                addRows.add(newRow(day, shopId, massagistId, seq, receiptNo, SOURCE_SUPPLEMENT, kind));
                addLogs.add(newLog(day, shopId, massagistId, kind, ReceptionQueueAction.ADD, null,
                        null, seq, null, DUTY_OFF, null, receiptNo, "补位", null));
            }
            saveBatch(addRows);
            saveLogs(addLogs);
            log.info("轮牌补位 shop={} day={} kind={} 人数={}", shopId, day, kind, addRows.size());
            return sorted(rows(day, shopId, kind));
        }
    }

    /** 单个人在队列里的行（可能为空） */
    public ReceptionQueue find(String day, Long shopId, Long massagistId) {
        return find(day, shopId, massagistId, KIND_SERVICE);
    }

    public ReceptionQueue find(String day, Long shopId, Long massagistId, int kind) {
        if (day == null || shopId == null || massagistId == null) {
            return null;
        }
        List<ReceptionQueue> list = rows(day, shopId, kind);
        return list.stream().filter(r -> massagistId.equals(r.getMassagistId())).findFirst().orElse(null);
    }

    /**
     * 派单顺序：只认 seq 升序（队序），不看值班分组。
     *
     * <p>值班/休息只影响看板怎么分组展示，不影响派单。派单口径就是
     * 「按队序找第一个在这个时段有空的」——忙不忙只看这一单的时段里有没有
     * 已占用的明细（服务单、接待单都算），其余一律算闲。</p>
     */
    public List<ReceptionQueue> dispatchOrder(String day, Long shopId, int kind) {
        return dispatchOrder(day, shopId, null, kind);
    }

    public List<ReceptionQueue> dispatchOrder(String day, Long shopId, Collection<Long> candidateIds, int kind) {
        return sortForDispatch(ensureDay(day, shopId, candidateIds, kind));
    }

    /**
     * 派单排序本体：只按 seq 升序，作废行剔掉。
     *
     * <p>刻意不碰 on_duty / duty_time —— 值班只决定看板分组，不决定谁先接单。
     * 这是店里确认过的口径，改这里之前先看 {@code ReceptionQueueDispatchOrderTest}。</p>
     */
    static List<ReceptionQueue> sortForDispatch(List<ReceptionQueue> list) {
        if (CollectionUtils.isEmpty(list)) {
            return Collections.emptyList();
        }
        return list.stream()
                .filter(q -> Objects.equals(q.getValid(), VALID))
                .sorted(Comparator.comparingLong((ReceptionQueue q) -> q.getSeq() == null ? 0L : q.getSeq()))
                .collect(Collectors.toList());
    }

    /**
     * 下一位该谁：按队序走一遍，跳过被排除的、不在班的、这一单的时段已有单的人。
     * 值班与否不作为派单条件。
     */
    public ReceptionQueue pickNext(String day, Long shopId, LocalDateTime startTime, LocalDateTime endTime, Collection<Long> excludeIds) {
        return pickNext(day, shopId, startTime, endTime, excludeIds, KIND_SERVICE);
    }

    public ReceptionQueue pickNext(String day, Long shopId, LocalDateTime startTime, LocalDateTime endTime,
                                   Collection<Long> excludeIds, int kind) {
        List<ReceptionQueue> list = dispatchOrder(day, shopId, kind).stream()
                .filter(q -> !CollectionUtils.isEmpty(excludeIds) ? !excludeIds.contains(q.getMassagistId()) : true)
                .collect(Collectors.toList());
        if (list.isEmpty()) {
            return null;
        }
        Map<Long, List<MassagistSchedules>> shifts = shiftMap(day, shopId);
        Map<Long, Boolean> busy = busyMap(shopId, startTime, endTime);
        for (ReceptionQueue q : list) {
            if (!inShift(shifts, q.getMassagistId(), startTime, endTime)) {
                continue;
            }
            if (Boolean.TRUE.equals(busy.get(q.getMassagistId()))) {
                continue;
            }
            return q;
        }
        return null;
    }

    /**
     * 看板：队列顺序 + 谁在忙 + 谁的单已过接待确认时限可抢。
     *
     * <p>列表顺序即值班区口径：值班的人按「点值班的先后」排（先点的在上面），
     * 休息的人按派单顺序垫后。派单本身只认 seq，所以每一行都带上 dispatchNo（派单顺序），
     * 值班区第 1 位不一定是下一个接单的人 —— 这是店里确认过的口径。</p>
     */
    public List<ReceptionBoardItem> board(String day, Long shopId) {
        return board(day, shopId, KIND_SERVICE);
    }

    public List<ReceptionBoardItem> board(String day, Long shopId, int kind) {
        List<ReceptionQueue> list = ensureDay(day, shopId, null, kind);
        if (CollectionUtils.isEmpty(list)) {
            return Collections.emptyList();
        }
        // 派单序号按 seq 排，不按展示顺序：值班区排第一的人不一定是下一个接单的人
        Map<Long, Integer> dispatchNo = new HashMap<>();
        int no = 0;
        for (ReceptionQueue q : dispatchOrder(day, shopId, kind)) {
            dispatchNo.put(q.getMassagistId(), ++no);
        }
        List<ReceptionQueue> display = dutySorted(list);
        LocalDateTime now = LocalDateTime.now();
        List<OrderDetail> doing = orderDetailService.list(new LambdaQueryWrapper<OrderDetail>()
                .eq(OrderDetail::getShopId, shopId)
                .ne(OrderDetail::getState, AppointmentState.CANCELED.getValue())
                .le(OrderDetail::getStartTime, now)
                .ge(OrderDetail::getEndTime, now));
        Map<Long, OrderDetail> doingMap = doing.stream()
                .filter(d -> d.getMassagistId() != null)
                .collect(Collectors.toMap(OrderDetail::getMassagistId, d -> d,
                        (a, b) -> a.getEndTime().isAfter(b.getEndTime()) ? a : b));
        int window = grabWindowMinutes(shopId);
        List<ReceptionBoardItem> items = new ArrayList<>();
        int dutyNo = 0;
        for (ReceptionQueue q : display) {
            ReceptionBoardItem item = new ReceptionBoardItem();
            item.setQueueKind(kind);
            item.setMassagistId(q.getMassagistId());
            item.setMassagistName(massagistName(q.getMassagistId()));
            item.setReceiptNo(q.getReceiptNo());
            item.setSeq(q.getSeq());
            item.setOnDuty(q.getOnDuty());
            item.setDutyTime(q.getDutyTime());
            item.setDutyNo(isOnDuty(q) ? ++dutyNo : null);
            item.setDispatchNo(dispatchNo.get(q.getMassagistId()));
            item.setAssignCount(q.getAssignCount());
            item.setLastAssignTime(q.getLastAssignTime());
            OrderDetail current = doingMap.get(q.getMassagistId());
            item.setBusy(current != null);
            if (current != null) {
                item.setCurrentDetailId(current.getId());
                item.setBusyUntil(current.getEndTime());
            }
            if (q.getLastAssignTime() != null) {
                item.setGrabDeadline(q.getLastAssignTime().plusMinutes(window));
                item.setGrabbable(now.isAfter(item.getGrabDeadline()));
            } else {
                item.setGrabbable(false);
            }
            items.add(item);
        }
        return items;
    }

    /**
     * 超时未接待扫描（定时任务每分钟跑）：约的时间到了、窗口内没人点接待，
     * 就挂一条可抢单事项，看板上其他人能直接看到并抢。服务单、接待单两套队列都扫。
     */
    public int scanTimeout(String day, Long shopId) {
        if (day == null || shopId == null) {
            return 0;
        }
        LocalDate date = parseDay(day);
        issueService.expire(date, shopId);
        int window = grabWindowMinutes(shopId);
        LocalDateTime now = LocalDateTime.now();
        List<OrderDetail> waiting = orderDetailService.list(new LambdaQueryWrapper<OrderDetail>()
                .eq(OrderDetail::getShopId, shopId)
                .eq(OrderDetail::getState, AppointmentState.WAITING.getValue())
                .le(OrderDetail::getStartTime, now)
                .isNotNull(OrderDetail::getMassagistId)
                .orderByAsc(OrderDetail::getStartTime)
                .last("LIMIT 200"));
        int created = 0;
        for (OrderDetail d : waiting) {
            int kind = kindOfDetail(day, shopId, d.getId());
            ReceptionQueue q = find(day, shopId, d.getMassagistId(), kind);
            if (q == null || q.getLastAssignTime() == null) {
                continue;
            }
            LocalDateTime deadline = q.getLastAssignTime().plusMinutes(window);
            if (now.isBefore(deadline)) {
                continue;
            }
            if (issueService.timeout(day, shopId, d.getId(), d.getMassagistId(), deadline,
                    massagistName(d.getMassagistId()) + "超过" + window + "分钟未接待，可抢单")) {
                created++;
            }
        }
        if (created > 0) {
            log.info("轮牌超时未接待 shop={} day={} 新增={}", shopId, day, created);
        }
        return created;
    }

    /**
     * 这一单推进的是哪一套队列：以上钟流水里记的 queue_kind 为准（接待单由接待流程写成接待队）。
     * 没有流水（老数据 / 还没上过钟）按服务单算。
     */
    public int kindOfDetail(String day, Long shopId, Long detailId) {
        if (detailId == null) {
            return KIND_SERVICE;
        }
        try {
            ReceptionQueueLog assignLog = latestAssignLog(day, shopId, detailId);
            return assignLog == null ? KIND_SERVICE : kindOf(assignLog.getQueueKind());
        } catch (Exception e) {
            log.debug("轮牌：读取明细{}的轮牌类型失败，按服务单处理", detailId, e);
            return KIND_SERVICE;
        }
    }

    // ==================== 写 ====================
    /**
     * 上钟：把这个人移到队尾、置为值班、结果编号往后延。
     * 按 detailId 幂等 —— 同一单重复调用不会把人往后推两次。
     */
    @Transactional(rollbackFor = Exception.class)
    public void assign(String day, Long shopId, Long massagistId, Long detailId, String operator) {
        assign(day, shopId, massagistId, detailId, operator, KIND_SERVICE);
    }

    @Transactional(rollbackFor = Exception.class)
    public void assign(String day, Long shopId, Long massagistId, Long detailId, String operator, int kind) {
        if (day == null || shopId == null || massagistId == null) {
            return;
        }
        synchronized (lockKey(day, shopId, kind)) {
            if (detailId != null && assignedLogCount(day, shopId, detailId, kind) > 0) {
                log.debug("轮牌：明细{}已记录过上钟，跳过", detailId);
                return;
            }
            doAssign(day, shopId, massagistId, detailId, ReceptionQueueAction.ASSIGN, operator, kind);
        }
    }

    /**
     * 抢单成功：这一单改由抢到的人接，把他移到队尾（流水记 GRAB，便于和普通上钟区分）。
     */
    @Transactional(rollbackFor = Exception.class)
    public void grabAssign(String day, Long shopId, Long massagistId, Long detailId, String operator) {
        grabAssign(day, shopId, massagistId, detailId, operator, KIND_SERVICE);
    }

    @Transactional(rollbackFor = Exception.class)
    public void grabAssign(String day, Long shopId, Long massagistId, Long detailId, String operator, int kind) {
        if (day == null || shopId == null || massagistId == null) {
            return;
        }
        synchronized (lockKey(day, shopId, kind)) {
            doAssign(day, shopId, massagistId, detailId, ReceptionQueueAction.GRAB, operator, kind);
        }
    }

    private void doAssign(String day, Long shopId, Long massagistId, Long detailId, ReceptionQueueAction action,
                          String operator, int kind) {
        List<ReceptionQueue> all = rows(day, shopId, kind);
        if (all.isEmpty()) {
            ensureDay(day, shopId, Collections.singletonList(massagistId), kind);
            all = rows(day, shopId, kind);
        }
        ReceptionQueue q = all.stream().filter(r -> massagistId.equals(r.getMassagistId())).findFirst().orElse(null);
        if (q == null) {
            q = addRowAtTail(day, shopId, massagistId, "上钟补位", operator, kind);
        }
        long beforeSeq = nvl(q.getSeq());
        int beforeReceipt = nvl(q.getReceiptNo());
        int beforeDuty = nvl(q.getOnDuty());
        // 上钟留痕：排在前面的人为什么没轮到，直接写在日志里，前台/复盘不用再猜
        String reason = action == ReceptionQueueAction.GRAB ? "抢单成功"
                : skipNote(day, shopId, detailId, massagistId, kind);

        q.setSeq(maxSeq(all) + 1);
        q.setOnDuty(DUTY_ON);
        q.setDutyTime(LocalDateTime.now());
        q.setValid(VALID);
        q.setAssignCount(nvl(q.getAssignCount()) + 1);
        q.setLastAssignTime(LocalDateTime.now());
        q.setReceiptNo(maxReceiptNo(all) + 1);
        updateById(q);
        saveLog(newLog(day, shopId, massagistId, kind, action, detailId,
                beforeSeq, q.getSeq(), beforeDuty, DUTY_ON, beforeReceipt, q.getReceiptNo(),
                reason, operator));
        log.info("轮牌上钟 shop={} kind={} massagist={} detail={} seq {}→{} receipt {}→{}{}", shopId, kind, massagistId,
                detailId, beforeSeq, q.getSeq(), beforeReceipt, q.getReceiptNo(),
                reason == null ? "" : " " + reason);

        // 接到活的人，之前挂着的值班意向就算兑现了
        issueService.closeIntent(parseDay(day), shopId, massagistId, operator);
        maybeRenumber(day, shopId, beforeReceipt, kind);
    }

    /**
     * 撤销回位：取消/改期/换人时把这个人放回上钟前的位置，只回位置不做其它变更。
     * 同一单被抢过多次也能逐次回位（按 ASSIGN/GRAB 与 REVERT 的条数配平）。
     */
    @Transactional(rollbackFor = Exception.class)
    public void revert(String day, Long shopId, Long detailId, String operator) {
        if (detailId == null || day == null || shopId == null) {
            return;
        }
        // 这一单当初推的是哪一队（服务单/接待单），就回哪一队
        ReceptionQueueLog assignLog = latestAssignLog(day, shopId, detailId);
        if (assignLog == null) {
            return;
        }
        int kind = kindOf(assignLog.getQueueKind());
        synchronized (lockKey(day, shopId, kind)) {
            int assigns = assignedLogCount(day, shopId, detailId, kind);
            int reverts = countLog(day, shopId, detailId, kind, ReceptionQueueAction.REVERT.getValue());
            if (reverts >= assigns) {
                log.debug("轮牌：明细{}已回位过，跳过", detailId);
                return;
            }
            ReceptionQueue q = find(day, shopId, assignLog.getMassagistId(), kind);
            if (q == null) {
                return;
            }
            long beforeSeq = nvl(q.getSeq());
            int beforeReceipt = nvl(q.getReceiptNo());
            int beforeDuty = nvl(q.getOnDuty());
            // 这次上钟之后他又接了别的单：位置以最新一次上钟为准，只把计数还回去、不回退位置。
            // 否则取消/改期来回几次，人会从队尾一路被拉回队头，整条顺序就乱了。
            boolean stillLatest = assignLog.getAfterSeq() == null || beforeSeq == nvl(assignLog.getAfterSeq());
            String reason = "取消/改期回位";
            if (stillLatest) {
                q.setSeq(assignLog.getBeforeSeq() == null ? beforeSeq : assignLog.getBeforeSeq());
                if (assignLog.getBeforeReceiptNo() != null) {
                    q.setReceiptNo(assignLog.getBeforeReceiptNo());
                }
                if (assignLog.getBeforeOnDuty() != null) {
                    q.setOnDuty(assignLog.getBeforeOnDuty());
                }
            } else {
                reason = "取消/改期：之后已有新上钟记录，位置不回退";
            }
            q.setAssignCount(Math.max(0, nvl(q.getAssignCount()) - 1));
            updateById(q);
            saveLog(newLog(day, shopId, q.getMassagistId(), kind, ReceptionQueueAction.REVERT, detailId,
                    beforeSeq, q.getSeq(), beforeDuty, q.getOnDuty(), beforeReceipt, q.getReceiptNo(), reason, operator));
            log.info("轮牌回位 shop={} kind={} massagist={} seq {}→{} {}{}", shopId, kind, q.getMassagistId(), beforeSeq, q.getSeq(),
                    reason, stillLatest ? "" : "（不回退）");
        }
    }

    /**
     * 值班 / 下值班：只改分组，不动 seq。
     * 点值班时如果这个人当下排不上（在服务/不在班），给一个限时抢单资格。
     *
     * <p>值班区按点值班的先后排（dutyTime），服务单/接待单两套队列各有各的值班区。</p>
     */
    @Transactional(rollbackFor = Exception.class)
    public ReceptionQueue switchDuty(String day, Long shopId, Long massagistId, boolean onDuty, String operator) {
        return switchDuty(day, shopId, massagistId, onDuty, operator, KIND_SERVICE);
    }

    @Transactional(rollbackFor = Exception.class)
    public ReceptionQueue switchDuty(String day, Long shopId, Long massagistId, boolean onDuty, String operator, int kind) {
        if (day == null || shopId == null || massagistId == null) {
            throw new BusinessException("请选择疗愈师");
        }
        synchronized (lockKey(day, shopId, kind)) {
            ensureDay(day, shopId, Collections.singletonList(massagistId), kind);
            ReceptionQueue q = find(day, shopId, massagistId, kind);
            if (q == null) {
                throw new BusinessException("该疗愈师今天没有排班，不能值班");
            }
            int beforeDuty = nvl(q.getOnDuty());
            int target = onDuty ? DUTY_ON : DUTY_OFF;
            if (beforeDuty != target) {
                q.setOnDuty(target);
                if (onDuty) {
                    // 值班区顺序 = 点值班的先后；重新点一次值班就排到值班区末尾
                    q.setDutyTime(LocalDateTime.now());
                }
                updateById(q);
                saveLog(newLog(day, shopId, massagistId, kind,
                        onDuty ? ReceptionQueueAction.ON_DUTY : ReceptionQueueAction.OFF_DUTY, null,
                        q.getSeq(), q.getSeq(), beforeDuty, target, q.getReceiptNo(), q.getReceiptNo(),
                        onDuty ? null : "手动下值班", operator));
            }
            if (onDuty) {
                // 点值班当下如果还在上钟/已经错过时间，就只剩「抢单」这一条路，给个时限
                Map<Long, Boolean> busy = busyMap(shopId, LocalDateTime.now(), LocalDateTime.now().plusMinutes(1));
                boolean unavailable = Boolean.TRUE.equals(busy.get(massagistId));
                if (unavailable) {
                    int window = grabWindowMinutes(shopId);
                    issueService.dutyIntent(day, shopId, massagistId, window,
                            "点值班时仍在服务中，可在" + window + "分钟内抢单");
                }
            }
            return q;
        }
    }

    /** 接待完成（下钟）：回到休息区，位置不动 —— 下次点值班时按原来的位置排 */
    @Transactional(rollbackFor = Exception.class)
    public void finish(String day, Long shopId, Long massagistId, String operator) {
        finish(day, shopId, massagistId, operator, KIND_SERVICE);
    }

    @Transactional(rollbackFor = Exception.class)
    public void finish(String day, Long shopId, Long massagistId, String operator, int kind) {
        if (day == null || shopId == null || massagistId == null) {
            return;
        }
        synchronized (lockKey(day, shopId, kind)) {
            ReceptionQueue q = find(day, shopId, massagistId, kind);
            if (q == null) {
                return;
            }
            int beforeDuty = nvl(q.getOnDuty());
            q.setOnDuty(DUTY_OFF);
            updateById(q);
            saveLog(newLog(day, shopId, massagistId, kind, ReceptionQueueAction.FINISH, null,
                    q.getSeq(), q.getSeq(), beforeDuty, DUTY_OFF, q.getReceiptNo(), q.getReceiptNo(),
                    "接待完成，回到休息区", operator));
            issueService.closeIntent(parseDay(day), shopId, massagistId, operator);
        }
    }

    /**
     * 交换顺序（手工调序）：把 a 放到 b 原来的位置、b 放到 a 原来的位置。
     *
     * <p>只交换 seq，不动值班分组、不动结果编号。不做「整轮重排」，其余人的相对顺序保持不变；
     * 队列里没有的人按「补位」先补到队尾，再参与交换。</p>
     */
    @Transactional(rollbackFor = Exception.class)
    public void swap(String day, Long shopId, Long massagistIdA, Long massagistIdB, String operator) {
        swap(day, shopId, massagistIdA, massagistIdB, operator, KIND_SERVICE);
    }

    @Transactional(rollbackFor = Exception.class)
    public void swap(String day, Long shopId, Long massagistIdA, Long massagistIdB, String operator, int kind) {
        if (day == null || shopId == null || massagistIdA == null || massagistIdB == null) {
            throw new BusinessException("请选择两名疗愈师");
        }
        if (Objects.equals(massagistIdA, massagistIdB)) {
            throw new BusinessException("不能和自己交换顺序");
        }
        synchronized (lockKey(day, shopId, kind)) {
            ensureDay(day, shopId, Arrays.asList(massagistIdA, massagistIdB), kind);
            ReceptionQueue a = find(day, shopId, massagistIdA, kind);
            ReceptionQueue b = find(day, shopId, massagistIdB, kind);
            if (a == null) {
                a = addRowAtTail(day, shopId, massagistIdA, "调序补位", operator, kind);
            }
            if (b == null) {
                b = addRowAtTail(day, shopId, massagistIdB, "调序补位", operator, kind);
            }
            if (Objects.equals(a.getValid(), INVALID) || Objects.equals(b.getValid(), INVALID)) {
                throw new BusinessException("已退出轮牌的疗愈师不能参与调序");
            }
            long seqA = nvl(a.getSeq());
            long seqB = nvl(b.getSeq());
            if (seqA == seqB) {
                // 老数据可能没有 seq：按当前展示顺序重新铺一遍，再交换
                long seq = 0;
                for (ReceptionQueue q : sorted(rows(day, shopId, kind))) {
                    seq += 10;
                    q.setSeq(seq);
                }
                updateBatchById(rows(day, shopId, kind));
                a = find(day, shopId, massagistIdA, kind);
                b = find(day, shopId, massagistIdB, kind);
                if (a == null || b == null) {
                    throw new BusinessException("调序失败，请刷新后重试");
                }
                seqA = nvl(a.getSeq());
                seqB = nvl(b.getSeq());
            }
            a.setSeq(seqB);
            b.setSeq(seqA);
            updateBatchById(Arrays.asList(a, b));
            saveLogs(Arrays.asList(
                    newLog(day, shopId, massagistIdA, kind, ReceptionQueueAction.SWAP, null,
                            seqA, seqB, a.getOnDuty(), a.getOnDuty(), a.getReceiptNo(), a.getReceiptNo(),
                            "与" + massagistName(massagistIdB) + "交换顺序", operator),
                    newLog(day, shopId, massagistIdB, kind, ReceptionQueueAction.SWAP, null,
                            seqB, seqA, b.getOnDuty(), b.getOnDuty(), b.getReceiptNo(), b.getReceiptNo(),
                            "与" + massagistName(massagistIdA) + "交换顺序", operator)));
            log.info("轮牌调序 shop={} day={} kind={} {}<->{} seq {}<->{}", shopId, day, kind,
                    massagistIdA, massagistIdB, seqA, seqB);
        }
    }

    /** 调店进店：插到队头，优先接客（与原来「调店人员排最前面」的口径一致） */
    @Transactional(rollbackFor = Exception.class)
    public void joinFromOtherShop(String day, Long shopId, Long massagistId, String operator) {
        joinFromOtherShop(day, shopId, massagistId, operator, KIND_SERVICE);
    }

    @Transactional(rollbackFor = Exception.class)
    public void joinFromOtherShop(String day, Long shopId, Long massagistId, String operator, int kind) {
        if (day == null || shopId == null || massagistId == null) {
            return;
        }
        synchronized (lockKey(day, shopId, kind)) {
            List<ReceptionQueue> all = rows(day, shopId, kind);
            if (all.isEmpty()) {
                ensureDay(day, shopId, Collections.singletonList(massagistId), kind);
                all = rows(day, shopId, kind);
            }
            ReceptionQueue q = all.stream().filter(r -> massagistId.equals(r.getMassagistId())).findFirst().orElse(null);
            if (q == null) {
                long minSeq = all.stream().mapToLong(r -> nvl(r.getSeq())).min().orElse(1L);
                int receiptNo = maxReceiptNo(all) + 1;
                ReceptionQueue row = newRow(day, shopId, massagistId, minSeq - 1, receiptNo, SOURCE_TRANSFER, kind);
                save(row);
                saveLog(newLog(day, shopId, massagistId, kind, ReceptionQueueAction.JOIN, null,
                        null, row.getSeq(), null, DUTY_OFF, null, receiptNo, "调店进店", operator));
                return;
            }
            long beforeSeq = nvl(q.getSeq());
            long minSeq = all.stream().mapToLong(r -> nvl(r.getSeq())).min().orElse(0L);
            q.setSeq(minSeq - 1);
            q.setValid(VALID);
            q.setSource(SOURCE_TRANSFER);
            updateById(q);
            saveLog(newLog(day, shopId, massagistId, kind, ReceptionQueueAction.JOIN, null,
                    beforeSeq, q.getSeq(), q.getOnDuty(), q.getOnDuty(), q.getReceiptNo(), q.getReceiptNo(), "调店进店", operator));
        }
    }

    /**
     * 退出轮牌（休假/调走）：不删行，只标无效。
     * 删行是历史上一堆顺序错乱的根因 —— 位置一删，后面的人就顶上来了。
     */
    @Transactional(rollbackFor = Exception.class)
    public void leave(String day, Long shopId, Long massagistId, String reason, String operator) {
        leave(day, shopId, massagistId, reason, operator, KIND_SERVICE);
    }

    @Transactional(rollbackFor = Exception.class)
    public void leave(String day, Long shopId, Long massagistId, String reason, String operator, int kind) {
        if (day == null || shopId == null || massagistId == null) {
            return;
        }
        synchronized (lockKey(day, shopId, kind)) {
            ReceptionQueue q = find(day, shopId, massagistId, kind);
            if (q == null || Objects.equals(q.getValid(), INVALID)) {
                return;
            }
            q.setValid(INVALID);
            q.setOnDuty(DUTY_OFF);
            updateById(q);
            saveLog(newLog(day, shopId, massagistId, kind, ReceptionQueueAction.LEAVE, null,
                    q.getSeq(), q.getSeq(), DUTY_ON, DUTY_OFF, q.getReceiptNo(), q.getReceiptNo(), reason, operator));
        }
    }

    /** 抢单窗口（分钟），门店没配就用默认 7 分钟 */
    public int grabWindowMinutes(Long shopId) {
        List<ReceptionConfig> configs = configMapper.selectList(null);
        Integer value = configs.stream()
                .filter(c -> Objects.equals(c.getShopId(), shopId) && c.getGrabWindowMinutes() != null)
                .map(ReceptionConfig::getGrabWindowMinutes)
                .findFirst()
                .orElseGet(() -> configs.stream()
                        .filter(c -> Objects.equals(c.getShopId(), 0L) && c.getGrabWindowMinutes() != null)
                        .map(ReceptionConfig::getGrabWindowMinutes)
                        .findFirst()
                        .orElse(DEFAULT_GRAB_WINDOW_MINUTES));
        return value == null || value <= 0 ? DEFAULT_GRAB_WINDOW_MINUTES : value;
    }

    // ==================== 内部 ====================

    private void initDay(String day, Long shopId, Collection<Long> candidateIds, int kind) {
        // 当天在本店有班的人（本店班次 + 调进本店的班次），以及各自最早上班时间
        LinkedHashSet<Long> scheduled = new LinkedHashSet<>();
        Map<Long, LocalTime> shiftStart = new HashMap<>();
        for (MassagistSchedules s : massagistSchedulesService.simpleListByDateAndShopId(day, shopId)) {
            if (s.getMassagistId() == null) {
                continue;
            }
            scheduled.add(s.getMassagistId());
            if (s.getStartTime() != null) {
                shiftStart.merge(s.getMassagistId(), s.getStartTime(), (a, b) -> a.isBefore(b) ? a : b);
            }
        }
        LinkedHashSet<Long> order = new LinkedHashSet<>();
        try {
            // 班次顺序：调店人员排最前 + 每日轮换（sequenceEnableDay），历史口径原样保留；
            // 只取当天真有班的人，班表上没有的人（休息/离职遗留）不再占队头
            List<Long> seed = massagistSchedulesService.getMassagistSchedulesList(day, shopId);
            if (!CollectionUtils.isEmpty(seed)) {
                if (scheduled.isEmpty()) {
                    // 这家店当天完全没排班（有的店不用排班）：保持老口径，按全员班次顺序铺
                    order.addAll(seed);
                } else {
                    seed.stream().filter(scheduled::contains).forEach(order::add);
                }
            }
        } catch (BusinessException e) {
            log.info("轮牌初始化：当天没有排班记录 shop={} day={}", shopId, day);
        }
        // 排班表上有、但不在班次顺序里的人，按上班时间接在后面
        scheduled.stream()
                .sorted(Comparator.comparing((Long id) -> shiftStart.getOrDefault(id, LocalTime.MAX))
                        .thenComparingLong(id -> id))
                .forEach(order::add);
        LocalDate queueDate = parseDay(day);
        if (queueDate.isBefore(LocalDate.now())) {
            // 历史日期补建：按当天真实的上下钟顺序回填，别拿今天的班次顺序糊历史
            LinkedHashSet<Long> actual = actualAssignOrder(shopId, queueDate);
            if (!actual.isEmpty()) {
                actual.addAll(order);
                order = actual;
            }
        }
        if (!CollectionUtils.isEmpty(candidateIds)) {
            candidateIds.stream().filter(Objects::nonNull).forEach(order::add);
        }
        if (kind == KIND_RECEPTION) {
            // 接待队顺序 = 服务单队顺序反过来（服务队排最后的先接接待），两套队各自往后轮
            order = reverseOrder(order);
        }
        if (order.isEmpty()) {
            return;
        }
        List<ReceptionQueue> addRows = new ArrayList<>();
        List<ReceptionQueueLog> addLogs = new ArrayList<>();
        long seq = 0;
        int receiptNo = 0;
        for (Long massagistId : order) {
            seq++;
            receiptNo++;
            addRows.add(newRow(day, shopId, massagistId, seq, receiptNo, SOURCE_INIT, kind));
            addLogs.add(newLog(day, shopId, massagistId, kind, ReceptionQueueAction.INIT, null,
                    null, seq, null, DUTY_OFF, null, receiptNo, "当日初始化", null));
        }
        saveBatch(addRows);
        saveLogs(addLogs);
        log.info("轮牌初始化 shop={} day={} kind={} 人数={}", shopId, day, kind, addRows.size());
    }

    /**
     * 倒序一份队列顺序：接待队用「服务队顺序反过来」的起始顺序。
     */
    private LinkedHashSet<Long> reverseOrder(Collection<Long> order) {
        if (CollectionUtils.isEmpty(order)) {
            return new LinkedHashSet<>();
        }
        List<Long> list = new ArrayList<>(order);
        Collections.reverse(list);
        return new LinkedHashSet<>(list);
    }

    /**
     * 某天真实的上钟顺序：按明细开始时间排，最早开工的人排最前。
     *
     * <p>只用于历史日期补建队列——历史队列没生成过时，按当天的真实顺序回填才有意义。
     * 注意不能用 s_round_schedule.round 排：那是「这个人今天第几单」，不是全店的上钟先后。</p>
     */
    private LinkedHashSet<Long> actualAssignOrder(Long shopId, LocalDate date) {
        LinkedHashSet<Long> actual = new LinkedHashSet<>();
        if (shopId == null || date == null) {
            return actual;
        }
        try {
            List<OrderDetail> list = orderDetailService.list(new LambdaQueryWrapper<OrderDetail>()
                    .eq(OrderDetail::getShopId, shopId)
                    .isNotNull(OrderDetail::getMassagistId)
                    .ne(OrderDetail::getState, AppointmentState.CANCELED.getValue())
                    .ge(OrderDetail::getStartTime, date.atStartOfDay())
                    .lt(OrderDetail::getStartTime, date.plusDays(1).atStartOfDay())
                    .orderByAsc(OrderDetail::getStartTime)
                    .orderByAsc(OrderDetail::getId));
            list.stream().map(OrderDetail::getMassagistId).filter(id -> id != null && id > 0).forEach(actual::add);
        } catch (Exception e) {
            log.warn("轮牌历史回填：读取当天上钟顺序失败 shop={} day={}", shopId, date, e);
        }
        return actual;
    }

    private ReceptionQueue addRowAtTail(String day, Long shopId, Long massagistId, String reason, String operator, int kind) {
        List<ReceptionQueue> all = rows(day, shopId, kind);
        long seq = maxSeq(all) + 1;
        int receiptNo = maxReceiptNo(all) + 1;
        ReceptionQueue row = newRow(day, shopId, massagistId, seq, receiptNo, SOURCE_SUPPLEMENT, kind);
        save(row);
        saveLog(newLog(day, shopId, massagistId, kind, ReceptionQueueAction.ADD, null,
                null, seq, null, DUTY_OFF, null, receiptNo, reason, operator));
        return row;
    }

    /**
     * 结果编号重排：只有「全员都接待过一遍」且「刚才上钟的是队头」才重排回 1..n，
     * 否则一路往后延（3 号做了就变 6 号），跟店里的口径一致。
     */
    private void maybeRenumber(String day, Long shopId, int assignedBeforeReceipt, int kind) {
        List<ReceptionQueue> valid = sorted(rows(day, shopId, kind));
        if (valid.size() <= 1) {
            return;
        }
        boolean allServed = valid.stream().allMatch(q -> nvl(q.getAssignCount()) > 0);
        int minReceipt = valid.stream().mapToInt(q -> nvl(q.getReceiptNo())).min().orElse(0);
        boolean assignedWasHead = assignedBeforeReceipt <= minReceipt;
        if (!allServed || !assignedWasHead) {
            return;
        }
        long seqNo = 0;
        List<ReceptionQueue> update = new ArrayList<>();
        List<ReceptionQueueLog> logs = new ArrayList<>();
        for (ReceptionQueue q : valid) {
            seqNo++;
            if (!Objects.equals(q.getReceiptNo(), (int) seqNo)) {
                int before = nvl(q.getReceiptNo());
                q.setReceiptNo((int) seqNo);
                update.add(q);
                logs.add(newLog(day, shopId, q.getMassagistId(), kind, ReceptionQueueAction.RENO, null,
                        q.getSeq(), q.getSeq(), q.getOnDuty(), q.getOnDuty(), before, q.getReceiptNo(), "全员轮完，重排编号", null));
            }
        }
        if (!update.isEmpty()) {
            updateBatchById(update);
            saveLogs(logs);
            log.info("轮牌编号重排 shop={} day={} kind={} 人数={}", shopId, day, kind, update.size());
        }
    }

    /**
     * 上钟留痕：写清楚「排在他前面的人为什么没轮到」——不在班 / 在服务 / 未值班。
     *
     * <p>以前只有代码里 skipMassagist 的 debug 日志，库里查不到，
     * 于是「跳过 2 号派给 4 号」看起来就像系统乱排。现在直接落在上钟流水上。</p>
     */
    private String skipNote(String day, Long shopId, Long detailId, Long massagistId, int kind) {
        List<ReceptionQueue> ordered = sortForDispatch(rows(day, shopId, kind));
        int index = -1;
        for (int i = 0; i < ordered.size(); i++) {
            if (massagistId.equals(ordered.get(i).getMassagistId())) {
                index = i;
                break;
            }
        }
        if (index <= 0) {
            return null;
        }
        // 按这单的服务时段判断「能不能接」，而不是按此刻——预约单提前排人时此刻没人在班很正常
        LocalDateTime startTime = null;
        LocalDateTime endTime = null;
        if (detailId != null) {
            try {
                OrderDetail detail = orderDetailService.getById(detailId);
                if (detail != null) {
                    startTime = detail.getStartTime();
                    endTime = detail.getEndTime();
                }
            } catch (Exception e) {
                log.debug("上钟留痕：读取明细失败 detail={}", detailId, e);
            }
        }
        Map<Long, List<MassagistSchedules>> shifts = shiftMap(day, shopId);
        Map<Long, Boolean> busy = startTime == null
                ? busyMap(shopId, LocalDateTime.now(), LocalDateTime.now().plusMinutes(1))
                : busyMap(shopId, startTime, endTime);
        List<String> notes = new ArrayList<>();
        for (int i = 0; i < index && notes.size() < 3; i++) {
            ReceptionQueue q = ordered.get(i);
            String why;
            if (!inShift(shifts, q.getMassagistId(), startTime, endTime)) {
                why = "不在班";
            } else if (Boolean.TRUE.equals(busy.get(q.getMassagistId()))) {
                why = "在服务";
            } else {
                // 确实该轮到他却被跳过了：不硬编原因，交给人工核对，日志里不写误导信息
                continue;
            }
            notes.add(massagistName(q.getMassagistId()) + "(" + why + ")");
        }
        if (notes.isEmpty()) {
            return null;
        }
        String note = "跳过" + String.join("、", notes) + (index > notes.size() ? "等" + index + "人" : "");
        return note.length() > 200 ? note.substring(0, 200) : note;
    }

    private List<ReceptionQueue> rows(String day, Long shopId, int kind) {
        LocalDate date = parseDay(day);
        return list(new LambdaQueryWrapper<ReceptionQueue>()
                .eq(ReceptionQueue::getQueueDate, date)
                .eq(ReceptionQueue::getShopId, shopId)
                .eq(ReceptionQueue::getQueueKind, kind)
                .orderByAsc(ReceptionQueue::getSeq)
                .orderByAsc(ReceptionQueue::getId));
    }

    private List<ReceptionQueue> sorted(List<ReceptionQueue> list) {
        return list.stream()
                .filter(q -> Objects.equals(q.getValid(), VALID))
                .sorted(Comparator.comparingInt((ReceptionQueue q) -> isOnDuty(q) ? 0 : 1)
                        .thenComparingLong(q -> nvl(q.getSeq())))
                .collect(Collectors.toList());
    }

    /**
     * 值班区展示口径：值班的人按点值班的先后排（dutyTime，先点的在上），没点值班时间的按 seq 兜底；
     * 休息的人按派单顺序垫在后面。派单不按这个顺序，派单只认 {@link #sorted}。
     */
    private List<ReceptionQueue> dutySorted(List<ReceptionQueue> list) {
        List<ReceptionQueue> valid = list.stream()
                .filter(q -> Objects.equals(q.getValid(), VALID))
                .collect(Collectors.toList());
        List<ReceptionQueue> duty = valid.stream()
                .filter(this::isOnDuty)
                .sorted(Comparator.comparing((ReceptionQueue q) -> q.getDutyTime() == null ? LocalDateTime.MAX : q.getDutyTime())
                        .thenComparingLong(q -> nvl(q.getSeq())))
                .collect(Collectors.toList());
        List<ReceptionQueue> rest = sorted(valid).stream()
                .filter(q -> !isOnDuty(q))
                .collect(Collectors.toList());
        List<ReceptionQueue> all = new ArrayList<>(duty);
        all.addAll(rest);
        return all;
    }

    private boolean isOnDuty(ReceptionQueue q) {
        return Objects.equals(q.getOnDuty(), DUTY_ON);
    }

    private ReceptionQueue newRow(String day, Long shopId, Long massagistId, long seq, int receiptNo, int source, int kind) {
        ReceptionQueue row = new ReceptionQueue();
        row.setQueueDate(parseDay(day));
        row.setShopId(shopId);
        row.setQueueKind(kind);
        row.setMassagistId(massagistId);
        row.setSeq(seq);
        row.setReceiptNo(receiptNo);
        row.setOnDuty(DUTY_OFF);
        row.setValid(VALID);
        row.setSource(source);
        row.setAssignCount(0);
        return row;
    }

    private ReceptionQueueLog newLog(String day, Long shopId, Long massagistId, int kind, ReceptionQueueAction action, Long detailId,
                                     Long beforeSeq, Long afterSeq, Integer beforeDuty, Integer afterDuty,
                                     Integer beforeReceiptNo, Integer afterReceiptNo, String reason, String operator) {
        ReceptionQueueLog logRow = new ReceptionQueueLog();
        logRow.setQueueDate(parseDay(day));
        logRow.setShopId(shopId);
        logRow.setQueueKind(kind);
        logRow.setMassagistId(massagistId);
        logRow.setAction(action.getValue());
        logRow.setDetailId(detailId);
        logRow.setBeforeSeq(beforeSeq);
        logRow.setAfterSeq(afterSeq);
        logRow.setBeforeOnDuty(beforeDuty);
        logRow.setAfterOnDuty(afterDuty);
        logRow.setBeforeReceiptNo(beforeReceiptNo);
        logRow.setAfterReceiptNo(afterReceiptNo);
        logRow.setReason(reason);
        logRow.setOperatorName(operator);
        return logRow;
    }

    private void saveLog(ReceptionQueueLog logRow) {
        logRow.setCreateTime(LocalDateTime.now());
        queueLogMapper.insert(logRow);
    }

    private void saveLogs(List<ReceptionQueueLog> logs) {
        if (CollectionUtils.isEmpty(logs)) {
            return;
        }
        LocalDateTime now = LocalDateTime.now();
        logs.forEach(l -> l.setCreateTime(now));
        logs.forEach(queueLogMapper::insert);
    }

    /** 这一单最新的一次上钟流水（不分轮牌类型：回位时要靠它判断推的是哪一队） */
    private ReceptionQueueLog latestAssignLog(String day, Long shopId, Long detailId) {
        List<ReceptionQueueLog> list = queueLogMapper.selectList(new LambdaQueryWrapper<ReceptionQueueLog>()
                .eq(ReceptionQueueLog::getQueueDate, parseDay(day))
                .eq(ReceptionQueueLog::getShopId, shopId)
                .eq(ReceptionQueueLog::getDetailId, detailId)
                .in(ReceptionQueueLog::getAction, ReceptionQueueAction.ASSIGN.getValue(), ReceptionQueueAction.GRAB.getValue())
                .orderByDesc(ReceptionQueueLog::getId));
        return CollectionUtils.isEmpty(list) ? null : list.get(0);
    }

    private int assignedLogCount(String day, Long shopId, Long detailId, int kind) {
        return countLog(day, shopId, detailId, kind,
                ReceptionQueueAction.ASSIGN.getValue(), ReceptionQueueAction.GRAB.getValue());
    }

    private int countLog(String day, Long shopId, Long detailId, int kind, String... actions) {
        if (detailId == null) {
            return 0;
        }
        return queueLogMapper.selectCount(new LambdaQueryWrapper<ReceptionQueueLog>()
                .eq(ReceptionQueueLog::getQueueDate, parseDay(day))
                .eq(ReceptionQueueLog::getShopId, shopId)
                .eq(ReceptionQueueLog::getQueueKind, kind)
                .eq(ReceptionQueueLog::getDetailId, detailId)
                .in(ReceptionQueueLog::getAction, (Object[]) actions)).intValue();
    }

    private Map<Long, List<MassagistSchedules>> shiftMap(String day, Long shopId) {
        List<MassagistSchedules> list = massagistSchedulesService.simpleListByDateAndShopId(day, shopId);
        return list.stream().collect(Collectors.groupingBy(MassagistSchedules::getMassagistId));
    }

    private boolean inShift(Map<Long, List<MassagistSchedules>> shifts, Long massagistId, LocalDateTime startTime, LocalDateTime endTime) {
        List<MassagistSchedules> list = shifts.get(massagistId);
        if (CollectionUtils.isEmpty(list)) {
            return false;
        }
        LocalTime start = startTime == null ? null : startTime.toLocalTime();
        LocalTime end = endTime == null ? null : endTime.toLocalTime();
        for (MassagistSchedules schedules : list) {
            if (schedules.getStartTime() == null || schedules.getEndTime() == null) {
                continue;
            }
            if (start == null || end == null) {
                return true;
            }
            if (!schedules.getStartTime().isAfter(start) && !schedules.getEndTime().isBefore(end)) {
                return true;
            }
        }
        return false;
    }

    private Map<Long, Boolean> busyMap(Long shopId, LocalDateTime startTime, LocalDateTime endTime) {
        LocalDateTime end = endTime == null ? startTime.plusMinutes(1) : endTime;
        List<OrderDetail> list = orderDetailService.list(new LambdaQueryWrapper<OrderDetail>()
                .eq(OrderDetail::getShopId, shopId)
                .ne(OrderDetail::getState, AppointmentState.CANCELED.getValue())
                .lt(OrderDetail::getStartTime, end)
                .gt(OrderDetail::getEndTime, startTime));
        return list.stream()
                .filter(d -> d.getMassagistId() != null)
                .collect(Collectors.toMap(OrderDetail::getMassagistId, d -> true, (a, b) -> a));
    }

    public String massagistName(Long massagistId) {
        if (massagistId == null) {
            return null;
        }
        String name = massagistService.findNameById(massagistId);
        return StringUtils.hasText(name) ? name : String.valueOf(massagistId);
    }

    private long maxSeq(List<ReceptionQueue> list) {
        return list.stream().mapToLong(q -> nvl(q.getSeq())).max().orElse(0L);
    }

    private int maxReceiptNo(List<ReceptionQueue> list) {
        return list.stream().mapToInt(q -> nvl(q.getReceiptNo())).max().orElse(0);
    }

    private int nvl(Integer value) {
        return value == null ? 0 : value;
    }

    private long nvl(Long value) {
        return value == null ? 0L : value;
    }

    private LocalDate parseDay(String day) {
        return day == null ? LocalDate.now() : LocalDate.parse(day);
    }

    /** 两套队列各锁各的：接待单上钟不该挡住服务单上钟 */
    private String lockKey(String day, Long shopId, int kind) {
        return ("receptionQueue:" + day + ":" + shopId + ":" + kind).intern();
    }

    /** 老数据没有 queue_kind，按服务单算 */
    private int kindOf(Integer kind) {
        return kind == null ? KIND_SERVICE : kind;
    }
}
