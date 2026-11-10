package com.macro.mall.service;

import com.macro.mall.bo.AdminUserDetails;
import com.macro.mall.common.exception.BusinessException;
import com.macro.mall.controller.MassagistLeaveController;
import com.macro.mall.entity.Massagist;
import com.macro.mall.entity.MassagistLeave;
import com.macro.mall.model.UmsAdmin;
import org.junit.jupiter.api.*;
import org.mockito.ArgumentCaptor;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.util.ReflectionTestUtils;

import java.lang.reflect.Field;
import java.util.Collections;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/** 休息申请只能由当前账号为本人发起、撤销；客户端传入的申请人与疗愈师不可信。 */
class MassagistLeaveAccessTest {
    MassagistLeaveController controller;
    MassagistLeaveService leaves;
    UmsAdminService admins;
    MassagistService people;
    UmsAdmin admin;
    Massagist person;

    @BeforeEach void setup() {
        controller = new MassagistLeaveController();
        leaves = mock(MassagistLeaveService.class); admins = mock(UmsAdminService.class); people = mock(MassagistService.class);
        ReflectionTestUtils.setField(controller, "massagistLeaveService", leaves);
        boolean adminField = false, peopleField = false;
        for (Field field : controller.getClass().getDeclaredFields()) {
            if (field.getName().equals("adminService")) { ReflectionTestUtils.setField(controller, "adminService", admins); adminField = true; }
            if (field.getName().equals("massagistService")) { ReflectionTestUtils.setField(controller, "massagistService", people); peopleField = true; }
        }
        assertTrue(adminField && peopleField, "休息申请接口必须重新读取当前账号与绑定的疗愈师");
        admin = new UmsAdmin(); admin.setId(9L); admin.setStatus(1); admin.setMassagistId(7L);
        person = new Massagist(); person.setId(7L); person.setUmsAdminId(9L); person.setShopId(2L);
        when(admins.getItem(9L)).thenReturn(admin);
        when(people.getById(7L)).thenReturn(person);
        when(leaves.add(any())).thenAnswer(i -> i.getArgument(0));
        login(admin, true);
    }
    @AfterEach void clear() { SecurityContextHolder.clearContext(); }
    void login(UmsAdmin snapshot, boolean authenticated) {
        AdminUserDetails details = new AdminUserDetails(snapshot, Collections.emptyList());
        SecurityContextHolder.getContext().setAuthentication(authenticated
                ? new UsernamePasswordAuthenticationToken(details, null, Collections.emptyList())
                : new UsernamePasswordAuthenticationToken(details, null));
    }
    MassagistLeave request(long massagistId, Long createUser) {
        MassagistLeave leave = new MassagistLeave(); leave.setMassagistId(massagistId); leave.setCreateUser(createUser); return leave;
    }
    MassagistLeave stored(long massagistId, Long createUser) {
        MassagistLeave leave = request(massagistId, createUser); leave.setId(50L); leave.setApprovalId(20L); return leave;
    }

    @Test void anonymousCannotCreateOrCancel() {
        SecurityContextHolder.clearContext();
        assertThrows(BusinessException.class, () -> controller.add(request(7L, 9L)));
        assertThrows(BusinessException.class, () -> controller.cancelLeave(20L));
        verifyNoInteractions(leaves);
    }
    @Test void disabledAccountTokenCannotCreate() {
        UmsAdmin disabled = new UmsAdmin(); disabled.setId(9L); disabled.setStatus(0); disabled.setMassagistId(7L);
        when(admins.getItem(9L)).thenReturn(disabled);
        assertThrows(BusinessException.class, () -> controller.add(request(7L, 9L)));
        verifyNoInteractions(leaves);
    }
    @Test void applicantAndPersonAreTakenFromCurrentAccount() {
        controller.add(request(0L, 999L));
        ArgumentCaptor<MassagistLeave> sent = ArgumentCaptor.forClass(MassagistLeave.class);
        verify(leaves).add(sent.capture());
        assertEquals(9L, sent.getValue().getCreateUser());
        assertEquals(7L, sent.getValue().getMassagistId());
    }
    @Test void cannotApplyForAnotherPerson() {
        assertThrows(BusinessException.class, () -> controller.add(request(8L, 9L)));
        verify(leaves, never()).add(any());
    }
    @Test void accountWithoutLinkedPersonCannotApply() {
        admin.setMassagistId(null);
        when(people.getOne(any(), anyBoolean())).thenReturn(null);
        assertThrows(BusinessException.class, () -> controller.add(request(7L, 9L)));
        verify(leaves, never()).add(any());
    }
    @Test void staleBindingToAnotherAccountIsRejected() {
        person.setUmsAdminId(10L);
        assertThrows(BusinessException.class, () -> controller.add(request(7L, 9L)));
        verify(leaves, never()).add(any());
    }
    @Test void ownerCanCancelOwnRequest() {
        when(leaves.findMassagistLeaveDetailByApprovalId(20L)).thenReturn(stored(7L, 9L));
        controller.cancelLeave(20L);
        verify(leaves).cancelLeave(20L);
    }
    @Test void otherAccountCannotCancelSomeoneElsesRequest() {
        when(leaves.findMassagistLeaveDetailByApprovalId(20L)).thenReturn(stored(8L, 11L));
        assertThrows(BusinessException.class, () -> controller.cancelLeave(20L));
        verify(leaves, never()).cancelLeave(anyLong());
    }
    @Test void missingRequestCannotBeCancelled() {
        when(leaves.findMassagistLeaveDetailByApprovalId(20L)).thenReturn(null);
        assertThrows(BusinessException.class, () -> controller.cancelLeave(20L));
        verify(leaves, never()).cancelLeave(anyLong());
    }
}
