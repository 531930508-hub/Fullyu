package com.macro.mall.service;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class AdminNoticeLinkSignerTest {
    static final String SECRET = "synthetic-link-secret";

    @Test void signAndVerifyRoundTrip() {
        long exp = 1000;
        String sig = AdminNoticeLinkSigner.sign(SECRET, 100L, 200L, 7L, exp);
        assertTrue(AdminNoticeLinkSigner.verify(SECRET, 100L, 200L, 7L, exp, sig, 999));
        assertTrue(AdminNoticeLinkSigner.verify(SECRET, 100L, 200L, 7L, exp, sig.toUpperCase(), 999));
    }

    @Test void tamperedParamsOrExpiryAreRejected() {
        long exp = 1000;
        String sig = AdminNoticeLinkSigner.sign(SECRET, 100L, 200L, 7L, exp);
        assertFalse(AdminNoticeLinkSigner.verify(SECRET, 101L, 200L, 7L, exp, sig, 999));
        assertFalse(AdminNoticeLinkSigner.verify(SECRET, 100L, 201L, 7L, exp, sig, 999));
        assertFalse(AdminNoticeLinkSigner.verify(SECRET, 100L, 200L, 8L, exp, sig, 999));
        assertFalse(AdminNoticeLinkSigner.verify(SECRET, 100L, 200L, 7L, exp, sig, 1000));
        assertFalse(AdminNoticeLinkSigner.verify("other-secret", 100L, 200L, 7L, exp, sig, 999));
    }

    @Test void blankSecretOrSignatureIsRejected() {
        assertFalse(AdminNoticeLinkSigner.verify("", 100L, 200L, 7L, 1000, "sig", 1));
        assertFalse(AdminNoticeLinkSigner.verify(SECRET, 100L, 200L, 7L, 1000, null, 1));
        assertThrows(IllegalArgumentException.class, () -> AdminNoticeLinkSigner.sign("", 1L, 2L, 3L, 4L));
    }
}