package com.macro.mall.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import io.swagger.annotations.ApiModel;
import io.swagger.annotations.ApiModelProperty;
import lombok.Getter;
import lombok.Setter;

/**
 * 小票打印记录
 *
 * @author zkl
 * @date 2025/07/02
 */
@Getter
@Setter
@TableName("s_order_print_record")
@ApiModel(value = "OrderPrintRecord对象", description = "小票打印记录")
public class OrderPrintRecord extends BaseEntity {

    @ApiModelProperty("订单id")
    private Long orderId;

    @ApiModelProperty("打印内容")
    private String content;

    private Long createUser;

    private Long shopId;
}