package com.macro.mall.service;

import com.baomidou.mybatisplus.core.conditions.Wrapper;
import com.macro.mall.common.exception.BusinessException;
import com.macro.mall.entity.*;
import com.macro.mall.mapper.MemberCardOrderMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.test.util.ReflectionTestUtils;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;

class MemberPeriodServiceTest {
    MemberCardService service;
    CustomerService customers;
    MemberCardOrderMapper payments;
    LocalDateTime end=LocalDateTime.now().plusDays(90);
    List<CustomerMemberCard> periods;
    Order source;
    @BeforeEach void setup() {
        service=spy(new MemberCardService());customers=mock(CustomerService.class);payments=mock(MemberCardOrderMapper.class);
        ReflectionTestUtils.setField(service,"customerService",customers);
        ReflectionTestUtils.setField(service,"orderMapper",payments);
        Customer customer=new Customer();customer.setId(10L);
        when(customers.getOne(any(Wrapper.class))).thenReturn(customer);
        when(payments.insert(any())).thenAnswer(i->{((MemberCardOrder)i.getArgument(0)).setId(5L);return 1;});
        when(payments.updateById(any())).thenReturn(1);
        doReturn(true).when(service).isTestMode();
        doReturn(service.defaultConfigs().get(1)).when(service).getConfigByType("month");
        doReturn(Collections.emptyMap()).when(service).info(10L);
        doAnswer(i->{((CustomerMemberCard)i.getArgument(0)).setId(9L);return true;}).when(service).save(any());
        doReturn(null).when(service).getOne(any(Wrapper.class));
        CustomerMemberCard active=new CustomerMemberCard();active.setId(1L);active.setStartTime(LocalDateTime.now().minusDays(1));
        active.setEndTime(end.minusDays(30));active.setStatus(1);
        CustomerMemberCard pending=new CustomerMemberCard();pending.setId(2L);pending.setStartTime(end.minusDays(30));
        pending.setEndTime(end);pending.setStatus(0);
        periods=new ArrayList<>(Arrays.asList(active,pending));
        // RR快照可能早于客户锁建立：链式计算必须用加锁后的当前读，快照列表故意为空以暴露误用。
        doReturn(new ArrayList<CustomerMemberCard>()).when(service).listByCustomer(10L);
        doAnswer(i->new ArrayList<>(periods)).when(service).lockedPeriods(10L);
        source=new Order();source.setId(100L);source.setCustomerId(10L);
    }
    @Test void secondPrepaidSourceChainsAfterFirstSourceGift() {
        doAnswer(i->{CustomerMemberCard c=i.getArgument(0);c.setId(9L);periods.add(c);return true;}).when(service).save(any());
        CustomerMemberCard first=grant(2);
        Order other=new Order();other.setId(101L);other.setCustomerId(10L);
        CustomerMemberCard second=service.grantPrepaidReward(other,1);
        assertEquals(first.getEndTime(),second.getStartTime());
        assertEquals(first.getEndTime().plusMonths(1),second.getEndTime());
        assertEquals(101L,ReflectionTestUtils.getField(second,"rewardSourceOrderId"));
    }
    @Test void periodsAreReadOnlyAfterCustomerLock() {
        grant(1);
        org.mockito.InOrder order=inOrder(customers,service);
        order.verify(customers).getOne(any(Wrapper.class));
        order.verify(service).lockedPeriods(10L);
        verify(service,never()).listByCustomer(10L);
    }
    @Test void adminIssueChainsFromLockedCurrentPeriods() {
        Customer customer=new Customer();customer.setId(10L);when(customers.getById(10L)).thenReturn(customer);
        Map<String,Object> form=new HashMap<>();form.put("customerIds",Collections.singletonList(10L));
        form.put("cardType","month");form.put("amount",0);
        service.adminIssue(form,1L);
        ArgumentCaptor<CustomerMemberCard> card=ArgumentCaptor.forClass(CustomerMemberCard.class);
        verify(service).save(card.capture());assertEquals(end,card.getValue().getStartTime());
        assertEquals(3,card.getValue().getPeriodNo());
    }
    private CustomerMemberCard grant(int months) { return service.grantPrepaidReward(source,months); }
    @Test void renewalStartsAfterLastPendingPeriod() {
        service.purchase(10L,"month",Collections.singletonMap("agreeTerms",true));
        ArgumentCaptor<CustomerMemberCard> card=ArgumentCaptor.forClass(CustomerMemberCard.class);
        verify(service).save(card.capture());assertEquals(end,card.getValue().getStartTime());
    }
    @Test void consumedGiftUsesCalendarMonthsAndPendingTail() {
        CustomerMemberCard gift=grant(2);
        assertEquals(end,gift.getStartTime());assertEquals(end.plusMonths(2),gift.getEndTime());
        assertEquals(BigDecimal.ZERO,gift.getAmount());assertEquals(3,gift.getChannel());
        assertEquals(100L,ReflectionTestUtils.getField(gift,"rewardSourceOrderId"));
    }
    @Test void repeatCallbackReturnsExistingGiftWithoutWriting() {
        CustomerMemberCard existing=new CustomerMemberCard();existing.setId(50L);
        doReturn(existing).when(service).getOne(any(Wrapper.class));
        assertSame(existing,grant(2));verify(service,never()).save(any());
    }
    @Test void refundedPendingPeriodDoesNotDelayGift() {
        periods.get(1).setStatus(3);
        assertEquals(end.minusDays(30),grant(1).getStartTime());
    }
    @Test void failedGiftWriteFailsClosed() {
        doReturn(false).when(service).save(any());
        assertThrows(BusinessException.class,()->grant(1));
    }
    @Test void invalidMonthsCannotWriteGift() {
        assertThrows(BusinessException.class,()->grant(0));verify(service,never()).save(any());
    }
    @Test void unknownCustomerCannotReceiveGift() {
        when(customers.getOne(any(Wrapper.class))).thenReturn(null);
        assertThrows(BusinessException.class,()->grant(1));verify(service,never()).save(any());
    }
    @Test void failedPurchasedCardWriteCannotReportSuccess() {
        doReturn(false).when(service).save(any());
        assertThrows(BusinessException.class,()->service.purchase(10L,"month",Collections.singletonMap("agreeTerms",true)));
    }
    @Test void failedPurchaseOrderWriteCannotCreateEntitlement() {
        doReturn(0).when(payments).insert(any());
        assertThrows(BusinessException.class,()->service.purchase(10L,"month",Collections.singletonMap("agreeTerms",true)));
        verify(service,never()).save(any());
    }
    @Test void failedAdminCardWriteRollsBackInsteadOfReturningSuccessfulRow() {
        Customer customer=new Customer();customer.setId(10L);when(customers.getById(10L)).thenReturn(customer);
        doReturn(false).when(service).save(any());
        Map<String,Object> form=new HashMap<>();form.put("customerIds",Collections.singletonList(10L));
        form.put("cardType","month");form.put("amount",0);
        assertThrows(BusinessException.class,()->service.adminIssue(form,1L));
    }
}
