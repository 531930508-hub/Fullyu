package com.macro.mall.dto;

import com.alibaba.excel.annotation.ExcelProperty;
import com.alibaba.excel.annotation.write.style.ColumnWidth;
import com.fasterxml.jackson.annotation.JsonFormat;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * @author zkl on 2025/7/15
 */
@Data
public class OrderCardDto {
    @ExcelProperty(value = "客户称呼")
    @ColumnWidth(25)
    private String customerNickname;

    @ExcelProperty(value = "客户手机号")
    @ColumnWidth(25)
    private String customerPhone;

    @ExcelProperty(value = "实际使用人")
    @ColumnWidth(25)
    private String toCustomerPhone;

    @ExcelProperty(value = "产品名称")
    @ColumnWidth(25)
    private String productTitle;
    @ExcelProperty(value = "订单编号")
    @ColumnWidth(25)
    private String code;

    @ExcelProperty(value = "总金额（元）")
    @ColumnWidth(25)
    private String totalAmountStr;

    @ExcelProperty(value = "实付金额（元）")
    @ColumnWidth(25)
    private String payAmountStr;

    @ExcelProperty(value = "积分抵扣金额（元）")
    @ColumnWidth(25)
    private String integrationAmountStr;
    @ExcelProperty(value = "支付方式")
    @ColumnWidth(25)
    private String payTypeStr;

    @ExcelProperty(value = "支付时间")
    @ColumnWidth(25)
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime payTime;

    @ExcelProperty(value = "支付状态")
    @ColumnWidth(25)
    private String stateStr;
    @ExcelProperty(value = "订单备注")
    @ColumnWidth(25)
    private String comment;

    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    @ExcelProperty(value = "提交时间")
    @ColumnWidth(25)
    private LocalDateTime createTime;
}
