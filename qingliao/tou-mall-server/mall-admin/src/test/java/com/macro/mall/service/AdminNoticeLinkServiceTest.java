package com.macro.mall.service;

import com.macro.mall.bo.AdminNoticeJob;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import java.net.URI;
import java.util.HashMap;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

class AdminNoticeLinkServiceTest {

    AdminNoticeLinkService service(String secret, long ttlHours) {
        AdminNoticeLinkService service = new AdminNoticeLinkService();
        ReflectionTestUtils.setField(service, "adminWebUrl", "https://mall-test.fullyu.cn/mall-admin/");
        ReflectionTestUtils.setField(service, "linkSecret", secret);
        ReflectionTestUtils.setField(service, "linkTtlHours", ttlHours);
        return service;
    }

    AdminNoticeJob job() {
        AdminNoticeJob job = new AdminNoticeJob();
        job.setAdminId(7L);
        job.setApprovalId(100L);
        job.setDetailId(200L);
        return job;
    }

    Map<String, String> query(String url) {
        Map<String, String> map = new HashMap<>();
        for (String pair : URI.create(url).getQuery().split("&")) {
            String[] kv = pair.split("=", 2);
            map.put(kv[0], kv[1]);
        }
        return map;
    }

    @Test void buildsSignedPageUrlAndVerifies() {
        AdminNoticeLinkService service = service("synthetic-link-secret", 168);
        String url = service.approvalUrl(job());
        assertNotNull(url);
        // 深链页在管理端子路径下；站点根会被前台 H5 兜底成首页
        assertTrue(url.startsWith("https://mall-test.fullyu.cn/mall-admin/static/notice-approval.html?"));
        Map<String, String> q = query(url);
        assertEquals("100", q.get("approvalId"));
        assertEquals("200", q.get("detailId"));
        assertEquals("7", q.get("adminId"));
        assertTrue(service.verify(100L, 200L, 7L, Long.valueOf(q.get("exp")), q.get("sig")));
    }

    @Test void fallsBackWhenNotConfiguredOrMissingDetail() {
        assertNull(service("", 168).approvalUrl(job()));
        assertNull(service("synthetic-link-secret", 168).approvalUrl(null));
        AdminNoticeJob noDetail = job();
        noDetail.setDetailId(null);
        assertNull(service("synthetic-link-secret", 168).approvalUrl(noDetail));
        assertFalse(service("synthetic-link-secret", 168).verify(100L, null, 7L, 1L, "sig"));
    }
}