package com.macro.mall.service;

import com.macro.mall.common.exception.BusinessException;
import com.macro.mall.entity.Approval;
import com.macro.mall.enums.FlowState;
import org.junit.jupiter.api.Test;
import java.time.LocalDateTime;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;

class ApprovalStatePersistenceTest {
    Approval approval(){Approval value=new Approval();value.setId(1L);value.setState(2);value.setCreateTime(LocalDateTime.now().minusMinutes(1));return value;}
    @Test void failedCompletionWriteCannotReportPassed(){
        ApprovalService service=spy(new ApprovalService());doReturn(false).when(service).updateById(any());
        assertThrows(BusinessException.class,()->service.changeState(approval(),FlowState.PASSED));
    }
    @Test void failedRejectionWriteCannotReportRejected(){
        ApprovalService service=spy(new ApprovalService());doReturn(approval()).when(service).getById(1L);doReturn(false).when(service).updateById(any());
        assertThrows(BusinessException.class,()->service.rejected(7L,1L,FlowState.REJECTED,"原因"));
    }
    @Test void missingApprovalHasBusinessErrorNotNullPointer(){
        ApprovalService service=spy(new ApprovalService());doReturn(null).when(service).getById(1L);
        assertThrows(BusinessException.class,()->service.rejected(7L,1L,FlowState.REJECTED,"原因"));
    }
    @Test void successfulCompletionAndRejectionRetainExistingFields(){
        ApprovalService service=spy(new ApprovalService());Approval value=approval();doReturn(value).when(service).getById(1L);doReturn(true).when(service).updateById(any());
        assertEquals(3,service.changeState(value,FlowState.PASSED).getState());
        assertEquals(0,service.rejected(7L,1L,FlowState.REJECTED,"原因").getState());assertTrue(value.getRejectReason().contains("原因"));
    }
}
