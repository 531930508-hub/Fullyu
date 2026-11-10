package com.macro.mall.model;
import lombok.Data;

import io.swagger.annotations.ApiModelProperty;
import java.io.Serializable;

@Data
public class PmsProductAttributeCategory implements Serializable {
    private Long id;

    private String name;

    @ApiModelProperty(value = "属性数量")
    private Integer attributeCount;

    @ApiModelProperty(value = "参数数量")
    private Integer paramCount;

    private static final long serialVersionUID = 1L;

}