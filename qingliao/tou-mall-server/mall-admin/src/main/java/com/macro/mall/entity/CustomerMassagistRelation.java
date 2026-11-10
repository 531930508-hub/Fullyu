package com.macro.mall.entity;

import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableName;
import io.swagger.annotations.ApiModel;
import io.swagger.annotations.ApiModelProperty;
import lombok.Getter;
import lombok.Setter;

/**
 * 客户疗愈师关联表
 *
 * @author ST
 * @date 2025/06/12
 */
@Getter
@Setter
@TableName("c_customer_massagist_relation")
@ApiModel(value = "CustomerMassagistRelation对象", description = "")
public class CustomerMassagistRelation extends BaseEntity {

    @ApiModelProperty("客户id")
    private Long customerId;

    @ApiModelProperty("服务人员id")
    private Long massagistId;

    @TableField(exist = false)
    @ApiModelProperty("服务人员")
    private Massagist massagist;

}
