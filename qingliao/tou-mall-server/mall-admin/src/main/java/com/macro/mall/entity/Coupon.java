package com.macro.mall.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import com.macro.mall.enums.NormalState;
import io.swagger.annotations.ApiModel;
import io.swagger.annotations.ApiModelProperty;
import lombok.Getter;
import lombok.Setter;

import java.math.BigDecimal;

/**
 * 券
 *
 * @author ST
 * @date 2025/06/03
 */
@Getter
@Setter
@TableName("s_coupon")
@ApiModel(value = "Coupon对象", description = "")
public class Coupon extends BaseEntity {

    @ApiModelProperty("编码")
    private String code;

    @ApiModelProperty("标题")
    private String title;

    @ApiModelProperty("抵扣分钟")
    private Integer minutes;

    @ApiModelProperty("使用类型：0折扣券,1兑换券,2会员卡")
    private Integer useType;

    @ApiModelProperty("使用门槛；0表示无门槛")
    private BigDecimal minPoint;

    @ApiModelProperty("状态：0失效，1正常")
    private Integer state = NormalState.EFFECTIVE.getValue();

    @ApiModelProperty("有效期")
    private Integer validDate;

    @ApiModelProperty("备注")
    private String comment;

    @ApiModelProperty("vip等级")
    private Integer vipLevel;

}
