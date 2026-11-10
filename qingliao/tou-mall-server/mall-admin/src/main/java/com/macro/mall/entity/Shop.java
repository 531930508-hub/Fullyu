package com.macro.mall.entity;

import cn.hutool.db.meta.Table;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableName;
import com.fasterxml.jackson.databind.annotation.JsonDeserialize;
import com.fasterxml.jackson.databind.annotation.JsonSerialize;
import com.macro.mall.serializer.QiniuUrlDeSerializer;
import com.macro.mall.serializer.QiniuUrlSerializer;
import io.swagger.annotations.ApiModel;
import io.swagger.annotations.ApiModelProperty;
import lombok.Getter;
import lombok.Setter;

import java.math.BigDecimal;

/**
 * @author zkl
 * @date 2025/05/30
 */
@Getter
@Setter
@TableName("s_shop")
@ApiModel(value = "Shop对象", description = "门店")
public class Shop extends BaseEntity {


    @ApiModelProperty("门店名称")
    private String name;

    @ApiModelProperty("门店地址")
    private String address;

    @ApiModelProperty("门店封面")
    @JsonSerialize(using = QiniuUrlSerializer.class)
    @JsonDeserialize(using = QiniuUrlDeSerializer.class)
    private String coverImageUrls;

    @ApiModelProperty("经度")
    private BigDecimal longitude;

    @ApiModelProperty("维度")
    private BigDecimal latitude;

    @ApiModelProperty("状态：0不可用、1可用")
    private Integer status;

    @ApiModelProperty("上班时间HH:mm")
    private String clockInTime;

    @ApiModelProperty("下班时间HH:mm")
    private String clockOutTime;

    @ApiModelProperty("预约间隔(分钟)")
    private Integer intervalMinute;

    @ApiModelProperty("门店地址")
    private String shortAddress;

    /***2026-01-01 luxin start*/
    @ApiModelProperty("商户号")
    private String BusSysId;
    @ApiModelProperty("产品号")
    private String BusProductId;
    @ApiModelProperty("公钥")
    private String BusPublicKey;
    @ApiModelProperty("私钥")
    private String BusPrivateKey;
    @ApiModelProperty("设备编号")
    private String PrintSn;
    @ApiModelProperty("设备KEY")
    private String PrintPkey;
    @ApiModelProperty("账号")
    private String PrintName;
    @ApiModelProperty("备注：(小票内展示)")
    private String PrintMarks;

    @ApiModelProperty("推荐状态：1是、0否")
    private Integer shopRecommend;

    @TableField(exist = false)
    private double distanceInMeters;

    private String mobile;

    @ApiModelProperty("接待工时占排班在岗时长的上限百分比，20 表示 20%")
    private Integer receptionCapPercent;

}
