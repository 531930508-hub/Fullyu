package com.macro.mall.dto;

import io.swagger.annotations.ApiModel;
import io.swagger.annotations.ApiModelProperty;
import lombok.Getter;
import lombok.Setter;

import java.util.Objects;

/**
 * 审批节点的审批对象：指定人，或某个岗位（身份）下的本店/全部门店人员。
 *
 * @author Full愈
 * @date 2026/11/09
 */
@Getter
@Setter
@ApiModel(value = "ApprovalFlowTarget", description = "审批对象")
public class ApprovalFlowTarget {

    public static final String TYPE_USER = "USER";
    public static final String TYPE_IDENTITY = "IDENTITY";

    @ApiModelProperty("USER 指定人 / IDENTITY 岗位")
    private String type;

    @ApiModelProperty("指定人后台账号id")
    private Long adminId;

    @ApiModelProperty("岗位身份编码：SHOP_MANAGER / TRAINER")
    private String code;

    @ApiModelProperty("岗位范围：SHOP 本店 / ALL 全部门店")
    private String scope;

    public boolean isUser() {
        return TYPE_USER.equalsIgnoreCase(type);
    }

    public boolean isIdentity() {
        return TYPE_IDENTITY.equalsIgnoreCase(type);
    }

    public String key() {
        if (isUser()) return TYPE_USER + ":" + adminId;
        return TYPE_IDENTITY + ":" + code + ":" + scope;
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof ApprovalFlowTarget)) return false;
        return Objects.equals(key(), ((ApprovalFlowTarget) o).key());
    }

    @Override
    public int hashCode() {
        return Objects.hash(key());
    }
}
