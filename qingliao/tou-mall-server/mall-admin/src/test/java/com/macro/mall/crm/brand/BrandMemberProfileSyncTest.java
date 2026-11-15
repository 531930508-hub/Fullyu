package com.macro.mall.crm.brand;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.macro.mall.entity.Customer;
import com.macro.mall.mapper.CustomerMapper;
import com.macro.mall.service.impl.OssServiceImpl;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

/**
 * 会员资料统一：CRM 版本号优先、手机号不参与、CRM 不可用时不阻塞本地。
 */
class BrandMemberProfileSyncTest {
    private final ObjectMapper objectMapper = new ObjectMapper();

    private BrandMemberClient client;
    private CustomerMapper customerMapper;
    private OssServiceImpl ossService;
    private BrandMemberProfileSync sync;

    @BeforeEach
    void setUp() {
        client = mock(BrandMemberClient.class);
        customerMapper = mock(CustomerMapper.class);
        ossService = mock(OssServiceImpl.class);
        // 不关心 URL 拼接细节：原样透出，方便断言参数
        lenient().when(ossService.publicUrl(anyString())).thenAnswer(call -> call.getArgument(0));
        sync = new BrandMemberProfileSync(client, customerMapper, ossService);
    }

    private Customer customer(Long id) {
        Customer customer = new Customer();
        customer.setId(id);
        customer.setPhone("13800000000");
        customer.setNickname("旧名字");
        customer.setGender(1);
        customer.setBirthday(LocalDate.of(1990, 1, 1));
        customer.setAvatar("avatars/2026/a.jpg");
        customer.setCrmProfileVersion(3L);
        return customer;
    }

    private JsonNode node(String json) throws Exception {
        return objectMapper.readTree(json);
    }

    @Test
    void pullOverwritesLocalProfileWhenCrmVersionIsNewer() throws Exception {
        when(client.isActive()).thenReturn(true);
        when(client.me("7")).thenReturn(node("{\"member\":{\"profileVersion\":4,\"profile\":{"
                + "\"nickname\":\"林晚\",\"avatarUrl\":\"https://img.test/a.png\","
                + "\"gender\":2,\"birthday\":\"1995-06-18\"}}}"));

        Customer customer = customer(7L);
        sync.refreshQuietly(customer);

        assertEquals("林晚", customer.getNickname());
        assertEquals("https://img.test/a.png", customer.getAvatar());
        assertEquals(2, customer.getGender());
        assertEquals(LocalDate.of(1995, 6, 18), customer.getBirthday());
        assertEquals(4L, customer.getCrmProfileVersion());
        assertNotNull(customer.getCrmProfileSyncedAt());
        // 手机号是身份键，拉资料不能改
        assertEquals("13800000000", customer.getPhone());
        verify(customerMapper).updateById(customer);
        verify(client, never()).updateProfile(anyString(), anyLong(), any(), any(), any(), any());
    }

    @Test
    void keepsLocalWhenCrmVersionIsOlder() throws Exception {
        when(client.isActive()).thenReturn(true);
        when(client.me("7")).thenReturn(node("{\"member\":{\"profileVersion\":2,\"profile\":{"
                + "\"nickname\":\"CRM 旧名\"}}}"));

        Customer customer = customer(7L);
        sync.refreshQuietly(customer);

        assertEquals("旧名字", customer.getNickname());
        assertEquals(3L, customer.getCrmProfileVersion());
        verifyNoInteractions(customerMapper);
    }

    @Test
    void missingCrmMemberIsSilent() {
        when(client.isActive()).thenReturn(true);
        when(client.me("7")).thenThrow(new BrandMemberException("MEMBER_NOT_FOUND", "同步中", 404));

        Customer customer = customer(7L);
        sync.refreshQuietly(customer);

        assertEquals("旧名字", customer.getNickname());
        verifyNoInteractions(customerMapper);
    }

    @Test
    void crmDowntimeDoesNotBlockLocalProfile() {
        when(client.isActive()).thenReturn(true);
        when(client.me("7")).thenThrow(new BrandMemberException("UNAVAILABLE", "会员中心暂时不可用", 503));

        Customer customer = customer(7L);
        sync.refreshQuietly(customer);

        assertEquals("旧名字", customer.getNickname());
        verifyNoInteractions(customerMapper);
    }

    @Test
    void pushSendsStableAvatarUrlAndAdoptsCrmVersion() throws Exception {
        when(client.isActive()).thenReturn(true);
        when(ossService.publicUrl("avatars/2026/a.jpg"))
                .thenReturn("https://fullytherapy.oss-cn-hangzhou.aliyuncs.com/avatars/2026/a.jpg");
        when(client.updateProfile("7", 3L, "旧名字",
                "https://fullytherapy.oss-cn-hangzhou.aliyuncs.com/avatars/2026/a.jpg", 1, "1990-01-01"))
                .thenReturn(node("{\"member\":{\"profileVersion\":5,\"profile\":{\"nickname\":\"旧名字\"}}}"));

        Customer customer = customer(7L);
        sync.pushOrThrow(customer);

        assertEquals(5L, customer.getCrmProfileVersion());
        verify(customerMapper).updateById(customer);
    }

    @Test
    void conflictPullsCrmProfileBackAndTellsCustomerToRefresh() throws Exception {
        when(client.isActive()).thenReturn(true);
        when(client.updateProfile(anyString(), anyLong(), any(), any(), any(), any()))
                .thenThrow(new BrandMemberException("PROFILE_CONFLICT", "资料已在会员中心更新，请刷新后重新修改", 409));
        when(client.me("7")).thenReturn(node("{\"member\":{\"profileVersion\":4,\"profile\":{"
                + "\"nickname\":\"CRM 新名\"}}}"));

        Customer customer = customer(7L);
        BrandMemberException error = assertThrows(BrandMemberException.class,
                () -> sync.pushOrThrow(customer));

        assertEquals(409, error.getStatus());
        // 冲突后本地立刻对齐 CRM，顾客刷新页面看到的就是会员中心的最新资料
        assertEquals("CRM 新名", customer.getNickname());
        assertEquals(4L, customer.getCrmProfileVersion());
    }

    @Test
    void firstPushWhenCrmHasNoProfileYet() throws Exception {
        when(client.isActive()).thenReturn(true);
        when(client.me("7")).thenReturn(node("{\"member\":{\"profileVersion\":0,\"profile\":{}}}"));
        when(client.updateProfile(anyString(), anyLong(), any(), any(), any(), any()))
                .thenReturn(node("{\"member\":{\"profileVersion\":1,\"profile\":{\"nickname\":\"旧名字\"}}}"));

        Customer customer = customer(7L);
        customer.setCrmProfileVersion(null);
        sync.refreshQuietly(customer);

        assertEquals(1L, customer.getCrmProfileVersion());
        verify(client).updateProfile("7", 0L, "旧名字", "avatars/2026/a.jpg", 1, "1990-01-01");
    }

    @Test
    void hookOnlyPushesWhenProfileFieldActuallyChanged() throws Exception {
        when(client.isActive()).thenReturn(true);
        when(client.updateProfile(anyString(), anyLong(), any(), any(), any(), any()))
                .thenReturn(node("{\"member\":{\"profileVersion\":4}}"));

        Customer before = customer(7L);
        Customer onlyOpenId = new Customer();
        onlyOpenId.setId(7L);
        onlyOpenId.setOpenId("wx-open-id");
        sync.afterLocalChange(before, onlyOpenId);
        verify(client, never()).updateProfile(anyString(), anyLong(), any(), any(), any(), any());

        Customer renamed = new Customer();
        renamed.setId(7L);
        renamed.setNickname("新名字");
        sync.afterLocalChange(before, renamed);
        verify(client).updateProfile("7", 3L, "新名字", "avatars/2026/a.jpg", 1, "1990-01-01");
    }

    @Test
    void disabledCrmTouchesNothing() {
        when(client.isActive()).thenReturn(false);

        Customer customer = customer(7L);
        sync.refreshQuietly(customer);
        sync.pushOrThrow(customer);

        verifyNoInteractions(customerMapper);
    }
}