package com.macro.mall.service;

import com.macro.mall.bo.AdminNoticeJob;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

/**
 * 生成/校验微信模板消息里的审批深链。
 * 链接形如 https://web/mall-admin/static/notice-approval.html?approvalId=..&detailId=..&adminId=..&exp=..&sig=..
 * 未配置密钥或 web 地址时返回 null，调用方回退到待办中心首页。
 */
@Service
public class AdminNoticeLinkService {
    @Value("${fullyu.notice.admin-web-url:}") String adminWebUrl;
    @Value("${fullyu.notice.link-secret:}") String linkSecret;
    @Value("${fullyu.notice.link-ttl-hours:168}") long linkTtlHours;

    public String approvalUrl(AdminNoticeJob job) {
        return job == null ? null : approvalUrl(job.getApprovalId(), job.getDetailId(), job.getAdminId());
    }

    public String approvalUrl(Long approvalId, Long detailId, Long adminId) {
        if (approvalId == null || approvalId <= 0 || detailId == null || detailId <= 0 || adminId == null) return null;
        String base = trim(adminWebUrl);
        String secret = trim(linkSecret);
        if (base.isEmpty() || secret.isEmpty()) return null;
        if (!base.startsWith("https://") && !base.startsWith("http://")) return null;
        // 深链页随管理端一起发布在 <admin-web-url>/static/ 下；若指到站点根，会被前台 H5 的
        // try_files 兜底成会员首页（200 但不是审批页），所以必须带完整子路径。
        while (base.endsWith("/")) base = base.substring(0, base.length() - 1);
        if (!java.util.regex.Pattern.compile("^https?://[^/]+").matcher(base).find()) return null;
        base = base + "/static/notice-approval.html";
        long exp = nowSeconds() + Math.max(1, linkTtlHours) * 3600;
        String sig = AdminNoticeLinkSigner.sign(secret, approvalId, detailId, adminId, exp);
        return base + "?approvalId=" + approvalId
            + "&detailId=" + detailId + "&adminId=" + adminId
            + "&exp=" + exp + "&sig=" + sig;
    }

    public boolean verify(Long approvalId, Long detailId, Long adminId, Long exp, String sig) {
        if (approvalId == null || detailId == null || adminId == null || exp == null) return false;
        return AdminNoticeLinkSigner.verify(trim(linkSecret), approvalId, detailId, adminId, exp, sig, nowSeconds());
    }

    long nowSeconds() {
        return System.currentTimeMillis() / 1000;
    }

    private static String trim(String value) {
        return value == null ? "" : value.trim();
    }
}