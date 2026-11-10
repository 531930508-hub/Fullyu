package com.macro.mall.dto;

import com.alibaba.excel.annotation.ExcelIgnoreUnannotated;
import com.alibaba.excel.annotation.ExcelProperty;
import com.alibaba.excel.annotation.write.style.ColumnWidth;
import com.fasterxml.jackson.annotation.JsonFormat;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * 经营流水
 *
 * @author zkl on 2025/6/17
 */
@Data
@ExcelIgnoreUnannotated
public class OperatingRevenueDto {
    @ExcelProperty(value = "所属门店")
    @ColumnWidth(25)
    private String shopName;
    @ExcelProperty(value = "收支类型")
    @ColumnWidth(20)
    private String type;//收支类型
    @ExcelProperty(value = "流水类型")
    @ColumnWidth(20)
    private String businessType;//流水类型
    @ExcelProperty(value = "动账金额")
    @ColumnWidth(20)
    private BigDecimal amount;//动账金额
    @ExcelProperty(value = "支付状态")
    @ColumnWidth(20)
    private String payState;//支付状态
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    @ExcelProperty(value = "入账时间")
    @ColumnWidth(20)
    private LocalDateTime finishTime;//入账时间
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    @ExcelProperty(value = "支付时间")
    @ColumnWidth(20)
    private LocalDateTime payTime;//支付时间
    @ExcelProperty(value = "收支渠道")
    @ColumnWidth(20)
    private String payType;//收支渠道
    @ExcelProperty(value = "消费状态")
    @ColumnWidth(20)
    private String consumptionState;//消费状态
    private Long customerId;//客户id
    private Long orderId;//订单id
    private Long shopId;//门店
    @ExcelProperty(value = "客户称呼")
    @ColumnWidth(20)
    private String nickname;//客户名称
    @ExcelProperty(value = "客户手机号")
    @ColumnWidth(20)
    private String phone;//客户手机号
    @ExcelProperty(value = "关联订单")
    @ColumnWidth(20)
    private String orderCode;//订单code


    //筛选时的参数
    private String startPayTime;//筛选时传入参数
    private String endPayTime;//筛选时传入参数
    private Integer page;//筛选时传入参数
    private Integer size;//筛选时传入参数
}
