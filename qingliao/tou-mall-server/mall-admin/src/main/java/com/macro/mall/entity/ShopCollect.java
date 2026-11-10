package com.macro.mall.entity;

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
@TableName("s_shop_collect")
@ApiModel(value = "", description = "")
public class ShopCollect extends BaseEntity {

    @ApiModelProperty("客户id")
    private Long customerId;

    @ApiModelProperty("服务人员id")
    private Long shopId;


}
