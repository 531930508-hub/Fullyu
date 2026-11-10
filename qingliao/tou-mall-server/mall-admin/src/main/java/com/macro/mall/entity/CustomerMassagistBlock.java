package com.macro.mall.entity;

import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableName;
import io.swagger.annotations.ApiModel;
import io.swagger.annotations.ApiModelProperty;
import lombok.Getter;
import lombok.Setter;

/**
 * 客户暂别的疗愈师（客户级偏好标记，对外统一称「暂别」）
 *
 * @date 2026/11/07
 */
@Getter
@Setter
@TableName("c_customer_massagist_block")
@ApiModel(value = "CustomerMassagistBlock对象", description = "客户暂别的疗愈师")
public class CustomerMassagistBlock extends BaseEntity {

    @ApiModelProperty("客户id")
    private Long customerId;

    @ApiModelProperty("疗愈师id")
    private Long massagistId;

    @ApiModelProperty("来源 1=客户本人 2=门店后台代设")
    private Integer source;

    @ApiModelProperty("操作人：后台为管理员账号；客户本人为空")
    private String createBy;

    @TableField(exist = false)
    @ApiModelProperty("疗愈师")
    private Massagist massagist;

    @TableField(exist = false)
    @ApiModelProperty("客户昵称（后台按手机号查询时返回）")
    private String customerNickname;
}
