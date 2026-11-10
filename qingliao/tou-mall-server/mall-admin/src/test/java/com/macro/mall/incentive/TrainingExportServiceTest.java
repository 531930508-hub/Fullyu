package com.macro.mall.incentive;

import com.macro.mall.entity.Massagist;
import com.macro.mall.entity.Shop;
import com.macro.mall.incentive.dto.TrainingAssessmentRow;
import com.macro.mall.incentive.entity.MassagistTrainingCert;
import com.macro.mall.incentive.service.TrainingExportService;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class TrainingExportServiceTest {

    private final TrainingExportService service = new TrainingExportService();

    private TrainingAssessmentRow row(String remark) {
        TrainingAssessmentRow row = new TrainingAssessmentRow();
        row.setAssessDate(LocalDate.of(2026, 1, 2));
        row.setShopName("门店,A");
        row.setMassagistName("张三");
        row.setProjectName("头部水疗60分钟");
        row.setResult(1);
        row.setTrainerName("李四");
        row.setTrainerShopName("门店B");
        row.setSubmittedAt(LocalDateTime.of(2026, 1, 2, 10, 0));
        row.setRemark(remark);
        row.setVoided(0);
        return row;
    }

    @Test
    void csvStartsWithBomAndHasChineseHeader() {
        String csv = service.assessmentCsv(Collections.singletonList(row("正常")));
        assertTrue(csv.startsWith("\ufeff"));
        assertTrue(csv.contains("考核日期,门店,疗愈师,项目,结果,内训师"));
    }

    @Test
    void csvEscapesCommasQuotesAndFormulaPrefix() {
        String csv = service.assessmentCsv(Collections.singletonList(row("=1+2,\"备注\"")));
        assertTrue(csv.contains("\"门店,A\""), "逗号必须被引号包裹");
        assertTrue(csv.contains("'=1+2,\"\"备注\"\""), "公式前缀与引号必须转义");
    }

    @Test
    void certificationCsvUsesProjectNameAndSource() {
        Massagist massagist = new Massagist();
        massagist.setId(7L);
        massagist.setName("张三");
        massagist.setShopId(5L);
        Map<Long, Massagist> people = new HashMap<>();
        people.put(7L, massagist);
        Shop shop = new Shop();
        shop.setId(5L);
        shop.setName("合成门店");
        Map<Long, Shop> shops = new HashMap<>();
        shops.put(5L, shop);
        Map<String, String> projects = new HashMap<>();
        projects.put("head60", "头部水疗60分钟");

        MassagistTrainingCert cert = new MassagistTrainingCert();
        cert.setMassagistId(7L);
        cert.setShopId(5L);
        cert.setProjectKey("head60");
        cert.setSource("TEAM");
        cert.setPassedAt(LocalDate.of(2026, 1, 5));
        cert.setCertifiedAt(LocalDateTime.of(2026, 1, 6, 9, 0));
        cert.setTeamSize(3);
        List<MassagistTrainingCert> certs = Arrays.asList(cert);

        String csv = service.certificationCsv(certs, people, shops, projects);
        assertTrue(csv.contains("头部水疗60分钟"));
        assertTrue(csv.contains("\"三人认证\""));
        assertTrue(csv.contains("2026-01-06 09:00"));
        assertTrue(csv.contains(",3"));
        assertTrue(csv.startsWith("\ufeff"));
    }

    @Test
    void emptyRowsStillReturnsHeader() {
        String csv = service.assessmentCsv(null);
        assertEquals(1, csv.split("\n").length);
    }
}
