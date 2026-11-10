package com.macro.mall.dto;

import com.fasterxml.jackson.databind.annotation.JsonDeserialize;
import com.macro.mall.serializer.ArrayStringDeSerializer;
import io.swagger.annotations.ApiModelProperty;
import lombok.Getter;
import lombok.Setter;

/**
 * @author
 * @date
 */
@Getter
@Setter
public class AddOrderLabelDto {

    @ApiModelProperty("订单id")
    private Long orderId;

    @ApiModelProperty("精油")
    private String oil;

    @ApiModelProperty("部位")
    @JsonDeserialize(using = ArrayStringDeSerializer.class)
    private String parts;
}
