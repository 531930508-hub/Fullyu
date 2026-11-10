package com.macro.mall.entity;

import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableName;
import io.swagger.annotations.ApiModel;
import io.swagger.annotations.ApiModelProperty;
import lombok.Getter;
import lombok.Setter;

import javax.validation.constraints.NotNull;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.List;

/*luxin新增
*
* 请假事由表
* */
@Getter
@Setter
@TableName("s_massagist_leave")
@ApiModel(value = "MassagistLeave对象", description = "技师请假表")
public class MassagistLeave extends BaseEntity{
    @ApiModelProperty("开始日期")
    private LocalDate startDate;
    @ApiModelProperty("结束日期")
    private LocalDate endDate;
    @ApiModelProperty("开始时间")
    private LocalTime startTime;
    @ApiModelProperty("结束时间")
    private LocalTime endTime;
    @ApiModelProperty("请假事由")
    private String marks;

    @ApiModelProperty("审批表id")
    private long approvalId;

    @ApiModelProperty("")
    private LocalDateTime startDatetime;

    @ApiModelProperty("")
    private LocalDateTime  endDatetime;

    @ApiModelProperty("")
    private long  massagistId;




    @NotNull(message = "门店id不能为空")
    @ApiModelProperty("门店id")
    @TableField(exist = false)
    private Long shopId;

    @NotNull(message = "审批申请人不能为空")
    @ApiModelProperty("创建人（审批申请人）")
    private Long createUser;

    @ApiModelProperty("多个日期")
    private String datesStr;
    @TableField(exist = false)
    private String[] dates;

}
