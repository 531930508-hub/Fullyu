package com.macro.mall.service;

import com.macro.mall.entity.Massagist;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.util.Arrays;
import java.util.Collections;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/** 永久调店后，调入疗愈师在新门店轮次中排头排，而不是排到队尾。 */
class PermanentTransferOrderTest {

    private Massagist person(long id, long shopId) {
        Massagist m = new Massagist();
        m.setId(id);
        m.setShopId(shopId);
        m.setName("疗愈师" + id);
        return m;
    }

    @Test
    void transferToHeadPutsMovedTherapistFirstAndKeepsOthersInOrder() {
        List<Long> ranked = MassagistService.transferToHead(Arrays.asList(1L, 2L, 3L, 4L), 3L);
        assertEquals(Arrays.asList(3L, 1L, 2L, 4L), ranked);
    }

    @Test
    void transferToHeadHandlesDuplicateAndMissingTherapist() {
        assertEquals(Arrays.asList(3L, 1L, 2L), MassagistService.transferToHead(Arrays.asList(1L, 3L, 2L, 3L), 3L));
        assertEquals(Arrays.asList(9L, 1L, 2L), MassagistService.transferToHead(Arrays.asList(1L, 2L), 9L));
        assertEquals(Collections.singletonList(9L), MassagistService.transferToHead(null, 9L));
        assertEquals(Collections.singletonList(1L), MassagistService.transferToHead(Arrays.asList(1L), null));
    }

    @Test
    void permanentTransferRanksNewShopFromHead() {
        MassagistService service = spy(new MassagistService());
        service.massagistSchedulesService = mock(MassagistSchedulesService.class);
        Massagist a = person(1L, 101L), b = person(2L, 101L), moved = person(3L, 101L);
        doReturn(Arrays.asList(a, b, moved)).when(service).sortList(isNull(), eq(101L));
        doReturn(Arrays.asList(a, b)).when(service).sortList(isNull(), eq(102L));
        doNothing().when(service).rerank(isNull(), eq(101L), anyList());
        doNothing().when(service).rerank(isNull(), eq(102L), anyList());

        service.rerank(101L, 102L, 3L);

        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<Long>> captor = ArgumentCaptor.forClass(List.class);
        verify(service).rerank(isNull(), eq(101L), captor.capture());
        assertEquals(Arrays.asList(3L, 1L, 2L), captor.getValue(), "调入疗愈师必须排在新门店轮次第一位");
        verify(service).rerank(isNull(), eq(102L), eq(Arrays.asList(1L, 2L)));
        verify(service.massagistSchedulesService).clearMassgistSortMap(101L);
        verify(service.massagistSchedulesService).clearMassgistSortMap(102L);
    }
}
