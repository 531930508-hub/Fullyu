package com.macro.mall.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import io.swagger.annotations.ApiModel;
import lombok.Getter;
import lombok.Setter;

/**
 * 操作记录
 *
 * @author ST
 * @date 2025/07/03
 */
@Getter
@Setter
@TableName("t_controller_log")
@ApiModel(value = "ControllerLog对象", description = "")
public class ControllerLog extends BaseEntity {

    private String title;

    private String params;

    private String source;

    private Long createUser;

}
