package com.macro.mall.model;
import lombok.Data;

import io.swagger.annotations.ApiModelProperty;
import java.io.Serializable;

@Data
public class CmsHelpCategory implements Serializable {
    private Long id;

    private String name;

    @ApiModelProperty(value = "分类图标")
    private String icon;

    @ApiModelProperty(value = "专题数量")
    private Integer helpCount;

    private Integer showStatus;

    private Integer sort;

    private static final long serialVersionUID = 1L;

}