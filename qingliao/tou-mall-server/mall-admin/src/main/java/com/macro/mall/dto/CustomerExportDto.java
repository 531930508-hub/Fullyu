package com.macro.mall.dto;

import com.alibaba.excel.annotation.ExcelIgnoreUnannotated;
import com.alibaba.excel.annotation.ExcelProperty;
import com.alibaba.excel.annotation.write.style.ColumnWidth;
import lombok.Data;

@Data
@ExcelIgnoreUnannotated
public class CustomerExportDto {

    @ExcelProperty(value = "称呼")
    @ColumnWidth(25)
    private String nickname;

    @ExcelProperty(value = "手机号")
    @ColumnWidth(25)
    private String phone;

    @ExcelProperty(value = "备注")
    @ColumnWidth(25)
    private String note;

    @ExcelProperty(value = "更新时间")
    @ColumnWidth(25)
    private String updateTime;

    @ExcelProperty(value = "注册时间")
    @ColumnWidth(25)
    private String createTime;
}
