package com.macro.mall.service;

import com.macro.mall.dto.PageEventDTO;
import com.macro.mall.entity.PageEvent;
import com.macro.mall.mapper.PageEventMapper;
import com.macro.mall.service.base.BaseService;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;

/**
 * 小程序页面埋点入库。
 *
 * <p>埋点只做记录，不参与业务判断：字段超长截断、异常批次丢弃，
 * 任何一条数据不合法都不能影响其它条，更不能把错误抛回小程序。</p>
 */
@Service
public class PageEventService extends BaseService<PageEventMapper, PageEvent> {

    private static final ZoneId ZONE = ZoneId.of("Asia/Shanghai");

    /** 单次上报上限，防止公开接口被刷 */
    public static final int MAX_BATCH = 50;

    private static final int MAX_TEXT = 255;
    private static final int MAX_DEVICE_INFO = 512;
    private static final int MAX_SESSION = 64;
    private static final int MAX_SCENE = 32;
    private static final int MAX_VERSION = 64;
    /** 停留时长上限 1 天，过滤客户端时钟异常 */
    private static final long MAX_STAY_MS = 24L * 60 * 60 * 1000;

    /**
     * 批量落库。
     *
     * @param dtos       上报明细
     * @param customerId 当前登录顾客，未登录为 null
     * @return 实际写入条数
     */
    public int record(List<PageEventDTO> dtos, Long customerId) {
        if (dtos == null || dtos.isEmpty()) {
            return 0;
        }
        List<PageEvent> rows = new ArrayList<>();
        for (PageEventDTO dto : dtos) {
            PageEvent row = toEntity(dto, customerId);
            if (row != null) {
                rows.add(row);
            }
        }
        if (rows.isEmpty()) {
            return 0;
        }
        saveBatch(rows);
        return rows.size();
    }

    private PageEvent toEntity(PageEventDTO dto, Long customerId) {
        if (dto == null) {
            return null;
        }
        String sessionId = truncate(dto.getSessionId(), MAX_SESSION);
        String pagePath = truncate(dto.getPagePath(), MAX_TEXT);
        if (!StringUtils.hasText(sessionId) || !StringUtils.hasText(pagePath)) {
            return null;
        }

        PageEvent row = new PageEvent();
        row.setCustomerId(customerId);
        row.setSessionId(sessionId);
        row.setPagePath(pagePath);
        row.setPageTitle(truncate(dto.getPageTitle(), MAX_TEXT));
        row.setFromPage(truncate(dto.getFromPage(), MAX_TEXT));
        row.setScene(truncate(dto.getScene(), MAX_SCENE));
        row.setAppVersion(truncate(dto.getAppVersion(), MAX_VERSION));
        row.setDeviceInfo(truncate(dto.getDeviceInfo(), MAX_DEVICE_INFO));

        LocalDateTime enter = toTime(dto.getEnterTime());
        LocalDateTime leave = toTime(dto.getLeaveTime());
        row.setEnterTime(enter);
        row.setLeaveTime(leave);

        long stay = dto.getStayDuration() == null ? 0L : dto.getStayDuration();
        stay = Math.max(0L, Math.min(stay, MAX_STAY_MS));
        row.setStayDuration((int) stay);

        LocalDateTime create = toTime(dto.getCreateTime());
        if (create == null) {
            create = leave != null ? leave : LocalDateTime.now(ZONE);
        }
        row.setCreateTime(create);
        return row;
    }

    private LocalDateTime toTime(Long epochMillis) {
        if (epochMillis == null || epochMillis <= 0) {
            return null;
        }
        // 明显异常的时间戳（早于 2020 或晚于 2100）直接丢弃
        if (epochMillis < 1577836800000L || epochMillis > 4102444800000L) {
            return null;
        }
        return LocalDateTime.ofInstant(Instant.ofEpochMilli(epochMillis), ZONE);
    }

    private String truncate(String value, int max) {
        if (!StringUtils.hasText(value)) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.length() <= max ? trimmed : trimmed.substring(0, max);
    }
}
