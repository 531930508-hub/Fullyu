package com.macro.mall.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import io.swagger.annotations.ApiModel;
import io.swagger.annotations.ApiModelProperty;
import lombok.Getter;
import lombok.Setter;

/**
 * 疗愈师身份（多选）：店长、内训师等。
 *
 * @author Full愈
 * @date 2026/11/09
 */
@Getter
@Setter
@TableName("f_massagist_identity")
@ApiModel(value = "MassagistIdentity对象", description = "疗愈师身份")
public class MassagistIdentity extends BaseEntity {

    @ApiModelProperty("疗愈师id")
    private Long massagistId;

    @ApiModelProperty("身份编码")
    private String code;

    @ApiModelProperty("操作人后台账号id")
    private Long createUser;
}
