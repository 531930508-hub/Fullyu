package com.macro.mall.service;

import com.macro.mall.bo.AdminUserDetails;
import com.macro.mall.common.exception.BusinessException;
import com.macro.mall.controller.statistics.StatisticsController;
import com.macro.mall.incentive.service.IncentiveAccessService;
import com.macro.mall.model.UmsAdmin;
import com.macro.mall.service.serviceStatistics.StatisticsService;
import org.junit.jupiter.api.*;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.util.ReflectionTestUtils;
import java.lang.reflect.*;
import java.util.*;
import static org.mockito.Mockito.*;
import static org.junit.jupiter.api.Assertions.*;

class ServiceDurationAccessTest {
    StatisticsController controller; StatisticsService service; IncentiveAccessService access; UmsAdmin admin;
    @BeforeEach void setup(){controller=new StatisticsController();service=mock(StatisticsService.class);access=spy(new IncentiveAccessService());
        ReflectionTestUtils.setField(controller,"service",service);
        if(Arrays.stream(controller.getClass().getDeclaredFields()).anyMatch(f->f.getName().equals("access")))ReflectionTestUtils.setField(controller,"access",access);
        doReturn(false).when(access).isGlobal();doReturn(5L).when(access).resolveShopId(null);
        admin=new UmsAdmin();admin.setId(9L);admin.setStatus(1);login();}
    void login(){SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken(new AdminUserDetails(admin,Collections.emptyList()),null,Collections.emptyList()));}
    @AfterEach void clear(){SecurityContextHolder.clearContext();}
    void call(Long shop,Long person,boolean export)throws Throwable{
        String name=export?"serviceDurationExport":"serviceDuration";
        Method chosen=Arrays.stream(controller.getClass().getMethods()).filter(m->m.getName().equals(name)).findFirst().get();
        Object[] args=chosen.getParameterCount()==4?new Object[]{"2026-11-01 00:00:00","2026-11-30 23:59:59",shop,person}:
                export?new Object[]{"2026-11-01 00:00:00","2026-11-30 23:59:59",shop,person,1}:
                        new Object[]{"2026-11-01 00:00:00","2026-11-30 23:59:59",shop,person,1,1,10};
        try{chosen.invoke(controller,args);}catch(InvocationTargetException e){throw e.getCause();}
    }
    @Test void anonymousReadRejectedBeforeStatistics()throws Throwable{SecurityContextHolder.clearContext();assertThrows(BusinessException.class,()->call(null,null,false));verifyNoInteractions(service);}
    @Test void disabledReadAndExportRejected()throws Throwable{admin.setStatus(0);login();assertThrows(BusinessException.class,()->call(null,null,false));assertThrows(BusinessException.class,()->call(null,null,true));verifyNoInteractions(service);}
    @Test void therapistCannotForgeAnotherPersonsId()throws Throwable{admin.setMassagistId(7L);login();assertThrows(BusinessException.class,()->call(null,99L,false));assertThrows(BusinessException.class,()->call(null,99L,true));verifyNoInteractions(service);}
    @Test void therapistReadIsAlwaysBoundToSelfAcrossStores()throws Throwable{admin.setMassagistId(7L);login();call(null,null,false);org.mockito.invocation.Invocation invocation=mockingDetails(service).getInvocations().iterator().next();assertEquals("serviceDurationPage",invocation.getMethod().getName());assertNull(invocation.getArgument(0));assertEquals(Long.valueOf(7L),(Long)invocation.getArgument(3));}
    @Test void managerCannotReadOrExportUnauthorizedShop()throws Throwable{doThrow(new BusinessException("无权查看该门店")).when(access).resolveShopId(99L);assertThrows(BusinessException.class,()->call(99L,null,false));assertThrows(BusinessException.class,()->call(99L,null,true));verifyNoInteractions(service);}
}
