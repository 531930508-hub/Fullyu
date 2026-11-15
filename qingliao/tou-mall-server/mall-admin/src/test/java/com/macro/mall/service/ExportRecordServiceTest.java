package com.macro.mall.service;

import com.macro.mall.common.exception.BusinessException;
import com.macro.mall.entity.ExportRecord;
import com.macro.mall.mapper.ExportRecordMapper;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.LocalDateTime;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class ExportRecordServiceTest {

    @Test
    void dateOnlyRangeCoversWholeDay() {
        assertEquals(LocalDateTime.of(2026, 11, 1, 0, 0, 0),
                ExportRecordService.parseTime("2026-11-01", false));
        assertEquals(LocalDateTime.of(2026, 11, 1, 23, 59, 59),
                ExportRecordService.parseTime("2026-11-01", true));
    }

    @Test
    void acceptsMinutePrecisionAndIsoTSeparator() {
        assertEquals(LocalDateTime.of(2026, 11, 1, 9, 30, 0),
                ExportRecordService.parseTime("2026-11-01T09:30", false));
        assertEquals(LocalDateTime.of(2026, 11, 1, 9, 30, 59),
                ExportRecordService.parseTime("2026-11-01 09:30", true));
        assertEquals(LocalDateTime.of(2026, 11, 1, 9, 30, 15),
                ExportRecordService.parseTime("2026-11-01 09:30:15", false));
    }

    @Test
    void rejectsInvalidTimeInsteadOfSilentlyIgnoring() {
        BusinessException ex = assertThrows(BusinessException.class,
                () -> ExportRecordService.parseTime("Nov-01", false));
        assertTrue(ex.getMessage().contains("时间格式"));
        assertNull(ExportRecordService.parseTime("  ", false));
    }

    @Test
    void detailRejectsMissingRecord() {
        ExportRecordService service = new ExportRecordService();
        ExportRecordMapper mapper = mock(ExportRecordMapper.class);
        ReflectionTestUtils.setField(service, "baseMapper", mapper);

        BusinessException ex = assertThrows(BusinessException.class, () -> service.detail(99L));
        assertEquals("导出记录不存在", ex.getMessage());

        ExportRecord record = new ExportRecord();
        record.setId(99L);
        when(mapper.selectById(99L)).thenReturn(record);
        assertEquals(99L, service.detail(99L).getId());
    }
}