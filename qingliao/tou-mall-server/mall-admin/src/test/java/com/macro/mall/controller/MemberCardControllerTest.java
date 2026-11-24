package com.macro.mall.controller;

import com.macro.mall.crm.brand.BrandCardSync;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.Collections;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class MemberCardControllerTest {
    private MemberCardController controller;
    private BrandCardSync brandCardSync;

    @BeforeEach
    void setUp() {
        controller = new MemberCardController();
        brandCardSync = mock(BrandCardSync.class);
        ReflectionTestUtils.setField(controller, "brandCardSync", brandCardSync);
        when(brandCardSync.adminSync(true)).thenReturn(Collections.emptyMap());
    }

    @Test
    void missingBodyDefaultsToDryRun() {
        controller.syncCrmCards(null);
        verify(brandCardSync).adminSync(true);
    }

    @Test
    void missingDryRunFlagDefaultsToDryRun() {
        controller.syncCrmCards(Collections.emptyMap());
        verify(brandCardSync).adminSync(true);
    }

    @Test
    void explicitFalseAppliesSync() {
        controller.syncCrmCards(Collections.singletonMap("dryRun", false));
        verify(brandCardSync).adminSync(false);
    }
}
