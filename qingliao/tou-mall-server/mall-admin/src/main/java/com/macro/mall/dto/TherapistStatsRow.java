package com.macro.mall.dto;

import com.alibaba.excel.annotation.ExcelIgnore;
import com.alibaba.excel.annotation.ExcelIgnoreUnannotated;
import com.alibaba.excel.annotation.ExcelProperty;
import com.alibaba.excel.annotation.write.style.ColumnWidth;
import lombok.Data;

/** 疗愈师统计行（页面与导出共用）；末行可为合计。 */
@Data
@ExcelIgnoreUnannotated
@ColumnWidth(10)
public class TherapistStatsRow {
    @ExcelIgnore
    private Long massagistId;
    @ExcelProperty("疗愈师") @ColumnWidth(14)
    private String massagistName;
    @ExcelProperty("合作状态") @ColumnWidth(12)
    private String statusText;
    @ExcelProperty("服务订单数") @ColumnWidth(12)
    private int orderCount;
    @ExcelProperty("服务项目数") @ColumnWidth(12)
    private int serviceCount;
    @ExcelProperty({"支付方式（单）", "微信"})
    private int wechatCount;
    @ExcelProperty({"支付方式（单）", "二维码"})
    private int qrCount;
    @ExcelProperty({"支付方式（单）", "Full愈券"})
    private int couponCount;
    @ExcelProperty({"支付方式（单）", "美团"})
    private int meituanCount;
    @ExcelProperty({"支付方式（单）", "现金"})
    private int cashCount;
    @ExcelProperty({"支付方式（单）", "其他"})
    private int otherPayCount;
    @ExcelProperty({"顾客（人）", "男"})
    private int maleCustomers;
    @ExcelProperty({"顾客（人）", "女"})
    private int femaleCustomers;
    @ExcelProperty({"顾客（人）", "未填性别"}) @ColumnWidth(12)
    private int unknownGenderCustomers;
    @ExcelProperty({"点钟", "点钟数"})
    private int specifyCount;
    @ExcelProperty({"点钟", "新增点钟"})
    private int newSpecifyCount;
    @ExcelProperty({"部位（单）", "头"})
    private int headCount;
    @ExcelProperty({"部位（单）", "肩"})
    private int shoulderCount;
    @ExcelProperty({"部位（单）", "腿"})
    private int legCount;
    @ExcelProperty({"部位（单）", "脸"})
    private int faceCount;
    @ExcelProperty({"部位（单）", "眼"})
    private int eyeCount;
    @ExcelProperty({"部位（单）", "手"})
    private int handCount;
    @ExcelProperty({"部位（单）", "耳"})
    private int earCount;
    @ExcelProperty({"部位（单）", "其他"})
    private int otherPartCount;
}
