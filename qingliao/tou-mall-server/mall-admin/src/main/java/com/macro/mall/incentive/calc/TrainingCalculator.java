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
 *
 * <p>已计发（paidMonth 非空）的项目只保留累计进度用于展示，状态固定为 paid，
 * earnedAmount 恒为 0——这笔钱已在系统外结清，不进入任何月份的应发合计。</p>
 */
public class TrainingCalculator {

    public static final String STATUS_UNCERTIFIED = "uncertified";
    public static final String STATUS_UPCOMING = "upcoming";
    public static final String STATUS_ACTIVE = "active";
    public static final String STATUS_COMPLETED_THIS_MONTH = "completed-this-month";
    public static final String STATUS_COMPLETED = "completed";
    public static final String STATUS_PAID = "paid";

    /** 订单大类名称，与设置页 project_group 一致；用于防止跨大类串算。 */
    private static final String GROUP_SUJIN = "全感舒筋";
    private static final String GROUP_EAR = "全感悦耳";

    /**
     * 计算某位伙伴在指定月份的一个培训项目进度（未标记已计发）。
     */
    public TrainingProgress calculate(Long massagistId,
                                      TrainingProjectRule project,
                                      Long certId,
                                      LocalDate passedAt,
                                      List<TrainingOrder> orders,
                                      String month,
                                      LocalDate asOf) {
        return calculate(massagistId, project, certId, passedAt, null, null, orders, month, asOf);
    }

    /**
     * 计算某位伙伴在指定月份的一个培训项目进度。
     *
     * @param massagistId 伙伴 ID
     * @param project     培训项目规则
     * @param certId      考核记录 ID，可为空
     * @param passedAt    通过考核日期，可为空
     * @param paidMonth   系统外已计发月份 yyyy-MM，可为空；非空时不再计发
     * @param paidAmount  系统外已计发金额，可为空；为空按配置金额展示
     * @param orders      候选有效订单；可包含其他伙伴/其他项目，由本方法过滤
     * @param month       结算月份 yyyy-MM
     * @param asOf        数据截止日；历史月份会再收敛到月末
     */
    public TrainingProgress calculate(Long massagistId,
                                      TrainingProjectRule project,
                                      Long certId,
                                      LocalDate passedAt,
                                      String paidMonth,
                                      BigDecimal paidAmount,
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
        if (paidMonth != null && !paidMonth.trim().isEmpty()) {
            progress.setPaidMonth(paidMonth.trim());
            progress.setPaidAmount(paidAmount == null ? configuredAmount : IncentiveMath.money(paidAmount));
        }

        if (passedAt == null) {
            progress.setStatus(progress.getPaidMonth() == null ? STATUS_UNCERTIFIED : STATUS_PAID);
            return progress;
        }

        LocalDate cutoff = IncentiveMath.cutoff(month, asOf);
        LocalDate start = passedAt.plusDays(1);
        progress.setStartDate(start);
        if (start.isAfter(cutoff) && progress.getPaidMonth() == null) {
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

        if (progress.getPaidMonth() != null) {
            // 系统外已结清：进度照常展示，但任何月份都不再计发。
            progress.setStatus(STATUS_PAID);
            progress.setCompletionMonth(progress.getPaidMonth());
            progress.setCompletedThisMonth(false);
            progress.setEarnedAmount(BigDecimal.ZERO.setScale(IncentiveMath.MONEY_SCALE));
            return progress;
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
     * 订单与培训项目匹配。
     *
     * <p>顺序：项目 ID 一致 → 订单大类一致 → 时长一致 → 部位/别名命中（订单部位或项目标题）。
     * 大类收敛是必须的：头部水疗单的部位常写「头」，不收敛会被算进「全感舒筋 · 头部」；
     * 悦耳单的部位常带「头」「肩」，同理。</p>
     *
     * <p>唯一的大类例外：舒筋单里做了耳部（订单部位写了「耳」）同样累计耳部，
     * 历史订单把采耳记在「全感舒筋」项目下，业务确认这笔要算耳部。</p>
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
        if (!inSameGroup(project, order)) {
            return false;
        }
        // 配置里 0 表示不限时长（设置页未填时会存 0），不能当成「必须 0 分钟」。
        Integer projectDuration = project.getDurationMinutes();
        if (projectDuration != null && projectDuration > 0) {
            if (order.getDuration() == null || !projectDuration.equals(order.getDuration())) {
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

    /**
     * 订单大类是否属于该项目。
     *
     * <p>项目没配大类时不做收敛（兼容手工建的规则）；配了大类就要求订单标题含大类名称。
     * 例外：耳部项目额外接受「全感舒筋」订单中部位写了耳的那些。</p>
     */
    private boolean inSameGroup(TrainingProjectRule project, TrainingOrder order) {
        String group = project.getProjectGroup();
        if (group == null || group.trim().isEmpty()) {
            return true;
        }
        String title = order.getProjectTitle();
        if (title == null) {
            return false;
        }
        if (title.contains(group.trim())) {
            return true;
        }
        return GROUP_EAR.equals(group.trim())
                && title.contains(GROUP_SUJIN)
                && contains(order.getParts(), "耳");
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
