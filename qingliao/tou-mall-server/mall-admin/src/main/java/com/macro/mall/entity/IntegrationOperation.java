package com.macro.mall.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import io.swagger.annotations.ApiModel;
import io.swagger.annotations.ApiModelProperty;
import lombok.Getter;
import lombok.Setter;

/**
 * 积分管理操作记录：单笔调整与批量导入的每一行，含操作人与结果。
 * 积分账本仍以 s_integration 为准；本表只做审计追溯。
 */
@Getter
@Setter
@TableName("s_integration_operation")
@ApiModel(value = "IntegrationOperation对象", description = "积分管理操作记录")
public class IntegrationOperation extends BaseEntity {
    public static final Integer ADJUST = 1;
    public static final Integer IMPORT = 2;

    @ApiModelProperty("批次号：导入同一文件共用；单笔调整各自一个")
    private String batchNo;
    @ApiModelProperty("1单笔调整 2批量导入")
    private Integer opType;
    private Long customerId;
    private String phone;
    @ApiModelProperty("变动积分，正数调增、负数调减")
    private Long score;
    private String reason;
    private Boolean success;
    @ApiModelProperty("失败原因")
    private String message;
    @ApiModelProperty("对应 s_integration 记录")
    private Long integrationId;
    private Long operatorId;
    private String operatorName;
}
