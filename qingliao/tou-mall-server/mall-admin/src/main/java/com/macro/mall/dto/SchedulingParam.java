package com.macro.mall.dto;

import lombok.Data;
import org.springframework.format.annotation.DateTimeFormat;

import javax.validation.constraints.NotNull;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;

/**
 * @author zkl on 2025/6/18
 */
@Data
public class SchedulingParam {
    @NotNull(message = "门店不允许为空")
    private Long shopId;


    public LocalDateTime getStartDateTime() {
        return date.atTime(LocalTime.MIN);
    }

    public LocalDateTime getEndDateTime() {
        return date.atTime(LocalTime.MAX).plusMinutes(120);
    }

    @DateTimeFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime startDateTime;

    @DateTimeFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime endDateTime;

    @NotNull(message = "时间范围-查询开始时间不允许为空")
    @DateTimeFormat(pattern = "yyyy-MM-dd")
    private LocalDate date;

    /**
     * @see com.macro.mall.enums.SchedulingType
     */
    @NotNull(message = "查询类型不允许为空")
    private Integer type;//1是按床位查询，2是按疗愈师查询

    /**
     * 根据客户手机号查询
     */
    private String customerPhone;

    /**
     * 只查指定疗愈师（疗愈师只读看板用，仅 type=2 生效）
     */
    private Long massagistId;

    /**
     * 看板查询未来日期时，已完成/已取消/已服务过的明细不再占位；当天及以前保留，便于回看历史。
     */
    public boolean isFutureView() {
        return date != null && date.isAfter(LocalDate.now());
    }
}
