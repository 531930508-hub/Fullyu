package com.macro.mall.service.serviceStatistics;

import com.macro.mall.common.exception.BusinessException;
import com.macro.mall.dto.TherapistStatsRow;
import com.macro.mall.dto.TherapistStatsSource;
import com.macro.mall.mapper.TherapistStatsMapper;
import com.macro.mall.utils.ExcelUtil;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.time.format.ResolverStyle;
import java.util.*;

/** 疗愈师统计：服务订单、支付方式、男女顾客、点钟/新增点钟、部位。 */
@Service
public class TherapistStatsService {
    static final int EXPORT_LIMIT = 2000;
    static final int MAX_IDS = 200;

    @Autowired
    TherapistStatsMapper mapper;

    public Map<String, Object> page(Long shopId, String startTime, String endTime, List<Long> ids, Integer status,
                                    int page, int size) {
        validate(startTime, endTime, ids, status);
        if (page < 1 || page > 100000 || size < 1 || size > 100) throw new BusinessException("分页参数不正确");
        Integer s = status == null ? 1 : status;
        long total = mapper.countTherapists(shopId, startTime, endTime, ids, s);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("total", total); result.put("pageNum", page); result.put("pageSize", size);
        result.put("list", Collections.emptyList());
        if (total == 0 || (long) (page - 1) * size >= total) return result;
        List<Map<String, Object>> keys = mapper.therapistKeys(shopId, startTime, endTime, ids, s, (page - 1) * size, size);
        List<TherapistStatsRow> rows = build(shopId, startTime, endTime, s, keys);
        result.put("list", rows);
        result.put("summary", TherapistStatsAggregator.totalRow(rows));
        return result;
    }

    public void export(Long shopId, String startTime, String endTime, List<Long> ids, Integer status) {
        validate(startTime, endTime, ids, status);
        Integer s = status == null ? 1 : status;
        long total = mapper.countTherapists(shopId, startTime, endTime, ids, s);
        if (total > EXPORT_LIMIT) throw new BusinessException("单次最多导出 " + EXPORT_LIMIT + " 位疗愈师，请缩小筛选范围");
        List<Map<String, Object>> keys = total == 0 ? Collections.emptyList()
                : mapper.therapistKeys(shopId, startTime, endTime, ids, s, 0, 0);
        List<TherapistStatsRow> rows = new ArrayList<>(build(shopId, startTime, endTime, s, keys));
        rows.add(TherapistStatsAggregator.totalRow(rows));
        ExcelUtil.export(rows, TherapistStatsRow.class, "疗愈师统计.xlsx");
    }

    private List<TherapistStatsRow> build(Long shopId, String startTime, String endTime, Integer status,
                                          List<Map<String, Object>> keys) {
        if (keys == null || keys.isEmpty()) return Collections.emptyList();
        List<Long> pageIds = new ArrayList<>();
        Map<Long, String> names = new HashMap<>();
        Map<Long, Integer> statuses = new HashMap<>();
        for (Map<String, Object> k : keys) {
            Long id = ((Number) k.get("massagistId")).longValue();
            pageIds.add(id);
            if (k.get("name") != null) names.put(id, String.valueOf(k.get("name")));
            if (k.get("status") != null) statuses.put(id, ((Number) k.get("status")).intValue());
        }
        List<TherapistStatsSource> sources = mapper.sources(shopId, startTime, endTime, pageIds, status);
        Map<String, LocalDateTime> first = new HashMap<>();
        for (Map<String, Object> f : mapper.firstSpecify(pageIds)) {
            LocalDateTime t = toLocalDateTime(f.get("firstTime"));
            if (t != null) first.put(f.get("massagistId") + ":" + f.get("customerId"), t);
        }
        return TherapistStatsAggregator.aggregate(pageIds, names, statuses, sources, first);
    }

    static LocalDateTime toLocalDateTime(Object v) {
        if (v == null) return null;
        if (v instanceof LocalDateTime) return (LocalDateTime) v;
        if (v instanceof java.sql.Timestamp) return ((java.sql.Timestamp) v).toLocalDateTime();
        if (v instanceof Date) return new java.sql.Timestamp(((Date) v).getTime()).toLocalDateTime();
        return null;
    }

    static void validate(String startTime, String endTime, List<Long> ids, Integer status) {
        if (status != null && !Arrays.asList(-1, 0, 1, 2).contains(status)) throw new BusinessException("合作状态不正确");
        if (ids != null && ids.size() > MAX_IDS) throw new BusinessException("一次最多选择 " + MAX_IDS + " 位疗愈师");
        LocalDateTime start;
        LocalDateTime end;
        try {
            DateTimeFormatter f = DateTimeFormatter.ofPattern("uuuu-MM-dd HH:mm:ss").withResolverStyle(ResolverStyle.STRICT);
            start = LocalDateTime.parse(startTime, f);
            end = LocalDateTime.parse(endTime, f);
        } catch (java.time.format.DateTimeParseException | NullPointerException e) {
            throw new BusinessException("统计日期格式不正确");
        }
        if (end.isBefore(start)) throw new BusinessException("统计结束日期不能早于开始日期");
        if (start.plusDays(366).isBefore(end)) throw new BusinessException("单次最多统计 366 天，请缩小日期区间");
    }
}
