package com.macro.mall.entity;

import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableName;
import io.swagger.annotations.ApiModel;
import io.swagger.annotations.ApiModelProperty;
import lombok.Getter;
import lombok.Setter;

import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;

/**
 * 疗愈师排班
 *
 * @author zkl
 * @date 2025/06/05
 */
@Getter
@Setter
@TableName("s_massagist_schedules")
@ApiModel(value = "MassagistSchedules对象", description = "疗愈师排班")
public class MassagistSchedules extends BaseEntity {

    @ApiModelProperty("所属门店")
    private Long shopId;

    @ApiModelProperty("疗愈师id")
    private Long massagistId;

    @ApiModelProperty("疗愈师名称")
    @TableField(exist = false)
    private String massagistName;

    @ApiModelProperty("上班日期")
    private LocalDate day;

    @ApiModelProperty("上班时间")
    private LocalTime startTime;

    @ApiModelProperty("上班时间")
    private LocalTime endTime;
    @ApiModelProperty("目标门店Id")
    private Long targetShopId;
    @ApiModelProperty("排班类型：0正常、1调店")
    private Long schedulesType;

    @ApiModelProperty("排班顺序")//字段已弃用，只用来前台显示
    @Deprecated
    private Integer sequence = 0;

    @TableField(exist = false)
    private List<Long> massagistIdList;

    @TableField(exist = false)
    private List<String> dates;

    @ApiModelProperty("疗愈师所属门店")
    @TableField(exist = false)
    private Long massagistShopId;

    @TableField(exist = false)
    private String projectArr;

}
