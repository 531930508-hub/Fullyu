package com.macro.mall.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import io.swagger.annotations.ApiModel;
import io.swagger.annotations.ApiModelProperty;
import lombok.Getter;
import lombok.Setter;

import java.math.BigDecimal;

/**
 * 项目表
 *
 * @author ST
 * @date 2025/06/04
 */
@Getter
@Setter
@TableName("s_project")
@ApiModel(value = "Project对象", description = "")
public class Project extends BaseEntity {

    @ApiModelProperty("标题")
    private String title;

    @ApiModelProperty("图标")
    private String icon;

    @ApiModelProperty("状态：0下架，1正常")
    private Integer state;

    @ApiModelProperty("内容")
    private String content;

    @ApiModelProperty("备注")
    private String comment;

    @ApiModelProperty("属性：1湿区，2干区")
    private Integer type;

    @ApiModelProperty("系数")
    private BigDecimal coefficient = BigDecimal.ONE;

    @ApiModelProperty("分类：1项目，2接待")
    private Integer category = 1;

}
