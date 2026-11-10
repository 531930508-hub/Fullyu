package com.macro.mall.pay;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import javax.servlet.http.HttpServletRequest;
import java.io.IOException;
import java.math.BigDecimal;
import java.util.Map;

@Service
public class PayClient {
//    @Autowired
//    QPayClient qPayClient;
//
//    @Autowired
//    DyPayClient dyPayClient;
//
//    public Map<String, String> createPayOrder(String mchOrderNo, BigDecimal amount, String subject, String body, Map<String, Object> params, Integer tenantId) throws IOException {
//        if (tenantId.equals(TenantConsts.DOUYIN)) {
//           return dyPayClient.createPayOrder(mchOrderNo,amount,subject,body);
//        }else{
//           return qPayClient.createPayOrder(mchOrderNo,amount,subject,body,params,tenantId);
//        }
//    }
//
//
//    public Map<String,Object> request2payResponseMap(HttpServletRequest request,Integer tenantId){
//        if (tenantId.equals(TenantConsts.DOUYIN)) {
//            return qPayClient.request2payResponseMap(request);
//        }else{
//            return qPayClient.request2payResponseMap(request);
//        }
//    }
}
