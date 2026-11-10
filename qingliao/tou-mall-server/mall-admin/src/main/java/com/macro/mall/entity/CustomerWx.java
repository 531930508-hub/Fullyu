package com.macro.mall.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import io.swagger.annotations.ApiModel;
import io.swagger.annotations.ApiModelProperty;
import lombok.Getter;
import lombok.Setter;

import java.time.LocalDateTime;

/**
 * 微信用户
 *
 * @author
 * @date 2025/07/23
 */
@Getter
@Setter
@TableName("c_customer_wx")
@ApiModel(value = "CustomerWx对象", description = "微信用户")
public class CustomerWx {

    @TableId(type = IdType.AUTO)
    @ApiModelProperty(hidden = true)
    private Integer id;

    private String unionId;

    private String maOpenId;

    private String mpOpenId;

    private LocalDateTime maCreateTime;

    private LocalDateTime mpCreateTime;


}
