package com.macro.mall.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.fasterxml.jackson.annotation.JsonFormat;
import io.swagger.annotations.ApiModel;
import io.swagger.annotations.ApiModelProperty;
import lombok.Getter;
import lombok.Setter;

import java.time.LocalDateTime;

/** 后台导出台账。由 ExportLogAspect 在导出成功后自动写入，不作为业务数据源。 */
@Getter
@Setter
@TableName("s_export_record")
@ApiModel(value = "ExportRecord对象", description = "导出台账")
public class ExportRecord {
    @TableId(type = IdType.AUTO)
    @ApiModelProperty(hidden = true)
    private Long id;

    @ApiModelProperty("模块稳定标识，如 order")
    private String module;

    @ApiModelProperty("模块名称，如 订单列表")
    private String moduleName;

    @ApiModelProperty("操作人后台账号id")
    private Long operatorId;

    @ApiModelProperty("操作人姓名")
    private String operatorName;

    @ApiModelProperty("操作人登录账号")
    private String operatorAccount;

    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    @ApiModelProperty("导出时间")
    private LocalDateTime exportTime;

    @ApiModelProperty("导出时的筛选条件 JSON；无筛选条件为空")
    private String filterCondition;

    @ApiModelProperty("实际下载文件名")
    private String fileName;
}