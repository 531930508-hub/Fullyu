package com.macro.mall.mapper;

/**
 * 通知里的“提交人/员工”展示名口径：员工档案真实姓名 → 档案姓名 → 后台昵称 → 登录账号（手机号）。
 * 统一放在这里，避免模板消息和审批链接页各写一套取值。
 */
public final class AdminNoticeDisplayName {
    public static final String SQL_EMPLOYEE_NAME =
        "COALESCE((SELECT NULLIF(m.real_name,'') FROM s_massagist m WHERE m.ums_admin_id=#{adminId} ORDER BY m.id LIMIT 1)," +
        "(SELECT NULLIF(m.name,'') FROM s_massagist m WHERE m.ums_admin_id=#{adminId} ORDER BY m.id LIMIT 1),NULLIF(u.nick_name,''),u.username)";
    public static final String SQL_APPLICANT =
        "COALESCE((SELECT NULLIF(m.real_name,'') FROM s_massagist m WHERE m.ums_admin_id=a.create_user ORDER BY m.id LIMIT 1)," +
        "(SELECT NULLIF(m.name,'') FROM s_massagist m WHERE m.ums_admin_id=a.create_user ORDER BY m.id LIMIT 1),NULLIF(u.nick_name,''),u.username)";

    private AdminNoticeDisplayName() {
    }
}