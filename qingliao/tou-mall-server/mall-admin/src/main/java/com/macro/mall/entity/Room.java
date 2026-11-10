package com.macro.mall.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import java.io.Serializable;
import java.time.LocalDateTime;
import io.swagger.annotations.ApiModel;
import io.swagger.annotations.ApiModelProperty;
import lombok.Getter;
import lombok.Setter;

/**
 * 
 *
 * @author zkl
 * @date 2025/05/30
 */
@Getter
@Setter
@TableName("s_room")
@ApiModel(value = "Room对象", description = "房间")
public class Room  extends BaseEntity{


    @ApiModelProperty("房间名字")
    private String name;

    @ApiModelProperty("所属门店")
    private Long shopId;

    @ApiModelProperty("序号")
    private String serialNumber;

    @ApiModelProperty("类型")
    private Integer type;

    @ApiModelProperty("状态：0不可用、1可用")
    private Integer status;



}
