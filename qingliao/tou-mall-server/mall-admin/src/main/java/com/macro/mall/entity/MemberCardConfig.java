package com.macro.mall.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableName;
import com.fasterxml.jackson.annotation.JsonFormat;
import io.swagger.annotations.ApiModel;
import io.swagger.annotations.ApiModelProperty;
import lombok.Getter;
import lombok.Setter;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * 会员年卡配置。
 *
 * @date 2026/11/07
 */
@Getter
@Setter
@TableName("s_member_card_config")
@ApiModel(value = "MemberCardConfig对象", description = "会员年卡配置")
public class MemberCardConfig extends BaseEntity {

    @ApiModelProperty("卡名称")
    private String cardName;

    @ApiModelProperty("卡类型 month月卡 year年卡 custom自定义")
    private String cardType;

    @ApiModelProperty("价格")
    private BigDecimal price;

    @ApiModelProperty("1推荐")
    private Integer recommend;

    @ApiModelProperty("展示顺序，越大越靠前")
    private Integer sort;

    @ApiModelProperty("回本示例原价（60分钟项目）")
    private BigDecimal basePrice;

    @ApiModelProperty("回本示例时长（分钟）")
    private Integer sampleMinutes;

    @ApiModelProperty("全业务线权益说明")
    private String benefitDesc;

    @ApiModelProperty("购买条款与免责声明")
    private String terms;

    @ApiModelProperty("提前预约折扣率")
    private BigDecimal advanceRate;

    @ApiModelProperty("当日预约折扣率")
    private BigDecimal sameDayRate;

    @ApiModelProperty("有效期天数")
    private Integer validDays;

    @ApiModelProperty("到期提醒天数")
    private Integer renewalRemindDays;

    @ApiModelProperty("购买说明")
    private String purchaseNotice;

    @ApiModelProperty("退款说明")
    private String refundNotice;

    @ApiModelProperty("0停售 1在售")
    private Integer status;

    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    @TableField(value = "update_time", fill = FieldFill.UPDATE)
    @ApiModelProperty(hidden = true)
    private LocalDateTime updateTime;
}
