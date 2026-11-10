package com.macro.mall.incentive.calc;

import com.macro.mall.incentive.model.CustomerVisit;
import com.macro.mall.incentive.model.IncentiveRule;
import com.macro.mall.incentive.model.RepurchaseMetrics;
import com.macro.mall.incentive.model.RepurchaseTier;
import com.macro.mall.incentive.model.TenDayRecord;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 复购激励计算：老客 60 天留存、新客 30 天档位、新客 10 天斐波那契。
 *
 * <p>口径以首单月归属：
 * 老客窗口为 M-6 至 M-2，30 天新客窗口为 M-3 至 M-1，
 * 10 天记录取 M 月首单，第二次到店即使发生在次月仍归首单月。
 * 留存率是两类复购奖励的共同前提；新客样本只限制 30 天档位。</p>
 *
 * <p>老客留存按“服务人次”计算：窗口内该伙伴的每一次老客到店为分母，
 * 同手机号在 1–60 天内再次到店（可由其他伙伴服务）为分子。
 * 新客共同服务时按首日服务伙伴人数分摊权重；第二条到店可由其他伙伴完成。</p>
 */
public class RepurchaseBatchCalculator {

    private static final int WEIGHT_SCALE = 6;

    public RepurchaseMetrics calculate(Long massagistId,
                                       List<CustomerVisit> visits,
                                       Map<String, LocalDate> firstVisitDates,
                                       IncentiveRule rule,
                                       String month,
                                       LocalDate dataThrough) {
        return calculate(massagistId, null, visits, firstVisitDates, rule, month, dataThrough);
    }

    /**
     * 按门店范围计算。首单归属和留存分母只统计 scopeShopId 门店，
     * 但客户后续到店允许跨店，以还原真实的 60 天留存与复购行为。
     * scopeShopId 为 null 时不限制门店，用于疗愈师本人视角。
     */
    public RepurchaseMetrics calculate(Long massagistId,
                                       Long scopeShopId,
                                       List<CustomerVisit> visits,
                                       Map<String, LocalDate> firstVisitDates,
                                       IncentiveRule rule,
                                       String month,
                                       LocalDate dataThrough) {
        if (rule == null) {
            throw new IllegalArgumentException("激励规则不能为空");
        }
        YearMonth selected = IncentiveMath.parseMonth(month);
        LocalDate through = IncentiveMath.dataThrough(dataThrough);
        List<CustomerVisit> clean = normalizeVisits(visits, through);
        Map<String, List<CustomerVisit>> byPhone = groupByPhone(clean);
        Map<String, LocalDate> firstVisits = resolveFirstVisits(clean, firstVisitDates);

        RepurchaseMetrics metrics = new RepurchaseMetrics();
        metrics.setRetentionThreshold(rule.getRetentionThreshold());
        metrics.setMinNewSample(rule.getMinNewSample());

        calculateRetention(metrics, massagistId, scopeShopId, clean, byPhone, firstVisits, rule, selected);
        calculateThirtyDay(metrics, massagistId, scopeShopId, byPhone, firstVisits, rule, selected, through);
        calculateTenDay(metrics, massagistId, scopeShopId, byPhone, firstVisits, rule, selected, through);

        metrics.setPotentialAmount(IncentiveMath.sum(
                metrics.getTierPotentialAmount(), metrics.getTenDayPotentialAmount()));
        BigDecimal appliedTier = metrics.getAppliedTierAmount() == null
                ? BigDecimal.ZERO : metrics.getAppliedTierAmount();
        BigDecimal appliedTenDay = metrics.getAppliedTenDayAmount() == null
                ? BigDecimal.ZERO : metrics.getAppliedTenDayAmount();
        metrics.setTotalAmount(IncentiveMath.money(appliedTier.add(appliedTenDay)));
        return metrics;
    }

    private void calculateRetention(RepurchaseMetrics metrics,
                                    Long massagistId,
                                    Long scopeShopId,
                                    List<CustomerVisit> clean,
                                    Map<String, List<CustomerVisit>> byPhone,
                                    Map<String, LocalDate> firstVisits,
                                    IncentiveRule rule,
                                    YearMonth selected) {
        int length = positive(rule.getRetentionMonths(), 6);
        int offset = positive(rule.getRetentionEndOffset(), 2);
        LocalDate start = selected.minusMonths(offset + length - 1L).atDay(1);
        LocalDate end = selected.minusMonths(offset).atEndOfMonth();
        metrics.setRetentionWindowStart(start);
        metrics.setRetentionWindowEnd(end);

        int denominator = 0;
        int retained = 0;
        for (CustomerVisit visit : clean) {
            if (massagistId != null && !massagistId.equals(visit.getMassagistId())) {
                continue;
            }
            if (scopeShopId != null && !scopeShopId.equals(visit.getShopId())) {
                continue;
            }
            if (visit.getServiceDate().isBefore(start) || visit.getServiceDate().isAfter(end)) {
                continue;
            }
            String phone = normalizePhone(visit.getPhone());
            LocalDate first = firstVisits.get(phone);
            if (first == null || !visit.getServiceDate().isAfter(first)) {
                continue;
            }
            denominator++;
            LocalDate next = earliestAfter(byPhone.get(phone), visit.getServiceDate());
            if (next != null) {
                long days = ChronoUnit.DAYS.between(visit.getServiceDate(), next);
                if (days >= 1 && days <= 60) {
                    retained++;
                }
            }
        }

        BigDecimal threshold = rule.getRetentionThreshold() == null
                ? new BigDecimal("60") : rule.getRetentionThreshold();
        metrics.setRetentionSample(denominator);
        metrics.setRetainedVisits(retained);
        metrics.setRetentionRate(IncentiveMath.percent(
                BigDecimal.valueOf(retained), BigDecimal.valueOf(denominator)));
        metrics.setRetentionEligible(denominator > 0
                && IncentiveMath.ratioAtLeast(
                BigDecimal.valueOf(retained), BigDecimal.valueOf(denominator), threshold));
    }

    private void calculateThirtyDay(RepurchaseMetrics metrics,
                                    Long massagistId,
                                    Long scopeShopId,
                                    Map<String, List<CustomerVisit>> byPhone,
                                    Map<String, LocalDate> firstVisits,
                                    IncentiveRule rule,
                                    YearMonth selected,
                                    LocalDate through) {
        int length = positive(rule.getConversionMonths(), 3);
        int offset = positive(rule.getConversionEndOffset(), 1);
        int conversionDays = positive(rule.getConversionDays(), 30);
        LocalDate start = selected.minusMonths(offset + length - 1L).atDay(1);
        LocalDate end = selected.minusMonths(offset).atEndOfMonth();
        metrics.setConversionWindowStart(start);
        metrics.setConversionWindowEnd(end);

        BigDecimal denominator = BigDecimal.ZERO;
        BigDecimal numerator = BigDecimal.ZERO;
        int distinctNew = 0;
        for (Map.Entry<String, LocalDate> entry : firstVisits.entrySet()) {
            String phone = entry.getKey();
            LocalDate first = entry.getValue();
            if (first.isBefore(start) || first.isAfter(end)) {
                continue;
            }
            BigDecimal weight = attributionWeight(phone, first, massagistId, scopeShopId, byPhone);
            if (weight == null) {
                continue;
            }
            distinctNew++;
            denominator = denominator.add(weight);
            LocalDate next = earliestWithin(byPhone.get(phone), first, conversionDays, through);
            if (next != null) {
                numerator = numerator.add(weight);
            }
        }

        int minSample = rule.getMinNewSample() == null ? 30 : Math.max(1, rule.getMinNewSample());
        boolean sampleSufficient = distinctNew >= minSample;
        metrics.setNewCustomerCount(distinctNew);
        metrics.setNewCustomerWeight(scaleWeight(denominator));
        metrics.setRepurchaseWeight(scaleWeight(numerator));
        metrics.setConversionRate(IncentiveMath.percent(numerator, denominator));
        metrics.setConversionSampleSufficient(sampleSufficient);

        List<RepurchaseTier> tiers = sortedTiers(rule.getTiers());
        RepurchaseTier achieved = null;
        for (RepurchaseTier tier : tiers) {
            if (tier.getRate() != null
                    && IncentiveMath.ratioAtLeast(numerator, denominator, tier.getRate())) {
                achieved = tier;
            }
        }
        BigDecimal tierAmount = achieved == null || !sampleSufficient || achieved.getAmount() == null
                ? BigDecimal.ZERO : IncentiveMath.money(achieved.getAmount());
        metrics.setTierRate(achieved == null ? null : achieved.getRate());
        metrics.setTierPotentialAmount(tierAmount);
        metrics.setAppliedTierAmount(metrics.getRetentionEligible() != null
                && metrics.getRetentionEligible() ? tierAmount : BigDecimal.ZERO);

        RepurchaseTier nextTier = null;
        for (RepurchaseTier tier : tiers) {
            if (tier.getRate() != null && denominator.compareTo(BigDecimal.ZERO) > 0
                    && numerator.multiply(IncentiveMath.HUNDRED)
                    .compareTo(tier.getRate().multiply(denominator)) < 0) {
                nextTier = tier;
                break;
            }
        }
        if (nextTier != null) {
            BigDecimal required = nextTier.getRate().multiply(denominator)
                    .divide(IncentiveMath.HUNDRED, 8, RoundingMode.HALF_UP);
            metrics.setNextTierRate(nextTier.getRate());
            metrics.setNextTierAmount(IncentiveMath.money(nextTier.getAmount()));
            metrics.setNeededForNextTier(IncentiveMath.ceil(required.subtract(numerator)));
        } else {
            metrics.setNeededForNextTier(BigDecimal.ZERO.setScale(0));
        }
    }

    private void calculateTenDay(RepurchaseMetrics metrics,
                                 Long massagistId,
                                 Long scopeShopId,
                                 Map<String, List<CustomerVisit>> byPhone,
                                 Map<String, LocalDate> firstVisits,
                                 IncentiveRule rule,
                                 YearMonth selected,
                                 LocalDate through) {
        int tenDayDays = positive(rule.getTenDayDays(), 10);
        LocalDate start = selected.atDay(1);
        LocalDate end = selected.atEndOfMonth();

        List<TenDaySeed> seeds = new ArrayList<>();
        for (Map.Entry<String, LocalDate> entry : firstVisits.entrySet()) {
            String phone = entry.getKey();
            LocalDate first = entry.getValue();
            if (first.isBefore(start) || first.isAfter(end)) {
                continue;
            }
            BigDecimal weight = attributionWeight(phone, first, massagistId, scopeShopId, byPhone);
            if (weight == null) {
                continue;
            }
            LocalDate second = earliestWithin(byPhone.get(phone), first, tenDayDays, through);
            if (second != null) {
                seeds.add(new TenDaySeed(phone, first, second, weight));
            }
        }
        seeds.sort(Comparator
                .comparing(TenDaySeed::getSecondDate)
                .thenComparing(TenDaySeed::getPhone));

        BigDecimal a1 = rule.getFibA1() == null ? new BigDecimal("10") : rule.getFibA1();
        BigDecimal a2 = rule.getFibA2() == null ? a1 : rule.getFibA2();
        BigDecimal cap = rule.getFibCap() == null ? new BigDecimal("130") : rule.getFibCap();
        List<BigDecimal> prices = IncentiveMath.sequence(seeds.size() + 1, a1, a2, cap);

        BigDecimal potential = BigDecimal.ZERO;
        BigDecimal weightedHeads = BigDecimal.ZERO;
        List<TenDayRecord> records = new ArrayList<>();
        for (int i = 0; i < seeds.size(); i++) {
            TenDaySeed seed = seeds.get(i);
            BigDecimal price = prices.get(i);
            BigDecimal amount = IncentiveMath.money(seed.getWeight().multiply(price));
            potential = potential.add(seed.getWeight().multiply(price));
            weightedHeads = weightedHeads.add(seed.getWeight());

            TenDayRecord record = new TenDayRecord();
            record.setFirstVisitDate(seed.getFirstDate());
            record.setSecondVisitDate(seed.getSecondDate());
            record.setPhoneMasked(IncentiveMath.maskPhone(seed.getPhone()));
            record.setWeight(scaleWeight(seed.getWeight()));
            record.setUnitPrice(price);
            record.setAmount(amount);
            records.add(record);
        }

        BigDecimal tenDayPotential = IncentiveMath.money(potential);
        metrics.setTenDayHeadCount(seeds.size());
        metrics.setTenDayWeightedHeads(scaleWeight(weightedHeads));
        metrics.setTenDayPrices(prices);
        metrics.setTenDayRecords(records);
        metrics.setTenDayPotentialAmount(tenDayPotential);
        metrics.setAppliedTenDayAmount(metrics.getRetentionEligible() != null
                && metrics.getRetentionEligible() ? tenDayPotential : BigDecimal.ZERO);
        metrics.setTenDayNextPrice(prices.isEmpty()
                ? BigDecimal.ZERO : prices.get(seeds.size()));
    }

    /**
     * 首单归属权重。若同一天同一门店由 n 位伙伴共同服务，则每位 1/n。
     * 返回 null 表示该客户的首单不由当前伙伴服务。
     */
    private BigDecimal attributionWeight(String phone,
                                         LocalDate firstDate,
                                         Long massagistId,
                                         Long scopeShopId,
                                         Map<String, List<CustomerVisit>> byPhone) {
        List<CustomerVisit> sameDay = new ArrayList<>();
        List<CustomerVisit> visits = byPhone.get(phone);
        if (visits == null) {
            return null;
        }
        CustomerVisit targetRow = null;
        for (CustomerVisit visit : visits) {
            if (firstDate.equals(visit.getServiceDate())) {
                sameDay.add(visit);
                if (targetRow == null && massagistId != null
                        && massagistId.equals(visit.getMassagistId())) {
                    targetRow = visit;
                }
            }
        }
        if (targetRow == null) {
            return null;
        }
        if (scopeShopId != null && !scopeShopId.equals(targetRow.getShopId())) {
            return null;
        }
        Long shopId = targetRow.getShopId();
        Set<Long> partners = new HashSet<>();
        for (CustomerVisit visit : sameDay) {
            if (shopId != null && visit.getShopId() != null && !shopId.equals(visit.getShopId())) {
                continue;
            }
            if (visit.getMassagistId() != null) {
                partners.add(visit.getMassagistId());
            }
        }
        int count = partners.isEmpty() ? 1 : partners.size();
        return BigDecimal.ONE.divide(BigDecimal.valueOf(count), WEIGHT_SCALE, RoundingMode.HALF_UP);
    }

    private List<CustomerVisit> normalizeVisits(List<CustomerVisit> visits, LocalDate through) {
        List<CustomerVisit> result = new ArrayList<>();
        if (visits == null) {
            return result;
        }
        Map<String, CustomerVisit> unique = new LinkedHashMap<>();
        for (CustomerVisit visit : visits) {
            if (visit == null || visit.getServiceDate() == null
                    || normalizePhone(visit.getPhone()).isEmpty()
                    || visit.getServiceDate().isAfter(through)) {
                continue;
            }
            String key = normalizePhone(visit.getPhone()) + "|"
                    + visit.getServiceDate() + "|" + visit.getMassagistId();
            unique.putIfAbsent(key, visit);
        }
        result.addAll(unique.values());
        result.sort(Comparator
                .comparing(CustomerVisit::getServiceDate)
                .thenComparing(v -> v.getMassagistId() == null ? Long.MAX_VALUE : v.getMassagistId()));
        return result;
    }

    private Map<String, List<CustomerVisit>> groupByPhone(List<CustomerVisit> visits) {
        Map<String, List<CustomerVisit>> map = new HashMap<>();
        for (CustomerVisit visit : visits) {
            map.computeIfAbsent(normalizePhone(visit.getPhone()), k -> new ArrayList<>()).add(visit);
        }
        return map;
    }

    private Map<String, LocalDate> resolveFirstVisits(List<CustomerVisit> visits,
                                                      Map<String, LocalDate> supplied) {
        Map<String, LocalDate> result = new HashMap<>();
        if (supplied != null) {
            for (Map.Entry<String, LocalDate> entry : supplied.entrySet()) {
                if (entry.getKey() != null && entry.getValue() != null) {
                    result.put(normalizePhone(entry.getKey()), entry.getValue());
                }
            }
        }
        for (CustomerVisit visit : visits) {
            String phone = normalizePhone(visit.getPhone());
            LocalDate existing = result.get(phone);
            if (existing == null || visit.getServiceDate().isBefore(existing)) {
                result.put(phone, visit.getServiceDate());
            }
        }
        return result;
    }

    private LocalDate earliestAfter(List<CustomerVisit> visits, LocalDate date) {
        if (visits == null) {
            return null;
        }
        for (CustomerVisit visit : visits) {
            if (visit.getServiceDate().isAfter(date)) {
                return visit.getServiceDate();
            }
        }
        return null;
    }

    private LocalDate earliestWithin(List<CustomerVisit> visits,
                                     LocalDate date,
                                     int days,
                                     LocalDate through) {
        if (visits == null) {
            return null;
        }
        LocalDate limit = date.plusDays(days);
        for (CustomerVisit visit : visits) {
            if (visit.getServiceDate().isAfter(date)) {
                if (visit.getServiceDate().isAfter(limit) || visit.getServiceDate().isAfter(through)) {
                    return null;
                }
                return visit.getServiceDate();
            }
        }
        return null;
    }

    private List<RepurchaseTier> sortedTiers(List<RepurchaseTier> tiers) {
        List<RepurchaseTier> result = new ArrayList<>();
        if (tiers != null) {
            for (RepurchaseTier tier : tiers) {
                if (tier != null && tier.getRate() != null) {
                    result.add(tier);
                }
            }
        }
        result.sort(Comparator.comparing(RepurchaseTier::getRate));
        return result;
    }

    private BigDecimal scaleWeight(BigDecimal value) {
        return value == null ? BigDecimal.ZERO.setScale(IncentiveMath.MONEY_SCALE)
                : value.setScale(IncentiveMath.MONEY_SCALE, RoundingMode.HALF_UP);
    }

    private int positive(Integer value, int fallback) {
        return value == null || value < 1 ? fallback : value;
    }

    private String normalizePhone(String phone) {
        return phone == null ? "" : phone.trim();
    }

    private static class TenDaySeed {
        private final String phone;
        private final LocalDate firstDate;
        private final LocalDate secondDate;
        private final BigDecimal weight;

        TenDaySeed(String phone, LocalDate firstDate, LocalDate secondDate, BigDecimal weight) {
            this.phone = phone;
            this.firstDate = firstDate;
            this.secondDate = secondDate;
            this.weight = weight;
        }

        String getPhone() {
            return phone;
        }

        LocalDate getFirstDate() {
            return firstDate;
        }

        LocalDate getSecondDate() {
            return secondDate;
        }

        BigDecimal getWeight() {
            return weight;
        }
    }
}
