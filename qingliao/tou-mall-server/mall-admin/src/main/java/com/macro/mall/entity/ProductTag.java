package com.macro.mall.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import io.swagger.annotations.ApiModel;
import io.swagger.annotations.ApiModelProperty;
import lombok.Getter;
import lombok.Setter;

/**
 * 商品标签
 *
 * @author
 * @date 2025/07/14
 */
@Getter
@Setter
@TableName("s_product_tag")
@ApiModel(value = "ProductTag对象", description = "")
public class ProductTag extends BaseEntity {

    @ApiModelProperty("商品id")
    private Long productId;

    @ApiModelProperty("基础客户标签id")
    private Long basicCustomerTagId;

    @ApiModelProperty("标签标题")
    private String title;

    private Long createUser;

    private Long shopId;

}
