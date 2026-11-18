package com.macro.mall.mapper;

/**
 * 通知里的展示名口径，统一放在这里，避免模板消息和审批链接页各写一套取值。
 * 申请人只取账号上的员工姓名（后台昵称），不取疗愈师档案姓名。
 */
public final class AdminNoticeDisplayName {
    // 被通知人自己的名字（如测试消息）：员工档案真实姓名 → 档案姓名 → 后台昵称 → 登录账号（手机号）。
    public static final String SQL_EMPLOYEE_NAME =
        "COALESCE((SELECT NULLIF(m.real_name,'') FROM s_massagist m WHERE m.ums_admin_id=#{adminId} ORDER BY m.id LIMIT 1)," +
        "(SELECT NULLIF(m.name,'') FROM s_massagist m WHERE m.ums_admin_id=#{adminId} ORDER BY m.id LIMIT 1),NULLIF(u.nick_name,''),u.username)";
    // 申请人：取审批发起账号上的员工姓名（nick_name），没有再用登录账号
    public static final String SQL_APPLICANT =
        "COALESCE(NULLIF(u.nick_name,''),u.username)";

    private AdminNoticeDisplayName() {
    }
}