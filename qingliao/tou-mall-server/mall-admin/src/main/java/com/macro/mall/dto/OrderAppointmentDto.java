package com.macro.mall.dto;

import com.alibaba.excel.annotation.ExcelProperty;
import com.alibaba.excel.annotation.write.style.ColumnWidth;
import com.fasterxml.jackson.annotation.JsonFormat;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * @author zkl on 2025/7/15
 */
@Data
public class OrderAppointmentDto {

    @ExcelProperty(value = "客户称呼")
    @ColumnWidth(25)
    private String customerNickname;

    @ExcelProperty(value = "客户手机号")
    @ColumnWidth(25)
    private String customerPhone;

    @ExcelProperty(value = "产品名称")
    @ColumnWidth(25)
    private String productTitle;

    @ExcelProperty(value = "所属门店")
    @ColumnWidth(25)
    private String shopName;

    @ExcelProperty(value = "订单编号")
    @ColumnWidth(25)
    private String code;

    @ExcelProperty(value = "总金额（元）")
    @ColumnWidth(25)
    private BigDecimal totalAmount;

    @ExcelProperty(value = "实付金额（元）")
    @ColumnWidth(25)
    private BigDecimal payAmount;

    @ExcelProperty(value = "用券数量（张）")
    @ColumnWidth(25)
    private Long couponAmount;
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

    @ExcelProperty(value = "预约时间")
    @ColumnWidth(25)
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime startTime;

    @ExcelProperty(value = "预约人数")
    @ColumnWidth(25)
    private Integer personCount;

    @ExcelProperty(value = "疗愈时长(min)")
    @ColumnWidth(25)
    private Integer duration;


    @ExcelProperty(value = "订单状态")
    @ColumnWidth(25)
    private String appointmentStateStr;

    @ExcelProperty(value = "预约类型")
    @ColumnWidth(25)
    private String appointmentTypeStr;

    @ExcelProperty(value = "订单备注")
    @ColumnWidth(25)
    private String comment;

    @ExcelProperty(value = "取消原因")
    @ColumnWidth(25)
    private String cancelReason;

    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    @ExcelProperty(value = "提交时间")
    @ColumnWidth(25)
    private LocalDateTime createTime;

    @ExcelProperty(value = "精油")
    @ColumnWidth(25)
    private String oil;

    @ExcelProperty(value = "部位")
    @ColumnWidth(25)
    private String parts;

    @ExcelProperty(value = "疗愈师姓名")
    @ColumnWidth(25)
    private String massagistName;


}
