package com.macro.mall.incentive.dto;

import com.fasterxml.jackson.annotation.JsonFormat;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 统计排除账号列表行。
 */
@Data
public class InternalAccountView {

    private Long id;

    private String phone;

    private Integer enabled;

    private String remark;

    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime createTime;
}