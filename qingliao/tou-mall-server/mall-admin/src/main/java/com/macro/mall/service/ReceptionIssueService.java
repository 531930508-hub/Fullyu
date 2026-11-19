package com.macro.mall.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.macro.mall.entity.ReceptionIssue;
import com.macro.mall.enums.ReceptionIssueStatus;
import com.macro.mall.enums.ReceptionIssueType;
import com.macro.mall.mapper.ReceptionIssueMapper;
import com.macro.mall.service.base.BaseService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.util.CollectionUtils;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

/**
 * 轮牌事项：值班意向 / 无值班可接待 / 超时未接待。
 *
 * <p>都是「有时效、要人处理」的事，处理完就关掉，过期就作废，不从历史里删。</p>
 *
 * @author reception
 * @date 2026/12/08
 */
@Service
@Slf4j
public class ReceptionIssueService extends BaseService<ReceptionIssueMapper, ReceptionIssue> {

    /**
     * 值班意向：技师点了值班但当下排不上（在服务/不在班），
     * 给一个限时抢单资格，过期自动失效。
     */
    public ReceptionIssue dutyIntent(String day, Long shopId, Long massagistId, int windowMinutes, String remark) {
        LocalDate date = parseDay(day);
        ReceptionIssue exist = pendingOne(date, shopId, massagistId, ReceptionIssueType.DUTY_INTENT.getValue());
        LocalDateTime deadline = LocalDateTime.now().plusMinutes(windowMinutes);
        if (exist != null) {
            exist.setDeadline(deadline);
            exist.setRemark(remark);
            updateById(exist);
            return exist;
        }
        ReceptionIssue issue = new ReceptionIssue();
        issue.setIssueDate(date);
        issue.setShopId(shopId);
        issue.setMassagistId(massagistId);
        issue.setType(ReceptionIssueType.DUTY_INTENT.getValue());
        issue.setStatus(ReceptionIssueStatus.PENDING.getValue());
        issue.setDeadline(deadline);
        issue.setRemark(remark);
        save(issue);
        log.info("轮牌事项-值班意向 shop={} massagist={} 截止={}", shopId, massagistId, deadline);
        return issue;
    }

    /**
     * 无值班可接待：前台把单排给了休息区的人，留痕，店长次日能看见是谁、什么时候。
     */
    public void noDutyAssigned(String day, Long shopId, Long detailId, String remark) {
        LocalDate date = parseDay(day);
        if (existsByDetail(date, shopId, detailId, ReceptionIssueType.NO_DUTY_ASSIGNED.getValue())) {
            return;
        }
        ReceptionIssue issue = newIssue(date, shopId, null, ReceptionIssueType.NO_DUTY_ASSIGNED.getValue(), detailId, remark);
        save(issue);
        log.warn("轮牌事项-无值班可接待 shop={} detail={} {}", shopId, detailId, remark);
    }

    /**
     * 超时未接待被抢单：留痕，用于统计「谁老是不点接待」。
     */
    public void grabbed(String day, Long shopId, Long detailId, Long originalMassagistId, String remark, String handlerName) {
        LocalDate date = parseDay(day);
        List<ReceptionIssue> pending = list(new LambdaQueryWrapper<ReceptionIssue>()
                .eq(ReceptionIssue::getIssueDate, date)
                .eq(ReceptionIssue::getShopId, shopId)
                .eq(ReceptionIssue::getDetailId, detailId)
                .eq(ReceptionIssue::getType, ReceptionIssueType.NOT_ACCEPTED_TIMEOUT.getValue())
                .eq(ReceptionIssue::getStatus, ReceptionIssueStatus.PENDING.getValue()));
        LocalDateTime now = LocalDateTime.now();
        if (!CollectionUtils.isEmpty(pending)) {
            // 扫描已经挂过这一单，抢到就把它关掉，不再另起一条
            for (ReceptionIssue issue : pending) {
                issue.setStatus(ReceptionIssueStatus.HANDLED.getValue());
                issue.setHandledTime(now);
                issue.setHandlerName(handlerName);
                updateById(issue);
            }
            log.warn("轮牌事项-超时未接待被抢单 shop={} detail={} 原疗愈师={} 抢单人={}",
                    shopId, detailId, originalMassagistId, handlerName);
            return;
        }
        if (existsByDetail(date, shopId, detailId, ReceptionIssueType.NOT_ACCEPTED_TIMEOUT.getValue())) {
            return;
        }
        ReceptionIssue issue = newIssue(date, shopId, originalMassagistId, ReceptionIssueType.NOT_ACCEPTED_TIMEOUT.getValue(), detailId, remark);
        issue.setStatus(ReceptionIssueStatus.HANDLED.getValue());
        issue.setHandledTime(now);
        issue.setHandlerName(handlerName);
        save(issue);
        log.warn("轮牌事项-超时未接待被抢单 shop={} detail={} 原疗愈师={}", shopId, detailId, originalMassagistId);
    }

    /**
     * 超时未接待：到点还没人点接待，挂一条待处理事项，别人可以直接抢。
     * 同一单只挂一次，返回是否新建。
     */
    public boolean timeout(String day, Long shopId, Long detailId, Long massagistId, LocalDateTime deadline, String remark) {
        LocalDate date = parseDay(day);
        if (existsByDetail(date, shopId, detailId, ReceptionIssueType.NOT_ACCEPTED_TIMEOUT.getValue())) {
            return false;
        }
        ReceptionIssue issue = newIssue(date, shopId, massagistId, ReceptionIssueType.NOT_ACCEPTED_TIMEOUT.getValue(), detailId, remark);
        issue.setDeadline(deadline);
        save(issue);
        log.warn("轮牌事项-超时未接待 shop={} detail={} 疗愈师={}", shopId, detailId, massagistId);
        return true;
    }

    /** 该技师当天是否有未过期的值班意向（抢单资格） */
    public boolean hasValidIntent(LocalDate day, Long shopId, Long massagistId) {
        List<ReceptionIssue> list = list(new LambdaQueryWrapper<ReceptionIssue>()
                .eq(ReceptionIssue::getIssueDate, day)
                .eq(ReceptionIssue::getShopId, shopId)
                .eq(ReceptionIssue::getMassagistId, massagistId)
                .eq(ReceptionIssue::getType, ReceptionIssueType.DUTY_INTENT.getValue())
                .eq(ReceptionIssue::getStatus, ReceptionIssueStatus.PENDING.getValue()));
        LocalDateTime now = LocalDateTime.now();
        return list.stream().anyMatch(i -> i.getDeadline() == null || i.getDeadline().isAfter(now));
    }

    /** 该技师的意向被兑现（抢到单/自己接待了），关掉 */
    public void closeIntent(LocalDate day, Long shopId, Long massagistId, String handlerName) {
        List<ReceptionIssue> list = list(new LambdaQueryWrapper<ReceptionIssue>()
                .eq(ReceptionIssue::getIssueDate, day)
                .eq(ReceptionIssue::getShopId, shopId)
                .eq(ReceptionIssue::getMassagistId, massagistId)
                .eq(ReceptionIssue::getType, ReceptionIssueType.DUTY_INTENT.getValue())
                .eq(ReceptionIssue::getStatus, ReceptionIssueStatus.PENDING.getValue()));
        LocalDateTime now = LocalDateTime.now();
        for (ReceptionIssue issue : list) {
            issue.setStatus(ReceptionIssueStatus.HANDLED.getValue());
            issue.setHandledTime(now);
            issue.setHandlerName(handlerName);
            updateById(issue);
        }
    }

    /** 顺带把过期的意向标记掉，避免看板上一直挂着 */
    public void expire(LocalDate day, Long shopId) {
        List<ReceptionIssue> list = list(new LambdaQueryWrapper<ReceptionIssue>()
                .eq(ReceptionIssue::getIssueDate, day)
                .eq(ReceptionIssue::getShopId, shopId)
                .eq(ReceptionIssue::getStatus, ReceptionIssueStatus.PENDING.getValue()));
        LocalDateTime now = LocalDateTime.now();
        for (ReceptionIssue issue : list) {
            if (issue.getDeadline() != null && issue.getDeadline().isBefore(now)) {
                issue.setStatus(ReceptionIssueStatus.EXPIRED.getValue());
                updateById(issue);
            }
        }
    }

    public List<ReceptionIssue> listByDay(String day, Long shopId) {
        return list(new LambdaQueryWrapper<ReceptionIssue>()
                .eq(ReceptionIssue::getIssueDate, parseDay(day))
                .eq(ReceptionIssue::getShopId, shopId)
                .orderByDesc(ReceptionIssue::getId));
    }

    private ReceptionIssue pendingOne(LocalDate day, Long shopId, Long massagistId, Integer type) {
        if (massagistId == null) {
            return null;
        }
        List<ReceptionIssue> list = list(new LambdaQueryWrapper<ReceptionIssue>()
                .eq(ReceptionIssue::getIssueDate, day)
                .eq(ReceptionIssue::getShopId, shopId)
                .eq(ReceptionIssue::getMassagistId, massagistId)
                .eq(ReceptionIssue::getType, type)
                .eq(ReceptionIssue::getStatus, ReceptionIssueStatus.PENDING.getValue())
                .orderByDesc(ReceptionIssue::getId));
        return CollectionUtils.isEmpty(list) ? null : list.get(0);
    }

    private boolean existsByDetail(LocalDate day, Long shopId, Long detailId, Integer type) {
        if (detailId == null) {
            return false;
        }
        return count(new LambdaQueryWrapper<ReceptionIssue>()
                .eq(ReceptionIssue::getIssueDate, day)
                .eq(ReceptionIssue::getShopId, shopId)
                .eq(ReceptionIssue::getDetailId, detailId)
                .eq(ReceptionIssue::getType, type)) > 0;
    }

    private ReceptionIssue newIssue(LocalDate day, Long shopId, Long massagistId, Integer type, Long detailId, String remark) {
        ReceptionIssue issue = new ReceptionIssue();
        issue.setIssueDate(day);
        issue.setShopId(shopId);
        issue.setMassagistId(massagistId);
        issue.setType(type);
        issue.setStatus(ReceptionIssueStatus.PENDING.getValue());
        issue.setDetailId(detailId);
        issue.setRemark(remark);
        return issue;
    }

    private LocalDate parseDay(String day) {
        return day == null ? LocalDate.now() : LocalDate.parse(day);
    }
}
