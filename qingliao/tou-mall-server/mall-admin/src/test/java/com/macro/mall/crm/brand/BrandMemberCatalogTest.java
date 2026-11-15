package com.macro.mall.crm.brand;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * 品牌会员目录：价格/卡期/权益照抄 CRM，折扣复用结算费率；CRM 缺数据时不补默认值。
 */
class BrandMemberCatalogTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private static JsonNode payload(String monthPercent) throws Exception {
        return MAPPER.readTree("{\"products\":["
                + "{\"code\":\"FY_MONTH\",\"name\":\"Full愈月卡\",\"priceCents\":9900,\"validDays\":90,"
                + "\"benefits\":[{\"business\":\"retreat\",\"title\":\"轻疗\"}],"
                + "\"perks\":{\"lightcare\":{\"advancePercent\":" + monthPercent + "}}},"
                + "{\"code\":\"FY_ANNUAL\",\"name\":\"Full愈年卡\",\"priceCents\":36500,\"validDays\":365}"
                + "]}");
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> row(Map<String, Object> view, String code) {
        List<Map<String, Object>> products = (List<Map<String, Object>>) view.get("products");
        return products.stream().filter(item -> code.equals(item.get("code"))).findFirst().orElseThrow();
    }

    @Test
    void keepsCrmValuesAndAddsSettlementDiscount() throws Exception {
        BrandMemberClient client = mock(BrandMemberClient.class);
        when(client.products()).thenReturn(payload("75"));
        CrmCardDiscountSource discount = mock(CrmCardDiscountSource.class);
        when(discount.advanceRate("year")).thenReturn(Optional.of(new BigDecimal("0.7550")));
        when(discount.advanceRate("month")).thenReturn(Optional.of(new BigDecimal("0.9400")));

        Map<String, Object> view = new BrandMemberCatalog(client, discount).view();

        Map<String, Object> annual = row(view, "FY_ANNUAL");
        assertEquals(36500, annual.get("priceCents"));
        assertEquals(365, annual.get("validDays"));
        // CRM 仍下发「Full愈年卡 / 月卡」，对外统一展示 Full愈大会员，靠卡期与价格区分
        assertEquals(BrandMemberNaming.DISPLAY_NAME, annual.get("name"));
        assertEquals(0.755, annual.get("advanceRate"));
        assertEquals("7.55 折", annual.get("advanceDiscountText"));

        Map<String, Object> month = row(view, "FY_MONTH");
        assertEquals(BrandMemberNaming.DISPLAY_NAME, month.get("name"));
        assertEquals("9.4 折", month.get("advanceDiscountText"));
        // CRM 原有权益说明原样透出，页面不再自己拼一份
        assertEquals(true, month.containsKey("benefits"));
        assertEquals(90, month.get("validDays"));

        assertEquals("FY_ANNUAL", view.get("defaultProductCode"));
    }

    @Test
    void missingDiscountIsLeftBlankInsteadOfFallingBack() throws Exception {
        BrandMemberClient client = mock(BrandMemberClient.class);
        when(client.products()).thenReturn(payload("75"));
        CrmCardDiscountSource discount = mock(CrmCardDiscountSource.class);
        when(discount.advanceRate("year")).thenReturn(Optional.empty());
        when(discount.advanceRate("month")).thenReturn(Optional.empty());

        Map<String, Object> view = new BrandMemberCatalog(client, discount).view();

        assertNull(row(view, "FY_ANNUAL").get("advanceRate"));
        assertEquals("", row(view, "FY_ANNUAL").get("advanceDiscountText"));
    }

    @Test
    void defaultProductIsFirstWhenAnnualMissing() throws Exception {
        BrandMemberClient client = mock(BrandMemberClient.class);
        when(client.products()).thenReturn(MAPPER.readTree(
                "{\"products\":[{\"code\":\"FY_TRIAL\",\"name\":\"体验卡\",\"priceCents\":1000,\"validDays\":7}]}"));
        CrmCardDiscountSource discount = mock(CrmCardDiscountSource.class);

        Map<String, Object> view = new BrandMemberCatalog(client, discount).view();

        assertEquals("FY_TRIAL", view.get("defaultProductCode"));
    }

    @Test
    void crmFailurePropagatesSoPageCanRetry() {
        BrandMemberClient client = mock(BrandMemberClient.class);
        when(client.products()).thenThrow(new IllegalStateException("CRM 不可达"));
        CrmCardDiscountSource discount = mock(CrmCardDiscountSource.class);

        assertThrows(IllegalStateException.class, () -> new BrandMemberCatalog(client, discount).view());
    }
}