package com.macro.mall.service;

import com.macro.mall.bo.AdminUserDetails;
import com.macro.mall.model.UmsAdmin;
import org.junit.jupiter.api.*;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.util.ReflectionTestUtils;
import java.lang.reflect.*;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class AdminNoticeControllerTest {
    Object controller;AdminNoticeBindingService binding;AdminApprovalNoticeService notices;
    void setup()throws Exception{
        Class<?> type=null;try{type=Class.forName("com.macro.mall.controller.AdminNoticeController");}catch(ClassNotFoundException ignored){}
        assertNotNull(type,"缺少当前后台人员绑定和通知日志接口");controller=type.getDeclaredConstructor().newInstance();
        binding=mock(AdminNoticeBindingService.class);notices=mock(AdminApprovalNoticeService.class);ReflectionTestUtils.setField(controller,"bindings",binding);ReflectionTestUtils.setField(controller,"notices",notices);
        UmsAdmin admin=new UmsAdmin();admin.setId(7L);admin.setStatus(1);SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken(new AdminUserDetails(admin,Collections.emptyList()),null,Collections.emptyList()));
    }
    Object call(String name,Class<?>[] types,Object...args)throws Throwable{try{return controller.getClass().getMethod(name,types).invoke(controller,args);}catch(InvocationTargetException e){throw e.getCause();}}
    @AfterEach void clear(){SecurityContextHolder.clearContext();}
    @Test void anonymousBindingIsRejectedBeforeService()throws Throwable{setup();SecurityContextHolder.clearContext();assertThrows(RuntimeException.class,()->call("begin",new Class<?>[]{}));verifyNoInteractions(binding);}
    @Test void allSelfEndpointsUseAuthenticatedAdmin()throws Throwable{setup();call("status",new Class<?>[]{});call("begin",new Class<?>[]{});call("unlink",new Class<?>[]{});call("logs",new Class<?>[]{int.class,int.class},1,10);verify(binding).status(7L);verify(binding).begin(7L);verify(binding).unlink(7L);verify(notices).logs(7L,1,10);}
    @Test void confirmationCannotImpersonateAdminOrSupplyOpenId()throws Throwable{setup();Map<String,String> body=new HashMap<>();body.put("nonce","abcdefghijklmnopqrstuvwxyz123456");body.put("adminId","99");body.put("openId","attacker-open-id");call("confirm",new Class<?>[]{Map.class},body);verify(binding).confirm(7L,"abcdefghijklmnopqrstuvwxyz123456");}
    @Test void bindingNonceIsExcludedFromControllerAuditPayload()throws Throwable{setup();assertNotNull(controller.getClass().getMethod("confirm",Map.class).getAnnotation(com.macro.mall.aspect.IgnoreLog.class));}
    @Test void callbackSdkContractUsesActualInstalledVersion()throws Exception{
        Class<?> type=me.chanjar.weixin.mp.bean.message.WxMpXmlMessage.class;
        for(String name:Arrays.asList("getEvent","getEventKey","getCreateTime","getFromUser"))System.out.println("wx-mp-contract "+name+" "+type.getMethod(name).getReturnType().getName());
        String xml="<xml><ToUserName>synthetic-service</ToUserName><FromUserName>synthetic-open-id</FromUserName><CreateTime>1794110400</CreateTime><MsgType>event</MsgType><Event>SCAN</Event><EventKey>synthetic-scene</EventKey></xml>";
        Object parsed=me.chanjar.weixin.mp.bean.message.WxMpXmlMessage.fromXml(xml);assertEquals("SCAN",type.getMethod("getEvent").invoke(parsed));assertEquals("synthetic-scene",type.getMethod("getEventKey").invoke(parsed));assertTrue(type.getMethod("getCreateTime").invoke(parsed) instanceof Number);
    }
}
