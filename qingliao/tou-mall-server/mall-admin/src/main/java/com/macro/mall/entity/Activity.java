package com.macro.mall.entity;

import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableName;
import com.fasterxml.jackson.databind.annotation.JsonSerialize;
import com.macro.mall.serializer.QiniuUrlSerializer;
import io.swagger.annotations.ApiModel;
import io.swagger.annotations.ApiModelProperty;
import lombok.Getter;
import lombok.Setter;

import java.time.LocalDate;
import java.util.List;

/**
 * 活动表
 *
 * @author zkl
 * @date 2025/07/10
 */
@Getter
@Setter
@TableName("s_activity")
@ApiModel(value = "Activity对象", description = "活动表")
public class Activity extends BaseEntity {

    @ApiModelProperty("活动标题")
    private String title;

    @ApiModelProperty("（备用字段）内容")
    private String content;

    @ApiModelProperty("code码")
    private String code;

    /**
     * @see com.macro.mall.enums.ActivityStatus
     */
    @ApiModelProperty("活动状态，0已禁用1启用中")
    private Integer status;

    @ApiModelProperty("开始日期")
    private LocalDate startDate;

    @ApiModelProperty("结束日期")
    private LocalDate endDate;

    @ApiModelProperty("小程序页面路径")
    private String miniProgramPagePath;

    @ApiModelProperty("小程序活动码地址")
    @JsonSerialize(using = QiniuUrlSerializer.class)
    private String miniProgramQrCodeUrl;

    @ApiModelProperty("创建人")
    private Long createUser;

    @TableField(exist = false)
    @ApiModelProperty("活动标签")
    private List<ActivityTag> activityTagList;

    @ApiModelProperty("门店")
    private Long shopId;

}
