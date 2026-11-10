package com.macro.mall.entity;

import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableName;
import com.fasterxml.jackson.databind.annotation.JsonDeserialize;
import com.fasterxml.jackson.databind.annotation.JsonSerialize;
import com.macro.mall.enums.NormalState;
import com.macro.mall.serializer.ArrayStringDeSerializer;
import com.macro.mall.serializer.ArrayStringSerializer;
import com.macro.mall.serializer.JsonArrayStringDeSerializer;
import com.macro.mall.serializer.JsonArrayStringSerializer;
import io.swagger.annotations.ApiModel;
import io.swagger.annotations.ApiModelProperty;
import lombok.Getter;
import lombok.Setter;

import java.math.BigDecimal;
import java.util.List;

/**
 * 产品表
 *
 * @author ST
 * @date 2025/06/03
 */
@Getter
@Setter
@TableName("s_product")
@ApiModel(value = "Product对象", description = "")
public class Product extends BaseEntity {

    @ApiModelProperty("标题")
    private String title;

    @ApiModelProperty("图标")
    private String icon;

    @ApiModelProperty("类型：0项目，1券")
    private Integer type;

    @ApiModelProperty("价格")
    private BigDecimal amount;

    @ApiModelProperty("原价")
    private BigDecimal originalAmount;

    @ApiModelProperty("状态：0失效，1正常")
    private Integer state = NormalState.EFFECTIVE.getValue();

    @ApiModelProperty("排序")
    private Integer sequence;

    @ApiModelProperty("商品说明")
    @JsonSerialize(using = ArrayStringSerializer.class, nullsUsing = ArrayStringSerializer.class)
    @JsonDeserialize(using = ArrayStringDeSerializer.class)
    private String explainArray;

    @ApiModelProperty("商品内容")
    @JsonSerialize(using = JsonArrayStringSerializer.class, nullsUsing = JsonArrayStringSerializer.class)
    @JsonDeserialize(using = JsonArrayStringDeSerializer.class)
    private String content;

    @ApiModelProperty("备注")
    private String comment;

    @ApiModelProperty("预付券包实际用完后赠会员月数，0不赠，按每笔购买订单一次")
    private Integer rewardMemberMonths = 0;

    @ApiModelProperty("销量")
    private Integer sale = 0;

    private Boolean isMultiBuy;

    @ApiModelProperty("单客户限购")
    private Integer buyLimit = 0;

    @ApiModelProperty("服务项目")
    @TableField(exist = false)
    private List<Project> projectList;

    @ApiModelProperty("券包")
    @TableField(exist = false)
    private List<Coupon> couponList;

    @TableField(exist = false)
    @ApiModelProperty("商品标签")
    private List<ProductTag> productTagList;

    @ApiModelProperty("限购")
    private Integer allLimit = 0;

    @ApiModelProperty("限购状态")
    @TableField(exist = false)
    private Boolean limitState = false;

}
