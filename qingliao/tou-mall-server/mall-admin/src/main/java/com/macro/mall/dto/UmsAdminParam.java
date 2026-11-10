package com.macro.mall.dto;

import com.baomidou.mybatisplus.annotation.TableField;
import io.swagger.annotations.ApiModelProperty;
import lombok.Getter;
import lombok.Setter;

import javax.validation.constraints.NotBlank;
import javax.validation.constraints.NotNull;

/**
 * 用户注册参数
 * Created by macro on 2018/4/26.
 */
@Getter
@Setter
public class UmsAdminParam {
    @NotNull(message = "账号不允许为空")
    @ApiModelProperty(value = "账号", required = true)
    private String username;
    @NotBlank(message = "密码不允许为空")
    @ApiModelProperty(value = "密码", required = true)
    private String password;
    @ApiModelProperty(value = "用户头像")
    private String icon;

    @ApiModelProperty(value = "邮箱")
    private String email;
    @ApiModelProperty(value = "姓名")
    @NotBlank(message = "姓名不允许为空")
    private String nickName;
    @ApiModelProperty(value = "备注")
    private String note;

    private String shopIdArr;

    @ApiModelProperty(value = "店铺id")
    @NotNull(message = "店铺不允许为空")
    private Long shopId;

    @ApiModelProperty(value = "多店铺id")
    @TableField(exist = false)
    public int[] shopIdArrOther;
}
