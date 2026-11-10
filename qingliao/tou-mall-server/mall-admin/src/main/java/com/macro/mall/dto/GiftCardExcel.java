package com.macro.mall.dto;

import com.alibaba.excel.annotation.ExcelProperty;
import com.alibaba.excel.annotation.write.style.ColumnWidth;
import com.fasterxml.jackson.annotation.JsonFormat;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * @author zkl on 2025/7/17
 */
@Data
public class GiftCardExcel {

    @ExcelProperty(value = "用途/活动")
    @ColumnWidth(25)
    private String activityTitle;

    @ExcelProperty(value = "编码")
    @ColumnWidth(25)
    private String code;

    @ExcelProperty(value = "密码")
    @ColumnWidth(25)
    private String password;

    @ExcelProperty(value = "类型")
    @ColumnWidth(25)
    private String typeLabel;

    @ExcelProperty(value = "面值")
    @ColumnWidth(25)
    private BigDecimal amount;

    @ExcelProperty(value = "兑券数量（张）")
    @ColumnWidth(25)
    private String numberLabel;

    @ExcelProperty(value = "券过期天数（天）")
    @ColumnWidth(25)
    private String validDateStr;

    @ExcelProperty(value = "状态")
    @ColumnWidth(25)
    private String statusLabel;

    @ExcelProperty("发放时间")
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    @ColumnWidth(25)
    private LocalDateTime distributionTime;

    @ExcelProperty("领取时间")
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    @ColumnWidth(25)
    private LocalDateTime receiveTime;

    @ExcelProperty("失效时间")
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    @ColumnWidth(25)
    private LocalDateTime failureTime;

    @ExcelProperty("领取客户")
    @ColumnWidth(25)
    private String customerNickname;

    @ExcelProperty("领取客户手机号")
    @ColumnWidth(25)
    private String customerPhone;

    @ExcelProperty("使用限制")
    @ColumnWidth(25)
    private String limitations;
}
