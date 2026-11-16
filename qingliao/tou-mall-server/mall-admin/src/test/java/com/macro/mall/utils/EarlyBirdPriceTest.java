package com.macro.mall.utils;

import com.macro.mall.common.exception.BusinessException;
import com.macro.mall.membercard.calc.MemberCardPriceEngine;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 早鸟价改约限制：只能原地或往后改，改早直接报错。
 */
class EarlyBirdPriceTest {

    private static final LocalDate BOOKED = LocalDate.of(2026, 11, 10);

    @Test
    void onlyAdvanceSourceCountsAsEarlyBird() {
        assertTrue(EarlyBirdPrice.isEarlyBird(MemberCardPriceEngine.SOURCE_CARD_ADVANCE));
        assertFalse(EarlyBirdPrice.isEarlyBird(0));
        assertFalse(EarlyBirdPrice.isEarlyBird(3));
        assertFalse(EarlyBirdPrice.isEarlyBird(4));
        assertFalse(EarlyBirdPrice.isEarlyBird(5));
        assertFalse(EarlyBirdPrice.isEarlyBird(null));
    }

    @Test
    void movingEarlierIsRejectedForEarlyBirdOrder() {
        BusinessException e = assertThrows(BusinessException.class,
                () -> EarlyBirdPrice.assertNotEarlier(MemberCardPriceEngine.SOURCE_CARD_ADVANCE,
                        BOOKED, BOOKED.minusDays(1)));
        assertTrue(e.getMessage().contains("早鸟价"));
        assertTrue(e.getMessage().contains("2026-11-10"));
        assertTrue(e.getMessage().contains("取消本单后重新下单"));
    }

    @Test
    void sameDayOrLaterIsAllowed() {
        assertDoesNotThrow(() -> EarlyBirdPrice.assertNotEarlier(
                MemberCardPriceEngine.SOURCE_CARD_ADVANCE, BOOKED, BOOKED));
        assertDoesNotThrow(() -> EarlyBirdPrice.assertNotEarlier(
                MemberCardPriceEngine.SOURCE_CARD_ADVANCE, BOOKED, BOOKED.plusDays(3)));
    }

    @Test
    void otherPriceSourcesAreNotRestricted() {
        assertDoesNotThrow(() -> EarlyBirdPrice.assertNotEarlier(0, BOOKED, BOOKED.minusDays(5)));
        assertDoesNotThrow(() -> EarlyBirdPrice.assertNotEarlier(5, BOOKED, BOOKED.minusDays(5)));
    }

    @Test
    void missingDatesSkipValidation() {
        assertDoesNotThrow(() -> EarlyBirdPrice.assertNotEarlier(
                MemberCardPriceEngine.SOURCE_CARD_ADVANCE, null, BOOKED));
        assertDoesNotThrow(() -> EarlyBirdPrice.assertNotEarlier(
                MemberCardPriceEngine.SOURCE_CARD_ADVANCE, BOOKED, null));
    }
}