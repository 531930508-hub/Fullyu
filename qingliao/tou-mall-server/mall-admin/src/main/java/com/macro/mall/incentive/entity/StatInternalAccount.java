package com.macro.mall.incentive.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import com.macro.mall.entity.BaseEntity;
import lombok.Getter;
import lombok.Setter;

/**
 * 内部测试/员工账号手机号，统计口径中排除。本期只建表，不做维护页面。
 */
@Getter
@Setter
@TableName("s_stat_internal_account")
public class StatInternalAccount extends BaseEntity {

    private String phone;

    private Integer enabled;

    private String remark;
}
