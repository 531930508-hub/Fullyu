package com.macro.mall.crm.brand;

import com.fasterxml.jackson.databind.JsonNode;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.Collections;
import java.util.HashMap;
import java.util.Map;
import java.util.Optional;

/**
 * 轻疗会员价（提前价）的唯一配置来源：CRM 卡版本的 {@code perks.lightcare.advancePercent}。
 *
 * <p>只在 CRM 接入开启时生效；CRM 不可达时沿用最近一次成功下发值，
 * 从未拿到过则回落到本地配置表，避免 CRM 抖动时会员价整体失效。</p>
 *
 * <p>CRM 中按月卡 / 年卡两个产品分别配置：月卡对应 FY_MONTH、年卡对应 FY_ANNUAL；
 * 后台自定义发卡（custom）不受 CRM 约束。</p>
 */
@Component
@Slf4j
public class CrmCardDiscountSource {
    /** 缓存时长：CRM 改价后最迟 1 分钟生效。 */
    private static final long TTL_MS = 60_000L;
    /** 失败退避：CRM 异常时不至于每次请求都重试。 */
    private static final long FAIL_BACKOFF_MS = 10_000L;
    private static final String CODE_YEAR = "FY_ANNUAL";
    private static final String CODE_MONTH = "FY_MONTH";
    private static final BigDecimal MIN_RATE = new BigDecimal("0.5");
    private static final BigDecimal MAX_RATE = new BigDecimal("0.999");

    private final BrandMemberClient client;

    private volatile Map<String, BigDecimal> rates = Collections.emptyMap();
    private volatile long expiresAt = 0L;
    private volatile boolean loadedOnce = false;

    public CrmCardDiscountSource(BrandMemberClient client) {
        this.client = client;
    }

    public boolean isActive() {
        return client.isActive();
    }

    /** 按卡类型取 CRM 下发的提前价折扣率（75.5% 下发为百分数，这里换算成 0.7550）。 */
    public Optional<BigDecimal> advanceRate(String cardType) {
        String code = productCode(cardType);
        if (code == null || !client.isActive()) {
            return Optional.empty();
        }
        return Optional.ofNullable(currentRates().get(code));
    }

    private static String productCode(String cardType) {
        if (cardType == null) {
            return CODE_YEAR;
        }
        String type = cardType.trim().toLowerCase();
        if ("month".equals(type)) {
            return CODE_MONTH;
        }
        if ("year".equals(type)) {
            return CODE_YEAR;
        }
        return null;
    }

    private Map<String, BigDecimal> currentRates() {
        if (System.currentTimeMillis() < expiresAt) {
            return rates;
        }
        synchronized (this) {
            if (System.currentTimeMillis() < expiresAt) {
                return rates;
            }
            try {
                rates = fetch();
                loadedOnce = true;
                expiresAt = System.currentTimeMillis() + TTL_MS;
            } catch (RuntimeException e) {
                expiresAt = System.currentTimeMillis() + FAIL_BACKOFF_MS;
                if (loadedOnce) {
                    log.warn("CRM 卡版本折扣读取失败，沿用最近一次下发值：{}", e.getMessage());
                } else {
                    log.warn("CRM 卡版本折扣读取失败，暂用本地配置：{}", e.getMessage());
                }
            }
            return rates;
        }
    }

    private Map<String, BigDecimal> fetch() {
        Map<String, BigDecimal> result = new HashMap<>();
        for (JsonNode product : client.products().path("products")) {
            String code = product.path("code").asText("");
            if (!CODE_YEAR.equals(code) && !CODE_MONTH.equals(code)) {
                continue;
            }
            JsonNode percent = product.path("perks").path("lightcare").path("advancePercent");
            if (!percent.isNumber()) {
                continue;
            }
            BigDecimal rate = percent.decimalValue().divide(new BigDecimal("100"), 4, RoundingMode.HALF_UP);
            if (rate.compareTo(MIN_RATE) < 0 || rate.compareTo(MAX_RATE) > 0) {
                log.warn("CRM 轻疗提前价超出允许区间，已忽略：{} {}%", code, percent.asText());
                continue;
            }
            result.put(code, rate);
        }
        return result;
    }
}