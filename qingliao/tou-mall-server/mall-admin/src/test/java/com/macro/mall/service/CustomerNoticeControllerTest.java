package com.macro.mall.service;

import com.macro.mall.config.ContextMixin;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class CustomerNoticeControllerTest {
    Object controller; CustomerNoticeService service;
    void setup() throws Exception {
        Class<?> type;
        try { type=Class.forName("com.macro.mall.controller.CustomerNoticeController"); }
        catch (ClassNotFoundException e) { type=null; }
        assertNotNull(type,"缺少当前客户通知接口");
        controller=spy(type.getDeclaredConstructor().newInstance()); service=mock(CustomerNoticeService.class);
        ReflectionTestUtils.setField(controller,"service",service);
        doReturn(7L).when((ContextMixin)controller).curCustomerId();
    }
    @Test void pagingUsesSessionOwnerNotRequestOwner() throws Exception {
        setup(); controller.getClass().getMethod("page",int.class,int.class).invoke(controller,1,10);
        verify(service).page(7L,1,10);
    }
    @Test void readUsesSessionOwner() throws Exception {
        setup(); controller.getClass().getMethod("read",Long.class).invoke(controller,90L);
        verify(service).read(7L,90L);
    }
    @Test void unreadAndReadAllCannotCrossCustomers() throws Exception {
        setup(); controller.getClass().getMethod("unread").invoke(controller);
        controller.getClass().getMethod("readAll").invoke(controller);
        verify(service).unread(7L); verify(service).readAll(7L);
    }
    @Test void forgedCustomerIdInConsentIsIgnored() throws Exception {
        setup(); Map<String,String> body=new HashMap<>();
        body.put("customerId","999");body.put("templateId","synthetic-template");
        body.put("decision","accept");body.put("requestId","request-1234");
        controller.getClass().getMethod("consent",Map.class).invoke(controller,body);
        verify(service).consent(7L,"synthetic-template","accept","request-1234");
    }
}
