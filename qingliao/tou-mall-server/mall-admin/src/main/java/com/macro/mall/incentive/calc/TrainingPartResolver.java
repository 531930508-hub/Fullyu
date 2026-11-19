package com.macro.mall.incentive.calc;

import com.macro.mall.incentive.model.TrainingOrder;
import com.macro.mall.incentive.model.TrainingProjectRule;

import java.util.Arrays;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 把订单部位按「培训项目」的口径归到疗愈师统计的部位列，保证两处数字一致。
 *
 * <p>培训项目是按产品大类的（全感舒筋 6 个部位、全感悦耳），疗愈师统计的部位列是身体部位，
 * 两者共用同一套匹配规则：订单必须在项目所属大类内（{@link TrainingCalculator#matches}），
 * 因此头部水疗单的「头」不会再进「头」列，悦耳单的「头」「肩」也不会进舒筋部位列。
 * 统计页的「其他」只放七个标准部位之外的内容（如「背」）。</p>
 */
public final class TrainingPartResolver {

    private static final TrainingCalculator CALCULATOR = new TrainingCalculator();

    /** 培训项目 key → 疗愈师统计的部位列。头部水疗项目不对应部位列。 */
    private static final Map<String, String> COLUMN_BY_PROJECT_KEY;

    /** 七个标准部位，其余内容归「其他」。 */
    private static final Set<String> KNOWN_PARTS =
            new LinkedHashSet<>(Arrays.asList("头", "肩", "腿", "脸", "眼", "手", "耳"));

    static {
        Map<String, String> map = new LinkedHashMap<>();
        map.put("sujin_head", "头");
        map.put("sujin_shoulder", "肩");
        map.put("sujin_leg", "腿");
        map.put("sujin_face", "脸");
        map.put("sujin_eye", "眼");
        map.put("sujin_hand", "手");
        map.put("ear", "耳");
        COLUMN_BY_PROJECT_KEY = Collections.unmodifiableMap(map);
    }

    private TrainingPartResolver() {}

    /**
     * @param projects    当前生效的培训项目规则（含大类、部位、别名、时长）
     * @param projectId   订单明细对应的线上项目 ID，可为空
     * @param projectTitle 订单项目标题（与培训一致，优先取 s_project.title）
     * @param parts       订单部位 JSON 数组字符串
     * @param duration    订单时长（分钟），可为空
     * @param rawParts    已解析的部位集合，用于归类「其他」
     * @return 该订单应计入的部位列，可能为空
     */
    public static Set<String> resolve(List<TrainingProjectRule> projects, Long projectId, String projectTitle,
                                      String parts, Integer duration, Set<String> rawParts) {
        Set<String> columns = new LinkedHashSet<>();
        if (projects != null && !projects.isEmpty()) {
            TrainingOrder order = new TrainingOrder();
            order.setProjectId(projectId);
            order.setProjectTitle(projectTitle);
            order.setParts(parts);
            order.setDuration(duration);
            for (TrainingProjectRule project : projects) {
                if (project == null) continue;
                String column = COLUMN_BY_PROJECT_KEY.get(project.getProjectKey());
                if (column == null) continue;
                if (CALCULATOR.matches(project, order)) columns.add(column);
            }
        }
        if (rawParts != null) {
            for (String part : rawParts) {
                if (!KNOWN_PARTS.contains(part)) {
                    columns.add("其他");
                    break;
                }
            }
        }
        return columns;
    }
}
