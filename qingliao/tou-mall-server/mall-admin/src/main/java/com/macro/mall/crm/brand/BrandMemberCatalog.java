package com.macro.mall.crm.brand;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 品牌会员卡商品目录：把 CRM 定价与提前价折扣合成一份页面可直接展示的口径。
 *
 * <p>价格、卡期、权益说明来自 CRM {@code /products}；展示名统一为
 * {@link BrandMemberNaming#DISPLAY_NAME}（CRM 里的年卡 / 月卡名不再露出）。折扣率复用
 * {@link CrmCardDiscountSource}，与结算时实际扣款的费率同源，避免「页面写 7.55 折、
 * 结算是另一个数」。CRM 不可达时直接抛错，由页面提示重试——宁可暂时不展示，
 * 也不能用本地常量顶替报价。</p>
 */
@Component
public class BrandMemberCatalog {
    private static final String CODE_ANNUAL = "FY_ANNUAL";
    private static final String CODE_MONTH = "FY_MONTH";

    private final BrandMemberClient client;
    private final CrmCardDiscountSource discountSource;
    private final ObjectMapper mapper = new ObjectMapper();

    public BrandMemberCatalog(BrandMemberClient client, CrmCardDiscountSource discountSource) {
        this.client = client;
        this.discountSource = discountSource;
    }

    /** 目录 + 默认选中卡型；products 保留 CRM 原有字段（benefits / perks / gameEnabled 等）。 */
    public Map<String, Object> view() {
        JsonNode raw = client.products();
        List<Map<String, Object>> products = new ArrayList<>();
        for (JsonNode product : raw.path("products")) {
            if (product.isObject()) {
                products.add(enrich(product));
            }
        }
        Map<String, Object> view = new LinkedHashMap<>();
        view.put("products", products);
        view.put("defaultProductCode", defaultProductCode(products));
        return view;
    }

    /**
     * 年卡目录行（含 CRM 定价与提前价折扣）；目录里没有年卡时返回 null。
     *
     * <p>结算页「顺手续年卡」与会员页都用它取现价，避免用本地配置价顶替 CRM 报价。
     * CRM 不可达时直接抛错，由调用方决定是否回落到本地配置。</p>
     */
    public Map<String, Object> annualProduct() {
        JsonNode raw = client.products();
        for (JsonNode product : raw.path("products")) {
            if (product.isObject() && CODE_ANNUAL.equals(product.path("code").asText(""))) {
                return enrich(product);
            }
        }
        return null;
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> enrich(JsonNode product) {
        Map<String, Object> row = mapper.convertValue(product, Map.class);
        // CRM 卡名仍是「年卡 / 月卡」，对外统一叫 Full愈大会员，卡期与价格负责区分。
        row.put("name", BrandMemberNaming.DISPLAY_NAME);
        BigDecimal rate = advanceRate(product.path("code").asText(""));
        row.put("advanceRate", rate == null ? null : rate.doubleValue());
        row.put("advanceDiscountText", DiscountText.of(rate));
        return row;
    }

    private BigDecimal advanceRate(String productCode) {
        if (CODE_ANNUAL.equals(productCode)) {
            return discountSource.advanceRate("year").orElse(null);
        }
        if (CODE_MONTH.equals(productCode)) {
            return discountSource.advanceRate("month").orElse(null);
        }
        return null;
    }

    /** 默认选中卡型：目录含年卡就用年卡，否则用第一个；页面不再写死 FY_ANNUAL。 */
    private String defaultProductCode(List<Map<String, Object>> products) {
        for (Map<String, Object> row : products) {
            if (CODE_ANNUAL.equals(row.get("code"))) {
                return CODE_ANNUAL;
            }
        }
        return products.isEmpty() ? "" : String.valueOf(products.get(0).get("code"));
    }
}