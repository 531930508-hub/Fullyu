package com.macro.mall.model;
import lombok.Data;

import io.swagger.annotations.ApiModelProperty;
import java.io.Serializable;

@Data
public class PmsProductAttributeValue implements Serializable {
    private Long id;

    private Long productId;

    private Long productAttributeId;

    @ApiModelProperty(value = "手动添加规格或参数的值，参数单值，规格有多个时以逗号隔开")
    private String value;

    private static final long serialVersionUID = 1L;

}