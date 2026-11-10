package com.macro.mall.pay;

import com.huifu.bspay.sdk.opps.core.exception.BasePayException;

import java.io.IOException;
import java.math.BigDecimal;
import java.util.Map;

/**
 * Created by oahnus on 2022-11-30
 *
 * @author oahnus
 */
public interface IPayClient {
    Map<String, String> createPayOrder(String mchOrderNo, BigDecimal amount, String subject, String body, Map<String, Object> params,String PayCertsysId3) throws BasePayException, IllegalAccessException, IOException;

    boolean verifyPayResponse(Map<String, Object> map);
}