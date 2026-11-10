package com.macro.mall.incentive.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableName;
import com.macro.mall.entity.BaseEntity;
import io.swagger.annotations.ApiModelProperty;
import lombok.Getter;
import lombok.Setter;

import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 疗愈师项目考核记录。project_key 只对应一个当前有效记录。
 */
@Getter
@Setter
@TableName("s_massagist_training_cert")
public class MassagistTrainingCert extends BaseEntity {

    private Long massagistId;

    private Long shopId;

    private String projectKey;

    private LocalDate passedAt;

    private Long certifierId;

    private String certifierName;

    private String remark;

    @ApiModelProperty("认证来源：LEGACY历史/TEAM三人认证/MANUAL人工特批")
    private String source;

    @ApiModelProperty("认证写入时间")
    private LocalDateTime certifiedAt;

    @ApiModelProperty("认证团队人数；历史与人工为0")
    private Integer teamSize;

    @TableField(value = "update_time", fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updateTime;
}
