package com.macro.mall.model;
import lombok.Data;

import io.swagger.annotations.ApiModelProperty;
import java.io.Serializable;
import java.math.BigDecimal;

@Data
public class PmsMemberPrice implements Serializable {
    private Long id;

    private Long productId;

    private Long memberLevelId;

    @ApiModelProperty(value = "会员价格")
    private BigDecimal memberPrice;

    private String memberLevelName;

    private static final long serialVersionUID = 1L;

}