package com.macro.mall.entity;

import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableName;
import com.macro.mall.enums.NormalState;
import io.swagger.annotations.ApiModel;
import io.swagger.annotations.ApiModelProperty;
import lombok.Getter;
import lombok.Setter;

import java.util.ArrayList;
import java.util.List;

/**
 * @author zkl
 * @date 2025/05/30
 */
@Getter
@Setter
@TableName("s_bed")
@ApiModel(value = "Bed对象", description = "床位")
public class Bed extends BaseEntity {


    @ApiModelProperty("床位名字")
    private String name;

    @ApiModelProperty("所属门店")
    private Long shopId;

    @Deprecated
    @ApiModelProperty("所属房间")
    private Long roomId;

    @ApiModelProperty("序号")
    private String serialNumber;

    /**
     * @see com.macro.mall.enums.BedType
     */
    @ApiModelProperty("属性：1湿区，2干区")
    private Integer type;

    /**
     * @see NormalState
     */
    @ApiModelProperty("状态：0不可用、1可用")
    private Integer status;

    /**
     * 当前是否空闲
     */
    @TableField(exist = false)
    private Integer available;

    @TableField(exist = false)
    private List<OrderDetail> orderDetailList = new ArrayList<>();


}
