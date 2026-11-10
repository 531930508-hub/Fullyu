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

/*luxin新增
*
* 请假事由表
* */
@Getter
@Setter
@TableName("s_payout")
@ApiModel(value = "payout对象", description = "门店支出")
public class payout extends BaseEntity{
    private LocalDate dtime;
    private String marks;
    private long shopId;
    private long moneyprice;
    private long adminId;

    @TableField(exist = false)
    private LocalDate monthNumber;

}
