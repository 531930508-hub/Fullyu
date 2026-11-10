package com.macro.mall.dto;

import com.alibaba.excel.annotation.ExcelIgnoreUnannotated;
import com.alibaba.excel.annotation.ExcelProperty;
import com.alibaba.excel.annotation.write.style.ColumnWidth;
import lombok.Data;

/**
 * @author zkl on 2025/6/24
 */
@Data
@ExcelIgnoreUnannotated
public class ServiceDurationDto {
    private Long shopId;
    private Long massagistId;

    @ExcelProperty(value = "所属门店")
    @ColumnWidth(25)
    private String shopName;
    @ExcelProperty(value = "疗愈师姓名")
    @ColumnWidth(20)
    private String massagistName;
    @ExcelProperty(value = "所属周期")
    @ColumnWidth(20)
    private String periodCode;
    @ExcelProperty(value = "服务数量")
    @ColumnWidth(20)
    private Integer serviceCount;
    @ColumnWidth(25)
    @ExcelProperty(value = "在岗时长(小时)")
    private String workTime;
    @ColumnWidth(25)
    @ExcelProperty(value = "服务时长（分钟）")
    private String serviceDuration;
    @ColumnWidth(25)
    @ExcelProperty(value = "接待时长（分钟）")
    private String receptionDuration;
    @ColumnWidth(25)
    @ExcelProperty(value = "服务工时（分钟）")
    private String serviceWorkingHours;
    @ColumnWidth(25)
    @ExcelProperty(value = "接待工时（分钟）")
    private String receptionWorkingHours;
    @ColumnWidth(25)
    @ExcelProperty(value = "调整工时（分钟）")
    private String adjustDuration;
    @ColumnWidth(25)
    @ExcelProperty(value = "工时（分钟）")
    private String totalWorkingHours;

}
