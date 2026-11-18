package com.macro.mall.service;

import com.macro.mall.mapper.AdminNoticeBindingMapper;
import me.chanjar.weixin.common.bean.oauth2.WxOAuth2AccessToken;
import me.chanjar.weixin.common.service.WxOAuth2Service;
import me.chanjar.weixin.mp.api.WxMpService;
import me.chanjar.weixin.mp.api.WxMpUserService;
import me.chanjar.weixin.mp.bean.result.WxMpUser;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.*;
import java.util.*;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class AdminNoticeOAuthServiceTest {
    AdminNoticeOAuthService service;
    AdminNoticeBindingMapper mapper;
    WxMpService wx;
    WxOAuth2Service oauth;
    WxMpUserService users;
    final LocalDateTime now=LocalDateTime.of(2026,11,12,9,30);
    final String state="abcdefghijklmnopqrstuvwxyz123456";

    void setup(){
        service=new AdminNoticeOAuthService();
        mapper=mock(AdminNoticeBindingMapper.class);
        wx=mock(WxMpService.class);
        oauth=mock(WxOAuth2Service.class);
        users=mock(WxMpUserService.class);
        ReflectionTestUtils.setField(service,"mapper",mapper);
        ReflectionTestUtils.setField(service,"wxService",wx);
        ReflectionTestUtils.setField(service,"enabled",true);
        ReflectionTestUtils.setField(service,"appId","synthetic-app");
        ReflectionTestUtils.setField(service,"callbackUrl","https://test-cityretreat.fullyu.cn/api/admin/open/admin-notice/oauth/callback");
        ReflectionTestUtils.setField(service,"clock",Clock.fixed(now.atZone(ZoneId.of("Asia/Shanghai")).toInstant(),ZoneId.of("Asia/Shanghai")));
        when(wx.switchover(anyString())).thenReturn(true);
        when(wx.getOAuth2Service()).thenReturn(oauth);
        when(wx.getUserService()).thenReturn(users);
        when(mapper.activeAdmin(7L)).thenReturn(1);
        when(mapper.insertChallenge(anyString(),anyLong(),anyString(),any())).thenReturn(1);
        lenient().when(mapper.bindingByOpenId(anyString(),anyString())).thenReturn(null);
    }

    Map<String,Object> challenge(){
        Map<String,Object> row=new HashMap<>();
        row.put("adminId",7L);row.put("appId","synthetic-app");
        row.put("expiresAt",now.plusMinutes(5));row.put("consumedAt",null);
        return row;
    }

    void stubSuccess() throws Exception {
        when(mapper.lockChallenge(AdminNoticeOAuthService.digest(state))).thenReturn(challenge());
        WxOAuth2AccessToken token=new WxOAuth2AccessToken();
        token.setOpenId("synthetic-open-id");
        when(oauth.getAccessToken("code-1")).thenReturn(token);
        WxMpUser user=new WxMpUser();user.setSubscribe(true);user.setOpenId("synthetic-open-id");
        when(users.userInfo("synthetic-open-id",null)).thenReturn(user);
        when(mapper.consume(AdminNoticeOAuthService.digest(state))).thenReturn(1);
        when(mapper.audit(7L,"OAUTH_BOUND")).thenReturn(1);
        when(mapper.insertOAuthBinding(eq(7L),eq("synthetic-app"),eq("synthetic-open-id"),anyInt())).thenReturn(1);
    }

    @Test void authorizeNeedsCallbackAndStoresOnlyHash(){
        setup();ReflectionTestUtils.setField(service,"callbackUrl","");
        assertThrows(RuntimeException.class,()->service.authorize(7L));
        ReflectionTestUtils.setField(service,"callbackUrl","https://test-cityretreat.fullyu.cn/api/admin/open/admin-notice/oauth/callback");
        when(oauth.buildAuthorizationUrl(anyString(),anyString(),anyString())).thenReturn("https://open.weixin.qq.com/connect/oauth2/authorize?appid=synthetic-app");
        Map<String,Object> result=service.authorize(7L);
        assertTrue(result.get("url").toString().startsWith("https://open.weixin.qq.com/"));
        assertTrue(result.get("qrDataUrl").toString().startsWith("data:image/png;base64,"));
        ArgumentCaptor<String> hash=ArgumentCaptor.forClass(String.class);
        verify(mapper).insertChallenge(hash.capture(),eq(7L),eq("synthetic-app"),any());
        assertEquals(64,hash.getValue().length());
        assertFalse(result.get("url").toString().contains(hash.getValue()));
    }

    @Test void authorizeRequiresRealAppIdAndAdmin(){
        setup();ReflectionTestUtils.setField(service,"appId","");
        assertThrows(RuntimeException.class,()->service.authorize(7L));
        ReflectionTestUtils.setField(service,"appId","synthetic-app");
        when(mapper.activeAdmin(7L)).thenReturn(0);
        assertThrows(RuntimeException.class,()->service.authorize(7L));
        verifyNoInteractions(oauth);
    }

    @Test void firstBindingWritesFollowingOpenId() throws Exception {
        setup();stubSuccess();
        when(mapper.bindingByOpenId("synthetic-app","synthetic-open-id")).thenReturn(null);
        when(mapper.binding(7L,"synthetic-app")).thenReturn(null);
        service.callback("code-1",state);
        verify(mapper).insertOAuthBinding(7L,"synthetic-app","synthetic-open-id",1);
        verify(mapper).consume(AdminNoticeOAuthService.digest(state));
        verify(mapper).audit(7L,"OAUTH_BOUND");
    }

    @Test void unfollowedUserIsStoredAsNotFollowing() throws Exception {
        setup();stubSuccess();
        WxMpUser user=new WxMpUser();user.setSubscribe(false);user.setOpenId("synthetic-open-id");
        when(users.userInfo("synthetic-open-id",null)).thenReturn(user);
        Map<String,Object> existing=new HashMap<>();existing.put("openId","old-open-id");
        when(mapper.binding(7L,"synthetic-app")).thenReturn(existing);
        when(mapper.updateBinding(eq(7L),eq("synthetic-app"),eq("synthetic-open-id"),any())).thenReturn(1);
        service.callback("code-1",state);
        verify(mapper).markUnfollowed("synthetic-app","synthetic-open-id");
    }

    @Test void openIdAlreadyBoundToAnotherAdminIsRejected() throws Exception {
        setup();stubSuccess();
        when(mapper.bindingByOpenId("synthetic-app","synthetic-open-id")).thenReturn(99L);
        assertThrows(RuntimeException.class,()->service.callback("code-1",state));
        verify(mapper,never()).insertOAuthBinding(anyLong(),anyString(),anyString(),anyInt());
        verify(mapper,never()).consume(anyString());
    }

    @Test void expiredUsedOrForeignChallengeCannotBind() throws Exception {
        setup();stubSuccess();
        Map<String,Object> expired=challenge();expired.put("expiresAt",now);
        when(mapper.lockChallenge(AdminNoticeOAuthService.digest(state))).thenReturn(expired);
        assertThrows(RuntimeException.class,()->service.callback("code-1",state));
        Map<String,Object> consumed=challenge();consumed.put("consumedAt",now);
        when(mapper.lockChallenge(AdminNoticeOAuthService.digest(state))).thenReturn(consumed);
        assertThrows(RuntimeException.class,()->service.callback("code-1",state));
        Map<String,Object> foreign=challenge();foreign.put("appId","other-app");
        when(mapper.lockChallenge(AdminNoticeOAuthService.digest(state))).thenReturn(foreign);
        assertThrows(RuntimeException.class,()->service.callback("code-1",state));
        assertThrows(RuntimeException.class,()->service.callback("code-1","short"));
        assertThrows(RuntimeException.class,()->service.callback("",state));
        verifyNoInteractions(oauth);
    }

    @Test void wrongAppSwitchoverFailsClosed() {
        setup();stubSuccessQuiet();
        when(wx.switchover(anyString())).thenReturn(false);
        RuntimeException error=assertThrows(RuntimeException.class,()->service.callback("code-1",state));
        assertTrue(error.getMessage().contains("重新获取二维码"));
        verifyNoInteractions(oauth);
    }

    void stubSuccessQuiet(){
        try{stubSuccess();}catch(Exception e){throw new RuntimeException(e);}
    }
}