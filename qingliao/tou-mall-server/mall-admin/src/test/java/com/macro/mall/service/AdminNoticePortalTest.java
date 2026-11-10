package com.macro.mall.service;

import me.chanjar.weixin.mp.api.WxMpService;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;
import java.lang.reflect.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class AdminNoticePortalTest {
    Object portal;AdminNoticeBindingService binding;WxMpService wx;
    void setup()throws Exception{
        Class<?> type=null;try{type=Class.forName("com.macro.mall.controller.open.AdminNoticePortalController");}catch(ClassNotFoundException ignored){}
        assertNotNull(type,"缺少加密验签的后台服务号事件入口");portal=type.getDeclaredConstructor().newInstance();binding=new AdminNoticeBindingService();ReflectionTestUtils.setField(binding,"enabled",true);ReflectionTestUtils.setField(binding,"appId","synthetic-app");wx=mock(WxMpService.class);ReflectionTestUtils.setField(portal,"bindings",binding);ReflectionTestUtils.setField(portal,"wxService",wx);
        when(wx.switchover("synthetic-app")).thenReturn(true);when(wx.checkSignature("time","nonce","signature")).thenReturn(true);
    }
    final Class<?>[] types={String.class,String.class,String.class,String.class,String.class,String.class,String.class};
    Object post(String app,String encoding,String signature)throws Throwable{try{return portal.getClass().getMethod("post",types).invoke(portal,app,"<xml></xml>",signature,"time","nonce",encoding,"synthetic-message-signature");}catch(InvocationTargetException e){throw e.getCause();}}
    @Test void disabledCallbackNeverTouchesSdk()throws Throwable{setup();ReflectionTestUtils.setField(binding,"enabled",false);post("synthetic-app","aes","signature");verifyNoInteractions(wx);}
    @Test void wrongAppCannotUseAnotherConfiguredAccount()throws Throwable{setup();assertThrows(RuntimeException.class,()->post("another-app","aes","signature"));verifyNoInteractions(wx);}
    @Test void plaintextCannotBindEvenWithValidUrlSignature()throws Throwable{setup();assertThrows(RuntimeException.class,()->post("synthetic-app",null,"signature"));}
    @Test void invalidUrlSignatureCannotReachDecryptOrBinding()throws Throwable{setup();assertThrows(RuntimeException.class,()->post("synthetic-app","aes","bad-signature"));verify(wx,never()).getWxMpConfigStorage();}
    @Test void callbackNeverLogsNonceOrOpenIdParameters()throws Throwable{setup();assertNotNull(portal.getClass().getMethod("post",types).getAnnotation(com.macro.mall.aspect.IgnoreLog.class));}
}
