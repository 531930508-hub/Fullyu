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
}
