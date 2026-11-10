package com.macro.mall.incentive.calc;

import com.macro.mall.incentive.model.TrainingOrder;
import com.macro.mall.incentive.model.TrainingProgress;
import com.macro.mall.incentive.model.TrainingProjectRule;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 培训项目补贴计算。
 *
 * <p>规则：通过考核次日起累计对应项目的有效到店订单；第 N 单完成所在月计入一次，
 * 之后月份不再重复计入。历史月份按该月月末截止，当前月份按数据截止日计算。</p>
 */
public class TrainingCalculator {

    public static final String STATUS_UNCERTIFIED = "uncertified";
    public static final String STATUS_UPCOMING = "upcoming";
    public static final String STATUS_ACTIVE = "active";
    public static final String STATUS_COMPLETED_THIS_MONTH = "completed-this-month";
    public static final String STATUS_COMPLETED = "completed";

    /**
     * 计算某位伙伴在指定月份的一个培训项目进度。
     *
     * @param massagistId 伙伴 ID
     * @param project     培训项目规则
     * @param certId      考核记录 ID，可为空
     * @param passedAt    通过考核日期，可为空
     * @param orders      候选有效订单；可包含其他伙伴/其他项目，由本方法过滤
     * @param month       结算月份 yyyy-MM
     * @param asOf        数据截止日；历史月份会再收敛到月末
     */
    public TrainingProgress calculate(Long massagistId,
                                      TrainingProjectRule project,
                                      Long certId,
                                      LocalDate passedAt,
                                      List<TrainingOrder> orders,
                                      String month,
                                      LocalDate asOf) {
        if (project == null) {
            throw new IllegalArgumentException("培训项目不能为空");
        }
        IncentiveMath.requireMonth(month);
        int target = project.getTargetCount() == null || project.getTargetCount() < 1
                ? 1 : project.getTargetCount();
        BigDecimal configuredAmount = IncentiveMath.money(
                project.getAmount() == null ? BigDecimal.ZERO : project.getAmount());

        TrainingProgress progress = new TrainingProgress();
        progress.setCertId(certId);
        progress.setProjectKey(project.getProjectKey());
        progress.setProjectGroup(project.getProjectGroup());
        progress.setProjectName(project.getProjectName());
        progress.setProjectId(project.getProjectId());
        progress.setPartName(project.getPartName());
        progress.setDurationMinutes(project.getDurationMinutes());
        progress.setPassedAt(passedAt);
        progress.setTarget(target);
        progress.setConfiguredAmount(configuredAmount);
        progress.setCompletedThisMonth(false);
        progress.setEarnedAmount(BigDecimal.ZERO.setScale(IncentiveMath.MONEY_SCALE));
        progress.setCount(0);
        progress.setRawCount(0);
        progress.setRemaining(target);
        progress.setProgressPercent(BigDecimal.ZERO.setScale(IncentiveMath.MONEY_SCALE));

        if (passedAt == null) {
            progress.setStatus(STATUS_UNCERTIFIED);
            return progress;
        }

        LocalDate cutoff = IncentiveMath.cutoff(month, asOf);
        LocalDate start = passedAt.plusDays(1);
        progress.setStartDate(start);
        if (start.isAfter(cutoff)) {
            progress.setStatus(STATUS_UPCOMING);
            return progress;
        }

        List<TrainingOrder> through = validOrders(massagistId, project, orders, start, cutoff);
        int rawCount = through.size();
        boolean reached = rawCount >= target;
        LocalDate completionDate = reached ? through.get(target - 1).getServiceDate() : null;
        String completionMonth = completionDate == null
                ? null : YearMonth.from(completionDate).toString();
        boolean completedThisMonth = month.equals(completionMonth);

        progress.setRawCount(rawCount);
        progress.setCount(Math.min(rawCount, target));
        progress.setRemaining(Math.max(0, target - rawCount));
        progress.setCompletionDate(completionDate);
        progress.setCompletionMonth(completionMonth);
        progress.setCompletedThisMonth(completedThisMonth);
        progress.setProgressPercent(IncentiveMath.percent(
                BigDecimal.valueOf(Math.min(rawCount, target)), BigDecimal.valueOf(target)));
        if (completedThisMonth) {
            progress.setEarnedAmount(configuredAmount);
        }

        if (reached) {
            progress.setStatus(completedThisMonth ? STATUS_COMPLETED_THIS_MONTH : STATUS_COMPLETED);
        } else {
            progress.setStatus(STATUS_ACTIVE);
        }
        return progress;
    }

    /**
     * 过滤出某伙伴在 [start, cutoff] 内、属于该项目且已去重的有效订单。
     * 同一订单多明细重复出现时只计一次；同日多单分别计数。
     */
    public List<TrainingOrder> validOrders(Long massagistId,
                                           TrainingProjectRule project,
                                           List<TrainingOrder> orders,
                                           LocalDate start,
                                           LocalDate cutoff) {
        List<TrainingOrder> result = new ArrayList<>();
        if (orders == null || orders.isEmpty() || start == null || cutoff == null) {
            return result;
        }
        Map<String, TrainingOrder> unique = new LinkedHashMap<>();
        for (TrainingOrder order : orders) {
            if (order == null || order.getServiceDate() == null) {
                continue;
            }
            if (massagistId != null && !massagistId.equals(order.getMassagistId())) {
                continue;
            }
            if (order.getServiceDate().isBefore(start) || order.getServiceDate().isAfter(cutoff)) {
                continue;
            }
            if (!matches(project, order)) {
                continue;
            }
            String key = order.getOrderId() == null
                    ? "row-" + System.identityHashCode(order)
                    : "order-" + order.getOrderId();
            if (!unique.containsKey(key)) {
                unique.put(key, order);
            }
        }
        result.addAll(unique.values());
        result.sort(Comparator
                .comparing(TrainingOrder::getServiceDate)
                .thenComparing(o -> o.getOrderId() == null ? Long.MAX_VALUE : o.getOrderId()));
        return result;
    }

    /**
     * 订单与培训项目匹配。项目 ID 必须一致；头部水疗再校验时长；
     * 全感舒筋按订单部位或项目标题命中部位/别名。
     *
     * <p>生产订单的部位字段在订单级，多人多部位订单存在归属歧义，
     * 接入层必须记录并推动明细级部位字段，不能把本方法当作最终归属依据。</p>
     */
    public boolean matches(TrainingProjectRule project, TrainingOrder order) {
        if (project == null || order == null) {
            return false;
        }
        if (project.getProjectId() != null) {
            if (order.getProjectId() == null || !project.getProjectId().equals(order.getProjectId())) {
                return false;
            }
        }
        if (project.getDurationMinutes() != null) {
            if (order.getDuration() == null
                    || !project.getDurationMinutes().equals(order.getDuration())) {
                return false;
            }
        }
        if (project.getPartName() != null && !project.getPartName().trim().isEmpty()) {
            List<String> tokens = new ArrayList<>();
            tokens.add(project.getPartName().trim());
            tokens.addAll(project.aliasList());
            boolean hit = false;
            for (String token : tokens) {
                if (contains(order.getParts(), token) || contains(order.getProjectTitle(), token)) {
                    hit = true;
                    break;
                }
            }
            if (!hit) {
                return false;
            }
        }
        return true;
    }

    private boolean contains(String text, String token) {
        if (text == null || token == null || token.trim().isEmpty()) {
            return false;
        }
        String normalizedText = text.toLowerCase();
        String normalizedToken = token.trim().toLowerCase();
        return normalizedText.contains(normalizedToken);
    }
}
