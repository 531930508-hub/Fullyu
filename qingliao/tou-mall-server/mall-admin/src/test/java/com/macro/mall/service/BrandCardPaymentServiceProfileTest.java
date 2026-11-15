package com.macro.mall.service;

import com.macro.mall.common.exception.BusinessException;
import com.macro.mall.entity.Customer;
import com.macro.mall.entity.MemberCardOrder;
import com.macro.mall.mapper.MemberCardOrderMapper;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.LocalDate;
import java.util.HashMap;
import java.util.Map;
import java.util.function.Consumer;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

/**
 * 会员档案（称呼/性别/生日）必须以客户资料为唯一归档：
 * 先推会员中心成功，才允许回写开卡订单；失败不能留下半截数据。
 */
class BrandCardPaymentServiceProfileTest {

    private final CustomerService customerService = mock(CustomerService.class);
    private final MemberCardOrderMapper orderMapper = mock(MemberCardOrderMapper.class);

    private BrandCardPaymentService service() {
        BrandCardPaymentService service = new BrandCardPaymentService();
        ReflectionTestUtils.setField(service, "customerService", customerService);
        ReflectionTestUtils.setField(service, "orderMapper", orderMapper);
        return service;
    }

    private Map<String, Object> form(String name, String gender, String birthday) {
        Map<String, Object> form = new HashMap<>();
        form.put("contactName", name);
        form.put("contactGender", gender);
        form.put("contactBirthday", birthday);
        return form;
    }

    @Test
    void saveMemberProfileWritesCustomerProfileThenOrder() {
        Customer customer = new Customer();
        customer.setId(7L);
        customer.setNickname("旧昵称");
        when(customerService.getById(7L)).thenReturn(customer);
        when(customerService.updateProfile(eq(7L), any())).thenAnswer(invocation -> {
            Consumer<Customer> editor = invocation.getArgument(1);
            editor.accept(customer);
            return customer;
        });
        MemberCardOrder order = new MemberCardOrder();
        order.setId(11L);
        order.setCustomerId(7L);
        when(orderMapper.selectOne(any())).thenReturn(order);

        Map<String, Object> profile = service().saveMemberProfile(7L, form(" 林晚 ", "2", "1995-06-18"));

        // 称呼即会员昵称：个人中心、会员卡、会员中心看到同一份
        assertEquals("林晚", customer.getNickname());
        assertEquals(Integer.valueOf(2), customer.getGender());
        assertEquals(LocalDate.of(1995, 6, 18), customer.getBirthday());
        verify(customerService).updateProfile(eq(7L), any());
        assertEquals("林晚", order.getContactName());
        assertEquals(Integer.valueOf(2), order.getContactGender());
        assertEquals(LocalDate.of(1995, 6, 18), order.getContactBirthday());
        verify(orderMapper).updateById(order);
        assertEquals("林晚", profile.get("contactName"));
        assertEquals("2", profile.get("contactGender"));
        assertEquals("1995-06-18", profile.get("contactBirthday"));
    }

    @Test
    void saveMemberProfileRejectsIncompleteForm() {
        BrandCardPaymentService service = service();
        assertThrows(BusinessException.class, () -> service.saveMemberProfile(7L, form("", "1", "1995-06-18")));
        assertThrows(BusinessException.class, () -> service.saveMemberProfile(7L, form("林晚", "3", "1995-06-18")));
        assertThrows(BusinessException.class, () -> service.saveMemberProfile(7L, form("林晚", "1", "")));
        assertThrows(BusinessException.class, () -> service.saveMemberProfile(7L, form("林晚", "1", "2999-01-01")));
        assertThrows(BusinessException.class, () -> service.saveMemberProfile(null, form("林晚", "1", "1995-06-18")));
        verify(customerService, never()).updateProfile(any(), any());
        verifyNoInteractions(orderMapper);
    }

    @Test
    void saveMemberProfileKeepsOrderUntouchedWhenCrmRejects() {
        when(customerService.updateProfile(eq(7L), any()))
                .thenThrow(new BusinessException("会员资料已被修改，请刷新后重试", 409));

        BusinessException error = assertThrows(BusinessException.class,
                () -> service().saveMemberProfile(7L, form("林晚", "2", "1995-06-18")));

        assertEquals(409, error.getStatus());
        verifyNoInteractions(orderMapper);
    }
}