package com.macro.mall.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.github.pagehelper.PageHelper;
import com.github.pagehelper.PageInfo;
import com.macro.mall.common.exception.BusinessException;
import com.macro.mall.entity.ExportRecord;
import com.macro.mall.mapper.ExportRecordMapper;
import com.macro.mall.service.base.BaseService;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.List;
import java.util.Map;

/** 导出台账查询。写入由 ExportLogAspect 负责。 */
@Service
public class ExportRecordService extends BaseService<ExportRecordMapper, ExportRecord> {

    private static final DateTimeFormatter DATE_TIME = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
    private static final DateTimeFormatter MINUTE = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm");

    public PageInfo<ExportRecord> pageRecords(Map<String, Object> params) {
        int page = positiveInt(params.get("page"), 1);
        int size = Math.min(positiveInt(params.get("size"), 10), 200);
        String module = text(params.get("module"));
        String operator = text(params.get("operator"));
        LocalDateTime startTime = parseTime(params.get("startTime"), false);
        LocalDateTime endTime = parseTime(params.get("endTime"), true);

        LambdaQueryWrapper<ExportRecord> query = new LambdaQueryWrapper<>();
        query.eq(StringUtils.hasText(module), ExportRecord::getModule, module)
                .ge(startTime != null, ExportRecord::getExportTime, startTime)
                .le(endTime != null, ExportRecord::getExportTime, endTime);
        if (StringUtils.hasText(operator)) {
            query.and(wrapper -> wrapper.like(ExportRecord::getOperatorName, operator)
                    .or().like(ExportRecord::getOperatorAccount, operator));
        }
        query.orderByDesc(ExportRecord::getExportTime).orderByDesc(ExportRecord::getId);

        PageHelper.startPage(page, size);
        return new PageInfo<>(list(query));
    }

    /** 台账里出现过的模块，供页面筛选下拉使用，避免前端硬编码模块清单 */
    public List<ExportRecord> listModules() {
        LambdaQueryWrapper<ExportRecord> query = new LambdaQueryWrapper<>();
        query.select(ExportRecord::getModule, ExportRecord::getModuleName)
                .groupBy(ExportRecord::getModule, ExportRecord::getModuleName)
                .orderByAsc(ExportRecord::getModule);
        return list(query);
    }

    public ExportRecord detail(Long id) {
        if (id == null) {
            throw new BusinessException("导出记录id不能为空");
        }
        ExportRecord record = getById(id);
        if (record == null) {
            throw new BusinessException("导出记录不存在");
        }
        return record;
    }

    private static int positiveInt(Object value, int fallback) {
        if (value == null || !StringUtils.hasText(value.toString())) {
            return fallback;
        }
        try {
            return Math.max(Integer.parseInt(value.toString().trim()), 1);
        } catch (NumberFormatException e) {
            return fallback;
        }
    }

    private static String text(Object value) {
        return value == null ? null : value.toString().trim();
    }

    static LocalDateTime parseTime(Object value, boolean endOfRange) {
        String raw = text(value);
        if (!StringUtils.hasText(raw)) {
            return null;
        }
        try {
            if (raw.length() == 10) {
                LocalDate date = LocalDate.parse(raw);
                return endOfRange ? date.atTime(23, 59, 59) : date.atStartOfDay();
            }
            String normalized = raw.replace('T', ' ');
            if (normalized.length() == 16) {
                LocalDateTime minute = LocalDateTime.parse(normalized, MINUTE);
                return endOfRange ? minute.withSecond(59) : minute;
            }
            return LocalDateTime.parse(normalized, DATE_TIME);
        } catch (DateTimeParseException e) {
            throw new BusinessException("时间格式不正确，应为 yyyy-MM-dd 或 yyyy-MM-dd HH:mm:ss");
        }
    }
}