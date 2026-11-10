package com.macro.mall.crm;

import com.macro.mall.common.exception.BusinessException;
import com.macro.mall.entity.Customer;
import com.macro.mall.mapper.CustomerWxMapper;
import com.macro.mall.service.IntegrationService;
import org.junit.jupiter.api.Assumptions;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.Arrays;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * 与真实 CRM 的联调冒烟（默认跳过）。
 *
 * <p>只在本机或测试环境显式设置环境变量后运行：
 * {@code CRM_SMOKE_BASE_URL}、{@code CRM_SMOKE_KEY_ID}、{@code CRM_SMOKE_SECRET}。
 * 每轮用时间戳生成唯一本地用户 id 与手机号，可在同一个测试库反复执行。</p>
 */
class CrmSyncLiveSmokeTest {
    private static final String BASE_URL = System.getenv("CRM_SMOKE_BASE_URL");
    private static final String KEY_ID = System.getenv("CRM_SMOKE_KEY_ID");
    private static final String SECRET = System.getenv("CRM_SMOKE_SECRET");

    @Test
    void runsIdentityAndPointsLifecycleAgainstRealCrm() {
        Assumptions.assumeTrue(BASE_URL != null && KEY_ID != null && SECRET != null,
                "未设置 CRM_SMOKE_BASE_URL / KEY_ID / SECRET，跳过真实 CRM 冒烟");

        String run = String.format("%08d", Math.abs(System.nanoTime()) % 100_000_000L);
        String phoneTag = run.substring(0, 6);

        CrmClient client = newClient();
        CrmSyncService sync = newSyncService(client);

        String unsyncedId = "90" + run;
        assertNull(client.getByLocalUser(unsyncedId), "未同步的本地用户不应有会员");

        Customer welcome = customer("91" + run + "1", "139" + phoneTag + "01", "阿青");
        assertEquals(66L, sync.ensureIdentity(welcome), "新客应到账 66 分");
        assertEquals(66L, sync.ensureIdentity(welcome), "重复登录不得重复发放");
        assertEquals(66L, client.getByLocalUser(welcome.getId().toString()).getBalance());

        Customer migrated = customer("91" + run + "2", "139" + phoneTag + "02", "阿岚");
        // 迁移发生在身份导入之后；先解析建档案，不经过新客奖励
        client.resolve(sync.identityOf(migrated));
        assertEquals(300L, sync.migrateBalance(migrated, 300L));
        assertEquals(300L, sync.migrateBalance(migrated, 300L), "历史积分迁移须按 ref 幂等");
        assertEquals(300L, client.getByLocalUser(migrated.getId().toString()).getBalance());

        Customer importedWithBalance = customer("91" + run + "3", "139" + phoneTag + "03", "阿禾");
        Customer importedEmpty = customer("91" + run + "4", "139" + phoneTag + "04", "阿木");
        IntegrationService integration = (IntegrationService) ReflectionTestUtils.getField(sync, "integrationService");
        when(integration.getLocalIntegrationByCustomerId(importedWithBalance.getId())).thenReturn(120L);
        when(integration.getLocalIntegrationByCustomerId(importedEmpty.getId())).thenReturn(0L);
        CrmImportResult result = sync.importBatch(Arrays.asList(importedWithBalance, importedEmpty), true);
        assertEquals(2, result.getCreated());
        assertEquals(1, result.getMigratedMembers());
        assertEquals(120L, result.getMigratedPoints());
        assertTrue(result.getFailed().isEmpty());
        assertEquals(120L, client.getByLocalUser(importedWithBalance.getId().toString()).getBalance());

        // 扣减 / 返还走真实 CRM：同一 ref 幂等、余额不足 422、返还后可回到原余额
        Customer spender = customer("91" + run + "7", "139" + phoneTag + "07", "阿扣");
        assertEquals(66L, sync.ensureIdentity(spender));
        assertEquals(56L, sync.consume(spender, 10L, "联调扣减", "smoke-deduct:" + run));
        assertEquals(56L, sync.consume(spender, 10L, "联调扣减", "smoke-deduct:" + run), "重复 ref 不得重复扣减");
        BusinessException insufficient = assertThrows(BusinessException.class,
                () -> sync.consume(spender, 1000L, "联调超扣", "smoke-over:" + run));
        assertEquals(422, insufficient.getStatus(), "余额不足必须是 422 业务拒绝，不是 503");
        assertEquals(56L, client.getByLocalUser(spender.getId().toString()).getBalance());
        assertEquals(66L, sync.earn(spender, 10L, "联调返还", "smoke-revoke:" + run));
        assertEquals(66L, sync.earn(spender, 10L, "联调返还", "smoke-revoke:" + run), "重复 ref 不得重复返还");

        Customer owner = customer("91" + run + "5", "139" + phoneTag + "05", "阿原");
        CrmMember ownerMember = client.resolve(sync.identityOf(owner));
        Customer samePhone = customer("91" + run + "6", "139" + phoneTag + "05", "阿同");
        CrmMember bound = client.resolve(sync.identityOf(samePhone));
        assertEquals(ownerMember.getMemberId(), bound.getMemberId(), "同手机号应绑定同一会员");
        assertFalse(bound.isCreated(), "同手机号不应新建会员");

        // unionId 指向 A、手机号指向 B：拒绝自动合并，返回 409
        CrmIdentity unionOwner = new CrmIdentity();
        unionOwner.setLocalUserId("92" + run + "1");
        unionOwner.setUnionId("union-" + run);
        unionOwner.setPhone("139" + phoneTag + "11");
        client.resolve(unionOwner);
        Customer phoneOnly = customer("92" + run + "2", "139" + phoneTag + "12", "阿单");
        client.resolve(sync.identityOf(phoneOnly));
        CrmIdentity clash = new CrmIdentity();
        clash.setLocalUserId("92" + run + "3");
        clash.setUnionId("union-" + run);
        clash.setPhone("139" + phoneTag + "12");
        BusinessException conflict = assertThrows(BusinessException.class, () -> client.resolve(clash));
        assertEquals(409, conflict.getStatus(), "微信身份与手机号分属两个会员时必须人工合并");
    }

    private static CrmClient newClient() {
        CrmProperties properties = new CrmProperties();
        ReflectionTestUtils.setField(properties, "enabled", "1");
        ReflectionTestUtils.setField(properties, "baseUrl", BASE_URL);
        ReflectionTestUtils.setField(properties, "keyId", KEY_ID);
        ReflectionTestUtils.setField(properties, "secret", SECRET);
        ReflectionTestUtils.setField(properties, "timeoutMs", 3000);
        properties.init();

        CrmClient client = new CrmClient();
        ReflectionTestUtils.setField(client, "properties", properties);
        return client;
    }

    private static CrmSyncService newSyncService(CrmClient client) {
        CrmSyncService sync = new CrmSyncService();
        ReflectionTestUtils.setField(sync, "crmClient", client);
        ReflectionTestUtils.setField(sync, "customerWxMapper", mock(CustomerWxMapper.class));
        ReflectionTestUtils.setField(sync, "integrationService", mock(IntegrationService.class));
        return sync;
    }

    private static Customer customer(String localUserId, String phone, String nickname) {
        Customer customer = new Customer();
        customer.setId(Long.valueOf(localUserId));
        customer.setPhone(phone);
        customer.setNickname(nickname);
        return customer;
    }
}
