package com.macro.mall.crm.brand;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.macro.mall.common.exception.BusinessException;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * 轻疗会员价（提前价）来源测试：CRM 卡版本 perks.lightcare.advancePercent 百分数 → 折扣率。
 */
class CrmCardDiscountSourceTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private static JsonNode catalog(String annualPercent, String monthPercent) throws Exception {
        return MAPPER.readTree("{\"products\":["
                + productJson("FY_ANNUAL", annualPercent) + ","
                + productJson("FY_MONTH", monthPercent)
                + "]}");
    }

    private static String productJson(String code, String percent) {
        return "{\"code\":\"" + code + "\",\"name\":\"卡\",\"priceCents\":29900,"
                + "\"perks\":{\"lightcare\":{\"advancePercent\":" + percent + "}}}";
    }

    @Test
    void mapsPercentToRatePerCardType() throws Exception {
        BrandMemberClient client = mock(BrandMemberClient.class);
        when(client.isActive()).thenReturn(true);
        when(client.products()).thenReturn(catalog("75.5", "94"));

        CrmCardDiscountSource source = new CrmCardDiscountSource(client);

        assertEquals(new BigDecimal("0.7550"), source.advanceRate("year").orElseThrow());
        assertEquals(new BigDecimal("0.9400"), source.advanceRate("month").orElseThrow());
        // 后台自定义发卡不受 CRM 约束
        assertFalse(source.advanceRate("custom").isPresent());
    }

    @Test
    void ignoresOutOfRangePercent() throws Exception {
        BrandMemberClient client = mock(BrandMemberClient.class);
        when(client.isActive()).thenReturn(true);
        when(client.products()).thenReturn(catalog("120", "10"));

        CrmCardDiscountSource source = new CrmCardDiscountSource(client);

        assertFalse(source.advanceRate("year").isPresent());
        assertFalse(source.advanceRate("month").isPresent());
    }

    @Test
    void crmDisabledKeepsLocalConfig() throws Exception {
        BrandMemberClient client = mock(BrandMemberClient.class);
        when(client.isActive()).thenReturn(false);

        CrmCardDiscountSource source = new CrmCardDiscountSource(client);

        assertFalse(source.isActive());
        assertFalse(source.advanceRate("year").isPresent());
    }

    @Test
    void keepsLastKnownRateWhenCrmFails() throws Exception {
        BrandMemberClient client = mock(BrandMemberClient.class);
        when(client.isActive()).thenReturn(true);
        when(client.products())
                .thenReturn(catalog("75.5", "94"))
                .thenThrow(new BusinessException("CRM 不可达"));

        CrmCardDiscountSource source = new CrmCardDiscountSource(client);
        assertTrue(source.advanceRate("year").isPresent());

        // 失败落在退避窗口内，仍返回上次成功值，而不是回落到本地配置
        assertEquals(new BigDecimal("0.7550"), source.advanceRate("year").orElseThrow());
    }
}