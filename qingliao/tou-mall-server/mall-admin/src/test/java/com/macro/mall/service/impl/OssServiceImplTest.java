package com.macro.mall.service.impl;

import com.aliyun.oss.OSS;
import com.macro.mall.utils.RedisUtil;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import java.net.URL;
import java.util.Date;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * OSS key → 外发地址的口径。
 *
 * <p>原来的版本是 {@code @SpringBootTest} + 本机 Windows 图片路径 + 真 OSS 账号：
 * 没配置 aliyun.oss.accessKeyId 时 OssConfig 直接抛 InvalidCredentialsException，
 * 整个 Spring 上下文起不来（8.133 实测），等于一条永远红的"伪用例"，还顺带把
 * 864 条的全量构建卡成 BUILD FAILURE。这里改成纯单测：不启上下文、不联网、不需要凭据。</p>
 */
class OssServiceImplTest {

    private static final String BUCKET = "ql-test-bucket";

    private OssServiceImpl service;
    private OSS ossClient;
    private RedisUtil redisUtil;

    @BeforeEach
    void setUp() {
        service = new OssServiceImpl();
        ossClient = org.mockito.Mockito.mock(OSS.class);
        redisUtil = org.mockito.Mockito.mock(RedisUtil.class);
        ReflectionTestUtils.setField(service, "ossClient", ossClient);
        ReflectionTestUtils.setField(service, "redisUtil", redisUtil);
        ReflectionTestUtils.setField(service, "OSS_BUCKET_NAME", BUCKET);
        ReflectionTestUtils.setField(service, "ALIYUN_OSS_ENDPOINT", "https://oss-cn-hangzhou.aliyuncs.com");
        ReflectionTestUtils.setField(service, "OSS_DIR_PREFIX", "mall/");
    }

    @Test
    void publicUrlIsStableAndUnsigned() {
        // 桶是公共读：外发地址不能带签名（30 天预签名存进 CRM 会失效）
        assertEquals("https://" + BUCKET + ".oss-cn-hangzhou.aliyuncs.com/mall/a.png",
                service.publicUrl("mall/a.png"));
        // 已经带协议头的原样返回；空值返回 null
        assertEquals("https://cdn.example.com/x.png", service.publicUrl("https://cdn.example.com/x.png"));
        assertNull(service.publicUrl(" "));
    }

    @Test
    void isManagedKeyOnlyAcceptsRelativeKeys() {
        assertTrue(service.isManagedKey("mall/20261122/a.png"));
        assertFalse(service.isManagedKey("https://evil.example.com/a.png"));
        assertFalse(service.isManagedKey("mall/../../etc/passwd"));
        assertFalse(service.isManagedKey(""));
        assertFalse(service.isManagedKey(null));
    }

    @Test
    void getFinalUrlFallsBackToPresignedUrlAndCachesIt() throws Exception {
        when(redisUtil.getString("file:" + BUCKET + "/mall/a.png")).thenReturn(null);
        URL presigned = new URL("https://" + BUCKET + ".oss-cn-hangzhou.aliyuncs.com/mall/a.png?Expires=1730000000");
        when(ossClient.generatePresignedUrl(eq(BUCKET), eq("mall/a.png"), any(Date.class))).thenReturn(presigned);

        assertEquals(presigned.toString(), service.getFinalUrl("mall/a.png"));
        verify(redisUtil).setStringDay("file:" + BUCKET + "/mall/a.png", presigned.toString(), 30);
    }

    @Test
    void getFinalUrlUsesCacheWithoutTouchingOss() {
        when(redisUtil.getString("file:" + BUCKET + "/mall/a.png")).thenReturn("https://cached/x.png");

        assertEquals("https://cached/x.png", service.getFinalUrl("mall/a.png"));
        verify(ossClient, never()).generatePresignedUrl(anyString(), anyString(), any(Date.class));
    }
}