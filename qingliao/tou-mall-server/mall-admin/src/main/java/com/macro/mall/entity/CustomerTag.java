package com.macro.mall.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import io.swagger.annotations.ApiModel;
import io.swagger.annotations.ApiModelProperty;
import lombok.Getter;
import lombok.Setter;

/**
 * 客户标签
 *
 * @author ST
 * @date 2025/07/10
 */
@Getter
@Setter
@TableName("c_customer_tag")
@ApiModel(value = "CustomerTag对象", description = "客户标签")
public class CustomerTag extends BaseEntity {

    @ApiModelProperty("客户id")
    private Long customerId;

    @ApiModelProperty("基础客户标签id可为空")
    private Long basicCustomerTagId;

    @ApiModelProperty("标签标题")
    private String title;

    private Long createUser;

    private Integer shopId = 1;

}
