package com.macro.mall.service.serviceStatistics;

import com.alibaba.fastjson2.JSON;
import com.alibaba.fastjson2.JSONArray;
import com.macro.mall.dto.TherapistStatsRow;
import com.macro.mall.dto.TherapistStatsSource;

import java.time.LocalDateTime;
import java.util.*;

/**
 * 疗愈师统计纯聚合（无 IO）：
 * 订单数/支付方式/部位按去重订单计；男女按去重顾客计；点钟按明细计（specify_type 1、2）；
 * 新增点钟 = 该顾客与该疗愈师历史上第一次点钟（firstSpecify 的 key 为 "疗愈师id:顾客id"）。
 */
public final class TherapistStatsAggregator {

    private TherapistStatsAggregator() {}

    public static List<TherapistStatsRow> aggregate(List<Long> massagistIds, Map<Long, String> names,
                                                    Map<Long, Integer> statuses, List<TherapistStatsSource> rows,
                                                    Map<String, LocalDateTime> firstSpecify) {
        Map<Long, TherapistStatsRow> out = new LinkedHashMap<>();
        for (Long id : massagistIds) {
            TherapistStatsRow r = new TherapistStatsRow();
            r.setMassagistId(id);
            r.setMassagistName(names.getOrDefault(id, "疗愈师#" + id));
            r.setStatusText(statusText(statuses.get(id)));
            out.put(id, r);
        }
        Map<Long, Set<Long>> orders = new HashMap<>();
        Map<Long, Set<Long>> customers = new HashMap<>();
        Set<String> newSpecifyCounted = new HashSet<>();
        for (TherapistStatsSource s : rows == null ? Collections.<TherapistStatsSource>emptyList() : rows) {
            TherapistStatsRow r = out.get(s.getMassagistId());
            if (r == null) continue;
            r.setServiceCount(r.getServiceCount() + 1);
            if (isSpecify(s.getSpecifyType())) {
                r.setSpecifyCount(r.getSpecifyCount() + 1);
                String key = s.getMassagistId() + ":" + s.getCustomerId();
                LocalDateTime first = firstSpecify.get(key);
                if (s.getCustomerId() != null && first != null && first.equals(s.getStartTime())
                        && newSpecifyCounted.add(key)) {
                    r.setNewSpecifyCount(r.getNewSpecifyCount() + 1);
                }
            }
            if (s.getCustomerId() != null
                    && customers.computeIfAbsent(s.getMassagistId(), k -> new HashSet<>()).add(s.getCustomerId())) {
                if (Integer.valueOf(1).equals(s.getGender())) r.setMaleCustomers(r.getMaleCustomers() + 1);
                else if (Integer.valueOf(2).equals(s.getGender())) r.setFemaleCustomers(r.getFemaleCustomers() + 1);
                else r.setUnknownGenderCustomers(r.getUnknownGenderCustomers() + 1);
            }
            if (s.getOrderId() == null
                    || !orders.computeIfAbsent(s.getMassagistId(), k -> new HashSet<>()).add(s.getOrderId())) continue;
            r.setOrderCount(r.getOrderCount() + 1);
            countPay(r, s.getPayType());
            for (String part : parseParts(s.getParts())) countPart(r, part);
        }
        return new ArrayList<>(out.values());
    }

    public static TherapistStatsRow totalRow(List<TherapistStatsRow> rows) {
        TherapistStatsRow t = new TherapistStatsRow();
        t.setMassagistName("合计");
        t.setStatusText("");
        for (TherapistStatsRow r : rows) {
            t.setOrderCount(t.getOrderCount() + r.getOrderCount());
            t.setServiceCount(t.getServiceCount() + r.getServiceCount());
            t.setWechatCount(t.getWechatCount() + r.getWechatCount());
            t.setQrCount(t.getQrCount() + r.getQrCount());
            t.setCouponCount(t.getCouponCount() + r.getCouponCount());
            t.setMeituanCount(t.getMeituanCount() + r.getMeituanCount());
            t.setCashCount(t.getCashCount() + r.getCashCount());
            t.setOtherPayCount(t.getOtherPayCount() + r.getOtherPayCount());
            t.setMaleCustomers(t.getMaleCustomers() + r.getMaleCustomers());
            t.setFemaleCustomers(t.getFemaleCustomers() + r.getFemaleCustomers());
            t.setUnknownGenderCustomers(t.getUnknownGenderCustomers() + r.getUnknownGenderCustomers());
            t.setSpecifyCount(t.getSpecifyCount() + r.getSpecifyCount());
            t.setNewSpecifyCount(t.getNewSpecifyCount() + r.getNewSpecifyCount());
            t.setHeadCount(t.getHeadCount() + r.getHeadCount());
            t.setShoulderCount(t.getShoulderCount() + r.getShoulderCount());
            t.setLegCount(t.getLegCount() + r.getLegCount());
            t.setFaceCount(t.getFaceCount() + r.getFaceCount());
            t.setEyeCount(t.getEyeCount() + r.getEyeCount());
            t.setHandCount(t.getHandCount() + r.getHandCount());
            t.setEarCount(t.getEarCount() + r.getEarCount());
            t.setOtherPartCount(t.getOtherPartCount() + r.getOtherPartCount());
        }
        return t;
    }

    static boolean isSpecify(Integer specifyType) {
        return Integer.valueOf(1).equals(specifyType) || Integer.valueOf(2).equals(specifyType);
    }

    static String statusText(Integer status) {
        if (status == null) return "";
        switch (status) {
            case 1: return "合作中";
            case 2: return "暂停合作";
            case 0: return "已结束合作";
            default: return "其他";
        }
    }

    private static void countPay(TherapistStatsRow r, Integer payType) {
        int p = payType == null ? -1 : payType;
        switch (p) {
            case 0: r.setQrCount(r.getQrCount() + 1); break;
            case 1: r.setWechatCount(r.getWechatCount() + 1); break;
            case 2: r.setCouponCount(r.getCouponCount() + 1); break;
            case 3: r.setMeituanCount(r.getMeituanCount() + 1); break;
            case 4: r.setCashCount(r.getCashCount() + 1); break;
            default: r.setOtherPayCount(r.getOtherPayCount() + 1);
        }
    }

    private static void countPart(TherapistStatsRow r, String part) {
        switch (part) {
            case "头": r.setHeadCount(r.getHeadCount() + 1); break;
            case "肩": r.setShoulderCount(r.getShoulderCount() + 1); break;
            case "腿": r.setLegCount(r.getLegCount() + 1); break;
            case "脸": r.setFaceCount(r.getFaceCount() + 1); break;
            case "眼": r.setEyeCount(r.getEyeCount() + 1); break;
            case "手": r.setHandCount(r.getHandCount() + 1); break;
            case "耳": r.setEarCount(r.getEarCount() + 1); break;
            default: r.setOtherPartCount(r.getOtherPartCount() + 1);
        }
    }

    /** 解析 ["头","肩"]；同一订单重复部位只计一次；非法内容视为无部位。 */
    static Set<String> parseParts(String parts) {
        Set<String> result = new LinkedHashSet<>();
        if (parts == null || parts.trim().isEmpty()) return result;
        try {
            JSONArray array = JSON.parseArray(parts);
            if (array == null) return result;
            for (Object o : array) {
                if (o == null) continue;
                String p = String.valueOf(o).trim();
                if (!p.isEmpty()) result.add(p);
            }
        } catch (RuntimeException e) {
            return Collections.emptySet();
        }
        return result;
    }
}
