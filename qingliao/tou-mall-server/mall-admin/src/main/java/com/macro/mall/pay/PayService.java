package com.macro.mall.pay;

import com.alibaba.fastjson.JSONObject;
import com.macro.mall.common.exception.ApiException;
import com.macro.mall.entity.Order;
import com.macro.mall.enums.OrderState;
import com.macro.mall.utils.RedisUtil;
import lombok.extern.slf4j.Slf4j;
import me.chanjar.weixin.common.api.WxConsts;
import me.chanjar.weixin.common.bean.oauth2.WxOAuth2AccessToken;
import me.chanjar.weixin.common.bean.oauth2.WxOAuth2AccessToken;
import me.chanjar.weixin.common.error.WxErrorException;
import me.chanjar.weixin.common.service.WxOAuth2Service;
import me.chanjar.weixin.mp.api.WxMpService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.util.HashMap;
import java.util.Map;
import java.util.Objects;
import java.util.Random;

/**
 * Created by oahnus on 2025/6/13
 *
 * @author oahnus
 */
@Slf4j
@Service
public class PayService {
    private static Random random = new Random();

    /*@Autowired
    private DouGongPayClient douGongPayClient;*/

    @Autowired
    private WxMpService wxMpService;
    @Autowired
    private RedisUtil redisUtil;

    /**
     * 发起支付
     *
     * @param order     订单
     * @param payOpenId 小程序openId
     * @return
     */
    public Map<String, String> generatePay(Order order, String payOpenId, String productName) {
        // 测试环境严禁发起真实支付，避免测试操作产生实际扣款
        if (Boolean.parseBoolean(System.getProperty("fullyu.test-mode", "false"))) {
            throw new ApiException("当前为测试环境，不发起真实支付");
        }
        DouGongPayClient douGongPayClient=new DouGongPayClient();
        String PayCertsysId3="";
        try{
            //正式上线需要添加以前的订单使用之前的商户号-------------------------------------------------------luxin---------支付退款
            if(order.getShopId()!=null&&order.getShopId()==8){
                douGongPayClient.doInit3();
                PayCertsysId3=PayCert.sysId3;
            }
            else if(order.getShopId()!=null&&order.getShopId()==1){
                douGongPayClient.doInit2();
                PayCertsysId3=PayCert.sysId2;
            }else{
                douGongPayClient.doInit1();
                PayCertsysId3=PayCert.sysId1;
            }
        }catch (Exception e){
            throw new ApiException("支付失败: 系统异常");
        }

        Integer payType = order.getPayType();
        String orderSn = order.getCode();
        BigDecimal payAmount = order.getPayAmount();

        if (payAmount.compareTo(BigDecimal.valueOf(0.01)) < 0) {
            throw new ApiException("支付失败: 支付金额不能低于0.01");
        }

        if (StringUtils.isEmpty(productName)) {
            productName = "Full愈券包";
        }

        orderSn = orderSn + "A" + String.format("%03d", random.nextInt(990) + 1);

        Map<String, Object> payParam = new HashMap<>();
        payParam.put("openId", payOpenId);

        try {
            System.out.println("PayAmount ==> " + payAmount);

            String payChannel = order.getPayChannel();
            if (StringUtils.isEmpty(payChannel)) {
                payChannel = PayChannel.WX_MINI;
            }
            // 获取支付渠道
            Map<String, String> retMap = new HashMap<>();
            if (PayChannel.WX_MINI.equals(payChannel)) {
                payParam.put("tradeType", DouGongPayClient.TradeType.T_MINIAPP);
                retMap = douGongPayClient.createPayOrder(orderSn, payAmount, productName, productName, payParam,PayCertsysId3);
            } else if (PayChannel.A_NATIVE.equals(payChannel)) {
                payParam.put("tradeType", DouGongPayClient.TradeType.A_NATIVE);
                retMap = douGongPayClient.createPayOrder(orderSn, payAmount, productName, productName, payParam,PayCertsysId3);
            } else if (PayChannel.WX_WAP_SCAN.equals(payChannel)) {
                payParam.put("tradeType", DouGongPayClient.TradeType.T_JSAPI);
                retMap = douGongPayClient.genWxPayQrCode(orderSn);
                retMap.put("retCode", "SUCCESS");
            } else if (PayChannel.WX_WAP_PAY.equals(payChannel)) {
                payParam.put("tradeType", DouGongPayClient.TradeType.T_JSAPI);
                retMap = douGongPayClient.createPayOrder(orderSn, payAmount, productName, productName, payParam,PayCertsysId3);
            } else {
                throw new ApiException("未知支付方式");
            }
            if (Objects.equals(retMap.get("retCode"), "FAIL")) {
                throw new ApiException("支付失败");
            }
            retMap.put("orderId", String.valueOf(order.getId()));
            retMap.put("orderSn", orderSn);
            retMap.put("payChannel", payChannel);
            retMap.put("payType", String.valueOf(payType));
            return retMap;
        } catch (Exception e) {
            log.error("支付接口调用异常, e = {}", e.getMessage());
            throw new ApiException("支付失败: 支付平台异常");
        }
    }

    /**
     * 发起退款
     *
     * @param order        订单
     * @param refundAmount 退款金额
     */
    public String refundPay(Order order, BigDecimal refundAmount) {
        // 测试环境严禁调用真实退款通道
        if (Boolean.parseBoolean(System.getProperty("fullyu.test-mode", "false"))) {
            throw new ApiException("当前为测试环境，不发起真实退款");
        }
        BigDecimal payAmount = order.getPayAmount();
        if (refundAmount == null) {
            throw new ApiException("退款金额不能为空");
        }
        if (refundAmount.compareTo(payAmount) > 0) {
            throw new ApiException("退款金额不能大于支付金额");
        }
        BigDecimal hasRefundAmount = order.getHasRefundAmount();
        if (hasRefundAmount == null) {
            hasRefundAmount = BigDecimal.ZERO;
        }
        if (refundAmount.add(hasRefundAmount).compareTo(payAmount) > 0) {
            throw new ApiException("已退款金额与待退款金额合计值不能大于支付金额");
        }

        Integer state = order.getState();
//        if (OrderState.REFUNDED.getValue().equals(state)) {
//            throw new ApiException("已退款订单不可退款");
//        }
        Integer errorRefund = -1;
        if (OrderState.REFUNDING.getValue().equals(state) && !errorRefund.equals(order.getRefundState())) {
            throw new ApiException("退款中订单不可重复操作退款");
        }

        try {
            DouGongPayClient douGongPayClient=new DouGongPayClient();
            String PayCertsysId3="";
            try{
                //正式上线需要添加以前的订单使用之前的商户号-------------------------------------------------------luxin---------支付退款
                if(order.getShopId()!=null&&order.getShopId()==8){
                    douGongPayClient.doInit3();
                    PayCertsysId3=PayCert.sysId3;
                }
                else if(order.getShopId()!=null&&order.getShopId()==1){
                    douGongPayClient.doInit2();
                    PayCertsysId3=PayCert.sysId2;
                }else{
                    douGongPayClient.doInit1();
                    PayCertsysId3=PayCert.sysId1;
                }
                //PayCertsysId3=PayCert.sysId3;
            }catch (Exception e){
                throw new ApiException("支付失败: 系统异常");
            }
            return douGongPayClient.refundPay(order, refundAmount,PayCertsysId3);
        } catch (Exception e) {
            e.printStackTrace();
            log.error("退款失败: {}", e.getMessage());
            throw new ApiException("退款失败:" + e.getMessage());
        }
    }

    public JSONObject queryRefundState(Order order) {
        try {
            DouGongPayClient douGongPayClient=new DouGongPayClient();
            try{
                douGongPayClient.doInit();
            }catch (Exception e){
                throw new ApiException("支付失败: 系统异常");
            }

            return douGongPayClient.queryRefundState(order);
        } catch (Exception e) {
            e.printStackTrace();
            log.error("查询退款状态失败");
            throw new ApiException("查询退款状态失败");
        }
    }

    public boolean validRefundSign(Long orderId, String sign) {
        DouGongPayClient douGongPayClient=new DouGongPayClient();
        try{
            douGongPayClient.doInit();
        }catch (Exception e){
            throw new ApiException("支付失败: 系统异常");
        }
        return douGongPayClient.validateRefundSign(orderId, sign);
    }

    public String getWapOpenId(String code) {
        final WxMpService wxService = wxMpService;
        try {
            WxOAuth2Service oAuth2Service = wxService.getOAuth2Service();
            WxOAuth2AccessToken accessToken = oAuth2Service.getAccessToken(code);
            String openId = accessToken.getOpenId();
            System.out.println(openId);
            String unionId = accessToken.getUnionId();
            return openId;
        } catch (WxErrorException e) {
            e.printStackTrace();
            throw new ApiException("获取微信授权id失败");
        }
    }
}
