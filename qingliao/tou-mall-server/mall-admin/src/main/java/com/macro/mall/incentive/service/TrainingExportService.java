package com.macro.mall.incentive.service;

import com.macro.mall.entity.Massagist;
import com.macro.mall.entity.Shop;
import com.macro.mall.incentive.dto.TrainingAssessmentRow;
import com.macro.mall.incentive.entity.MassagistTrainingCert;
import org.springframework.stereotype.Service;

import java.util.Collections;
import java.util.List;
import java.util.Map;

/**
 * 培训相关 CSV 导出。统一带 UTF-8 BOM，避免 Excel 打开中文乱码。
 */
@Service
public class TrainingExportService {

    public static final int MAX_ROWS = 50000;

    public String assessmentCsv(List<TrainingAssessmentRow> rows) {
        StringBuilder csv = new StringBuilder("\ufeff");
        csv.append("考核日期,门店,疗愈师,项目,结果,内训师,内训师门店,提交时间,备注,状态\n");
        if (rows != null) {
            for (TrainingAssessmentRow row : rows) {
                csv.append(csv(row.getAssessDate())).append(',')
                        .append(csv(row.getShopName())).append(',')
                        .append(csv(row.getMassagistName())).append(',')
                        .append(csv(row.getProjectName())).append(',')
                        .append(csv(Integer.valueOf(1).equals(row.getResult()) ? "通过" : "不通过")).append(',')
                        .append(csv(row.getTrainerName())).append(',')
                        .append(csv(row.getTrainerShopName())).append(',')
                        .append(csv(time(row.getSubmittedAt()))).append(',')
                        .append(csv(row.getRemark())).append(',')
                        .append(csv(Integer.valueOf(1).equals(row.getVoided()) ? "已作废" : "有效"))
                        .append('\n');
            }
        }
        return csv.toString();
    }

    public String certificationCsv(List<MassagistTrainingCert> certs,
                                   Map<Long, Massagist> massagists,
                                   Map<Long, Shop> shops,
                                   Map<String, String> projectNames) {
        Map<Long, Massagist> safeMassagists = massagists == null ? Collections.emptyMap() : massagists;
        Map<Long, Shop> safeShops = shops == null ? Collections.emptyMap() : shops;
        Map<String, String> safeProjects = projectNames == null ? Collections.emptyMap() : projectNames;
        StringBuilder csv = new StringBuilder("\ufeff");
        csv.append("门店,疗愈师,项目编码,项目,认证来源,通过日期,认证时间,团队人数\n");
        if (certs != null) {
            for (MassagistTrainingCert cert : certs) {
                Massagist massagist = safeMassagists.get(cert.getMassagistId());
                Shop shop = massagist == null || massagist.getShopId() == null
                        ? null : safeShops.get(massagist.getShopId());
                String projectName = safeProjects.get(cert.getProjectKey());
                csv.append(csv(shop == null ? null : shop.getName())).append(',')
                        .append(csv(massagist == null ? null : massagist.getName())).append(',')
                        .append(csv(cert.getProjectKey())).append(',')
                        .append(csv(projectName == null ? cert.getProjectKey() : projectName)).append(',')
                        .append(csv(sourceLabel(cert.getSource()))).append(',')
                        .append(csv(cert.getPassedAt())).append(',')
                        .append(csv(time(cert.getCertifiedAt()))).append(',')
                        .append(cert.getTeamSize() == null ? 0 : cert.getTeamSize()).append('\n');
            }
        }
        return csv.toString();
    }

    /** 认证来源与后台页面口径一致，便于直接筛选“人工特批”。 */
    private String sourceLabel(String source) {
        if ("TEAM".equals(source)) {
            return "三人认证";
        }
        if ("MANUAL".equals(source)) {
            return "人工特批";
        }
        return "历史登记";
    }

    private String time(Object value) {
        return value == null ? null : String.valueOf(value).replace('T', ' ');
    }

    private String csv(Object value) {
        if (value == null) {
            return "";
        }
        String safe = String.valueOf(value).replace("\"", "\"\"");
        // 防止 CSV 公式注入：以公式符号开头的单元格前加单引号。
        if (safe.startsWith("=") || safe.startsWith("+")
                || safe.startsWith("-") || safe.startsWith("@")) {
            safe = "'" + safe;
        }
        return "\"" + safe + "\"";
    }
}
