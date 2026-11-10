package com.macro.mall.pay;

import cn.hutool.core.lang.Snowflake;
import com.alibaba.fastjson.JSON;
import com.alibaba.fastjson.JSONObject;
import com.alibaba.fastjson.TypeReference;
import com.google.common.base.Stopwatch;
import com.huifu.bspay.sdk.opps.client.BasePayClient;
import com.huifu.bspay.sdk.opps.core.BasePay;
import com.huifu.bspay.sdk.opps.core.config.MerConfig;
import com.huifu.bspay.sdk.opps.core.exception.BasePayException;
import com.huifu.bspay.sdk.opps.core.request.*;
import com.huifu.bspay.sdk.opps.core.sign.JsonUtils;
import com.huifu.bspay.sdk.opps.core.utils.DateTools;
import com.huifu.bspay.sdk.opps.core.utils.ObjectUtils;
import com.huifu.bspay.sdk.opps.core.utils.RsaUtils;
import com.huifu.bspay.sdk.opps.core.utils.SequenceTools;
import com.macro.mall.common.exception.ApiException;
import com.macro.mall.entity.Order;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.jta.WebSphereUowTransactionManager;

import javax.annotation.PostConstruct;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.io.IOException;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.nio.charset.StandardCharsets;
import java.security.InvalidKeyException;
import java.security.NoSuchAlgorithmException;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

/**
 * Created by oahnus on 2022-11-25
 *
 * @author oahnus
 */
@Service
@Slf4j
public class DouGongPayClient implements IPayClient {
    @Value("${spring.profiles.active}")
    String active = "prod";

    private static Snowflake snowflake = new Snowflake(1, 2);


//    private static String baseNotifyUrl = "https://proxy.sanliu.top/admin/open/dgpay/refund/notify?orderId=";
    private static String baseNotifyUrl = "https://fullytherapy.com/admin/open/dgpay/refund/notify";

    private static String secretKey = "j;LJFO2MV#asNh;vb";

    /***
     * @Description: 初始化设置商户公共参数（全局只需设置一次）
     * @throws Exception
     * @date: 2021年7月5日17:59:33
     */
   // @PostConstruct
    public void doInit() throws Exception {
        log.info("Start Init DouGong Pay");
        BasePay.debug = true;
        if (active.equals("prod")) {
            BasePay.prodMode = BasePay.MODE_PROD;
        } else {
            BasePay.prodMode = BasePay.MODE_PROD;
            //BasePay.prodMode = BasePay.MODE_TEST;
        }
        MerConfig ppzConfig = new MerConfig();
        ppzConfig.setProcutId(PayCert.productId);
        ppzConfig.setSysId(PayCert.sysId);
        ppzConfig.setRsaPrivateKey(PayCert.paySecret);
        ppzConfig.setRsaPublicKey(PayCert.payPubKey);
        Map<String, MerConfig> configs = new HashMap<>();
        configs.put("default", ppzConfig);
        BasePay.initWithMerConfigs(configs);
        log.info("DouGong Pay Init Finish");

    }

    public void doInit1() throws Exception {
        log.info("Start Init DouGong Pay");
        BasePay.debug = true;
        if (active.equals("prod")) {
            BasePay.prodMode = BasePay.MODE_PROD;
        } else {
            BasePay.prodMode = BasePay.MODE_PROD;
            //BasePay.prodMode = BasePay.MODE_TEST;
        }
        MerConfig ppzConfig = new MerConfig();
        ppzConfig.setProcutId(PayCert.productId1);
        ppzConfig.setSysId(PayCert.sysId1);
        ppzConfig.setRsaPrivateKey(PayCert.paySecret1);
        ppzConfig.setRsaPublicKey(PayCert.payPubKey1);
        Map<String, MerConfig> configs = new HashMap<>();
        configs.put("default", ppzConfig);
        BasePay.initWithMerConfigs(configs);
        log.info("DouGong Pay Init Finish");

    }

    public void doInit2() throws Exception {
        log.info("Start Init DouGong Pay");
        BasePay.debug = true;
        if (active.equals("prod")) {
            BasePay.prodMode = BasePay.MODE_PROD;
        } else {
            BasePay.prodMode = BasePay.MODE_PROD;
            //BasePay.prodMode = BasePay.MODE_TEST;
        }
        MerConfig ppzConfig = new MerConfig();
        ppzConfig.setProcutId(PayCert.productId2);
        ppzConfig.setSysId(PayCert.sysId2);
        ppzConfig.setRsaPrivateKey(PayCert.paySecret2);
        ppzConfig.setRsaPublicKey(PayCert.payPubKey2);
        Map<String, MerConfig> configs = new HashMap<>();
        configs.put("default", ppzConfig);
        BasePay.initWithMerConfigs(configs);
        log.info("DouGong Pay Init Finish");

    }

    public void doInit3() throws Exception {
        log.info("Start Init DouGong Pay");
        BasePay.debug = true;
        if (active.equals("prod")) {
            BasePay.prodMode = BasePay.MODE_PROD;
        } else {
            BasePay.prodMode = BasePay.MODE_PROD;
            //BasePay.prodMode = BasePay.MODE_TEST;
        }
        MerConfig ppzConfig = new MerConfig();
        ppzConfig.setProcutId(PayCert.productId3);
        ppzConfig.setSysId(PayCert.sysId3);
        ppzConfig.setRsaPrivateKey(PayCert.paySecret3);
        ppzConfig.setRsaPublicKey(PayCert.payPubKey3);
        Map<String, MerConfig> configs = new HashMap<>();
        configs.put("default", ppzConfig);
        BasePay.initWithMerConfigs(configs);
        log.info("DouGong Pay Init Finish");

    }

    public static final String REQUEST_SUCC_CODE = "00000000";
    private static String getRiskCheckData() {
        JSONObject dto = new JSONObject();
        // ip地址
        dto.put("ip_addr", "");
        // 基站地址
        dto.put("base_atation", "");
        // 纬度
        dto.put("latitude", "2");
        // 经度
        dto.put("longitude", "1");

        return dto.toJSONString();
    }

    public static void testPay() throws Exception {
        BasePay.debug = true;

        /**
         * prodMode 模式，默认为生产模式
         * MODE_PROD = "prod"; // 生产环境
         * MODE_TEST = "test"; // 线上联调环境(针对商户联调测试)
         */

        String sysId = "";
        String publicKey = "";
        // 汇付公钥
        String publicKey2 = "";
        String secretKey = "";

        sysId = PayCert.sysId;
        secretKey = PayCert.paySecret;
        publicKey2 = PayCert.payPubKey;

        BasePay.prodMode = BasePay.MODE_PROD;
        MerConfig merConfig = new MerConfig();

        merConfig.setProcutId("PAYUN");
        merConfig.setSysId(sysId);
        merConfig.setRsaPrivateKey(secretKey);
        merConfig.setRsaPublicKey(publicKey2);
//        merConfig.setHuifuId(sysId);

//        doInit(merConfig);
        BasePay.initWithMerConfig(merConfig);

        V2TradePaymentJspayRequest request = new V2TradePaymentJspayRequest();
        // 请求日期
        request.setReqDate(DateTools.getCurrentDateYYYYMMDD());
        // 请求流水号
        request.setReqSeqId(SequenceTools.getReqSeqId32());
        // 商户号
        request.setHuifuId(sysId);
        // 交易类型
        request.setTradeType("T_MINIAPP");
        // 交易金额
        request.setTransAmt("1000.00");
        // 商品描述
        request.setGoodsDesc("测试订单");
        Map<String, Object> wxData = new HashMap<>();
        wxData.put("sub_openid", "ol50D7q6WrB-ZjEWaWlOLztS5FWo");
//        wxData.put("sub_appid", DgPayConfig.ppzWxWpAppId);
        request.addExtendInfo("wx_data", wxData);

//        V2TradePaymentMicropayRequest request = new V2TradePaymentMicropayRequest();
//        //请求日期
//        request.setReqDate(DateTools.getCurrentDateYYYYMMDD());
//        //请求流水号（保证唯一）
//        request.setReqSeqId(SequenceTools.getReqSeqId32());
//        //交易金额（单位元）
//        request.setTransAmt("0.01");
//        //条形码
//        request.setAuthCode("287606928207260513");
//        //商品描述
//        request.setGoodsDesc("测试商品");
//        //商户id
//        request.setHuifuId(sysId);
//
//        request.setRiskCheckData(getRiskCheckData());
        // 3.拓展参数 (可选)
        // 该笔交易的异步通知地址（http/https异步通知地址，必须以virgo://开头）
//        request.addExtendInfo("notify_url", "virgo://http://www.baidu.com");

        try {
            // 3. 发起API调用
            System.out.println("Start");
            log.info("start time");
//            Stopwatch stopwatch = Stopwatch.createStarted();
//            Map<String, Object> response = BasePayClient.request(request, request.getFunctionCode().getCode(), "default", true);
//            Stopwatch stop = stopwatch.stop();
//            System.out.println(stop);
//            System.out.println("返回数据:" + JSONObject.toJSONString(response));


            System.out.println("====");
            Stopwatch sw3 = Stopwatch.createStarted();
            Map<String, Object> params2 = ObjectUtils.objectToMap(request);
            String json2 = JSON.toJSONString(params2);
            String sortedData2 = JsonUtils.sort4JsonString(json2, 0);
            String requestSign2 = RsaUtils.oldSign(sortedData2, PayCert.paySecret);
            System.out.println(requestSign2);
            sw3.stop();
            System.out.println("oldSign:" + sw3);

            Map<String, Object> params = ObjectUtils.objectToMap(request);
            String json = JSON.toJSONString(params);
            String sortedData = JsonUtils.sort4JsonString(json, 0);

            Stopwatch sw2 = Stopwatch.createStarted();
            String requestSign = RsaUtils.sign(sortedData, PayCert.paySecret);
            sw2.stop();
            System.out.println("sign:" + sw2);
            System.out.println(requestSign);

        } catch (Exception e) {
            e.printStackTrace();
        }

        BigDecimal amount = BigDecimal.valueOf(0.01);
        String s = amount.setScale(2, RoundingMode.HALF_UP).toString();
        System.out.println(s);
    }

    public static void main(String... args) throws Exception {
//        BasePay.debug = true;
//
//        /**
//         * prodMode 模式，默认为生产模式
//         * MODE_PROD = "prod"; // 生产环境
//         * MODE_TEST = "test"; // 线上联调环境(针对商户联调测试)
//         */
//
//        String sysId = "";
//        String publicKey = "";
//        // 汇付公钥
//        String publicKey2 = "";
//        String secretKey = "";
//
//        sysId = PayCert.sysId;
//        secretKey = PayCert.paySecret;
//        publicKey2 = PayCert.payPubKey;
//
//        BasePay.prodMode = BasePay.MODE_PROD;
//        MerConfig merConfig = new MerConfig();
//
//        merConfig.setProcutId("PAYUN");
//        merConfig.setSysId(sysId);
//        merConfig.setRsaPrivateKey(secretKey);
//        merConfig.setRsaPublicKey(publicKey2);
////        merConfig.setHuifuId(sysId);
//
////        doInit(merConfig);
//        BasePay.initWithMerConfig(merConfig);
//        // 2.组装请求参数
//        Map<String, Object> paramsInfo = new HashMap<>();
//        // 商户号
//        paramsInfo.put("huifu_id", PayCert.sysId);
//        // 退款请求日期退款发生的日期，格式为yyyyMMdd，&lt;font color&#x3D;&quot;green&quot;&gt;示例值：20220925&lt;/font&gt;；&lt;/br&gt;传入退款全局流水号时，非必填，其他场景必填；
//        paramsInfo.put("org_req_date", "20250616");
//        // 退款全局流水号退款请求流水号,退款全局流水号,终端订单号三选一不能都为空；&lt;br/&gt;&lt;font color&#x3D;&quot;green&quot;&gt;示例值：0030default220825182711P099ac1f343f00000&lt;/font&gt;
//        paramsInfo.put("org_hf_seq_id", "003100TOP4B250616164619P267ac13633400000");
//        // 退款请求流水号退款请求流水号,退款全局流水号,终端订单号三选一不能都为空；&lt;br/&gt;&lt;font color&#x3D;&quot;green&quot;&gt;示例值：202110210012100005&lt;/font&gt;
//        paramsInfo.put("org_req_seq_id", "");
//        // 终端订单号退款请求流水号,退款全局流水号,终端订单号三选一不能都为空；&lt;br/&gt;&lt;font color&#x3D;&quot;green&quot;&gt;示例值：16672670833524393&lt;/font&gt;
//        paramsInfo.put("mer_ord_id", "");
//        // 3. 发起API调用
//        V2TradePaymentScanpayRefundqueryRequest r = new V2TradePaymentScanpayRefundqueryRequest();
//        System.out.println(r.getFunctionCode().toString());
//        Map<String, Object> response = BasePayClient.request(paramsInfo, "v2/trade/payment/scanpay/refundquery", null, false);;
//        System.out.println(response);

//        for (int i = 0; i < 10; i++) {
//            testPay();
//        }

//
//        V2TradePaymentJspayRequest request = new V2TradePaymentJspayRequest();
//        // 请求日期
//        request.setReqDate(DateTools.getCurrentDateYYYYMMDD());
//        // 请求流水号
//        request.setReqSeqId("S2025070811310299993");
//        // 商户号
//        request.setHuifuId("6666000124043132");
//        // 交易类型
//        request.setTradeType("T_JSAPI");
//        // 交易金额
//        // 格式化amount保留两位小数
//        request.setTransAmt("0.01");
//        // 商品描述
//        request.setGoodsDesc("测试");
//
//        Map<String, Object> wxData = new HashMap<>();
//        wxData.put("sub_appid", "wx59a1e7bac16183d1");
//        wxData.put("sub_openid", "ooOppw0riLmJltnl6QhgSfs1A4B4");
//        request.addExtendInfo("wx_data", wxData);
//
//        Map<String, Object> response = BasePayClient.request(request,
//                request.getFunctionCode().getCode(), "default", false);
//        String pay_info = (String) response.get("pay_info");
//        String reqSeqId = (String) response.get("req_seq_id");
//        String huifuId = (String) response.get("huifu_id");
//
//        log.info("========dougongpay========");
//        log.info("resp => {}", response);
//        log.info("reqSeqId = {}", reqSeqId);
//        log.info("==========================");

        DouGongPayClient client = new DouGongPayClient();
        client.doInit();

        client.queryOrder("S202510250005958A092", "20251025");
    }

    @Override
    public Map<String, String> createPayOrder(String mchOrderNo, BigDecimal amount, String subject, String body, Map<String, Object> params,String PayCertsysId3) throws BasePayException, IllegalAccessException, IOException {
        Stopwatch stopwatch = Stopwatch.createStarted();
        Map<String, String> map = doCreatePayOrder(mchOrderNo, amount, subject, body, params,PayCertsysId3);
        Stopwatch stop = stopwatch.stop();
        System.out.println("huifu支付请求耗时：" + stop);
        return map;
    }

    public Map<String, String> genWxPayQrCode(String mchOrderNo) {
        String wpAppId = PayCert.wxWpAppId;
        /*上线时需要修改地址-------------------------------------------------------------------------------------------------------*/
        String url = String.format("https://manage.fullytherapy.com/wxWapPay/wx.html?orderSn=%s&appId=%s&timestamp=%s",
                mchOrderNo,
                wpAppId,
                System.currentTimeMillis()
        );
        /*String url = String.format("https://test.fullytherapy.com/wxWapPay/wx.html?orderSn=%s&appId=%s&timestamp=%s",
                mchOrderNo,
                wpAppId,
                System.currentTimeMillis()
        );*/
        try {
            Map<String, String> retMap = new HashMap<>();
            retMap.put("orderSn", mchOrderNo);
            retMap.put("qrcode", url);
            return retMap;
        } catch (Exception e) {
            throw new ApiException("支付失败, 请联系客服处理");
        }
    }

    /**
     *
     * @param mchOrderNo 订单号S2250922231232A213 带随机码的订单号
     * @param dateStr yyyyMMdd
     */
    public void queryOrder(String mchOrderNo, String dateStr) {
        V3TradePaymentScanpayQueryRequest request = new V3TradePaymentScanpayQueryRequest();
        request.setHuifuId(PayCert.sysId);
        request.setOrgReqSeqId(mchOrderNo);
        request.setOrgReqDate(dateStr);

        try {
            // https://paas.huifu.com/open/doc/api/#/smzf/api_qrpay_cx
            Map<String, Object> resp = BasePayClient.request(request);
            String transTime = (String) resp.get("trans_time"); // HHMMSS
            String trans_stat = (String) resp.get("trans_stat"); // 交易状态 P：处理中；S：成功；F：失败；I: 初始（初始状态很罕见，请联系汇付技术人员处理）；交易状态以此字段为准。
            String trans_type = (String) resp.get("trans_type"); // 交易类型
            String trans_amt = (String) resp.get("trans_amt"); // 交易金额
            String org_req_date = (String) resp.get("org_req_date"); // 原机构请求日期
            String trans_time = (String) resp.get("trans_time"); // 交易时间HHMMSS
            String end_time = (String) resp.get("end_time"); // 支付完成时间 格式yyyyMMddHHMMSS

            System.out.println(transTime);
            System.out.println(trans_stat);
            System.out.println(trans_type);


        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    public void queryOrderPaidPage(Integer tenantId, List<String> reqSeqList) {
        String huifuId = PayCert.sysId;
        String date = LocalDate.now().format(DateTimeFormatter.ofPattern("yyyyMMdd"));

        V2TradeTransstatQueryRequest request = new V2TradeTransstatQueryRequest();
        request.setPageNo("1");
        request.setPageSize("50");
        request.setHuifuId(huifuId);
        request.setReqDate(date);
        Map<String, Object> extendInfoMap = new HashMap<>();
        extendInfoMap.put("reqseqid_list", JSON.toJSONString(reqSeqList));
        request.setExtendInfo(extendInfoMap);

        try {
            Map<String, Object> resp = BasePayClient.request(request);
            log.info("查询汇付订单信息:  resp = {}", resp);
            String respCode = (String) resp.get("resp_code");
            String respDesc = (String) resp.get("resp_desc");
            String totalSize = (String) resp.get("total_size");
            String orderListJson = (String) resp.get("trans_stat_responses");

            List<JSONObject> orderList = JSONObject.parseArray(orderListJson, JSONObject.class);


        } catch (BasePayException e) {
            throw new RuntimeException(e);
        } catch (IllegalAccessException e) {
            throw new RuntimeException(e);
        }
    }

    private Map<String, String> doCreatePayOrder(String mchOrderNo, BigDecimal amount, String subject, String body, Map<String, Object> params,String PayCertsysId3) throws BasePayException, IllegalAccessException, IOException {
        String paySysId = PayCertsysId3;
       // paySysId="6666000189317223";
        String merchKey = "default";
        String tradeType = (String) params.get("tradeType");
//        String tradeType = convertChannelId2TradeType(channelId);

        V2TradePaymentJspayRequest request = new V2TradePaymentJspayRequest();
        // 请求日期
        request.setReqDate(DateTools.getCurrentDateYYYYMMDD());
        // 请求流水号
        request.setReqSeqId(mchOrderNo);
        // 商户号
        request.setHuifuId(paySysId);
        // 交易类型
        request.setTradeType(tradeType);

        // 交易金额
        // 格式化amount保留两位小数
        request.setTransAmt(amount.setScale(2, RoundingMode.HALF_UP).toString());
        // 商品描述
        request.setGoodsDesc(subject);


        if (tradeType.equals(TradeType.T_MINIAPP)) {
            String openId = (String) params.get("openId");
            Map<String, Object> wxData = new HashMap<>();
           /* String appId = PayCert.wxWpAppId;
            wxData.put("sub_appid", appId);*/
            wxData.put("sub_openid", openId);
            request.addExtendInfo("wx_data", wxData);
        }
        if (tradeType.equals(TradeType.T_JSAPI)) {
            String openId = (String) params.get("openId");

            Map<String, Object> wxData = new HashMap<>();
            String appId = PayCert.wxWpAppId;
            wxData.put("sub_appid", appId);
            wxData.put("sub_openid", openId);
            request.addExtendInfo("wx_data", wxData);
        }
        /*String openId = (String) params.get("openId");
        Map<String, Object> wxData = new HashMap<>();
        String appId = PayCert.wxWpAppId;
        wxData.put("sub_appid", appId);
        wxData.put("sub_openid", openId);
        request.addExtendInfo("wx_data", wxData);*/

        // 可选：为本笔交易指定异步通知地址。仅隔离环境真实支付演练时通过
        // -Dfullyu.pay.notify-url 打开；未配置时保持商户后台默认回调，生产行为不变。
        String notifyUrlOverride = System.getProperty("fullyu.pay.notify-url", "");
        if (notifyUrlOverride != null && !notifyUrlOverride.trim().isEmpty()) {
            String target = notifyUrlOverride.trim();
            if (!target.startsWith("virgo://")) {
                target = "virgo://" + target;
            }
            request.addExtendInfo("notify_url", target);
        }

        Map<String, Object> response = BasePayClient.request(request, request.getFunctionCode().getCode(), merchKey, false);

        String pay_info = (String) response.get("pay_info");
        String reqSeqId = (String) response.get("req_seq_id");
        String huifuId = (String) response.get("huifu_id");

        log.info("========dougongpay========");
        log.info("resp => {}", response);
        log.info("reqSeqId = {}", reqSeqId);
        log.info("==========================");

        String bankCode = (String) response.get("resp_code");
        if (!bankCode.equals("00000100")) {
            throw new ApiException("支付异常");
        }

        Map convert = new HashMap<>();
        convert.put("payOrderId", huifuId);
        convert.put("resCode", "SUCCESS");
        convert.put("retCode", "SUCCESS");
        convert.put("reqSeqId", reqSeqId);
        convert.put("payParams", JSON.parseObject(pay_info, new TypeReference<Map<String, String>>(){}));
        convert.put("qrcode", response.get("qr_code"));

        return convert;
    }


    /**
     * 发起退款
     * @param order
     * @param refundAmount
     * @return hf_seq_id 退款全局流水号
     */
    public String refundPay(Order order, BigDecimal refundAmount,String PayCertsysId3) {
        String reqDate = LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyyMMdd"));

        String reqNo = snowflake.nextIdStr();
        refundAmount = refundAmount.setScale(2, RoundingMode.UP);

        Map<String, Object> dataMap = new HashMap<String, Object>();
        // 请求流水号，需保证当天商户下唯一，推荐采用日期时间+几位流水号的形式
        dataMap.put("req_seq_id", reqNo);
        // 请求日期，请求接口的日期，因服务器时间可能有差异，允许前后1天
        dataMap.put("req_date", reqDate);
        // 商户订单号，需保证商户下唯一，推荐采用日期时间+几位流水号的形式，可与req_seq_id相同
        dataMap.put("mer_ord_id", order.getMerOrdId());
        // 分配商户号
        dataMap.put("huifu_id", PayCertsysId3);
        //自定义
        dataMap.put("remark", order.getCode());


        //
        String sign = null;
        try {
            sign = genRefundSign(order.getId());
        } catch (Exception e) {
            throw new ApiException("生成签名失败");
        }
        String notifyUrl = String.format("%s?orderId=%s&sign=%s", baseNotifyUrl, order.getId(), sign);

        // 退款金额
        LocalDateTime payTime = order.getPayTime();
        String payTimeStr = payTime.format(DateTimeFormatter.ofPattern("yyyyMMdd"));
        dataMap.put("ord_amt", refundAmount.toString());
        dataMap.put("org_req_seq_id", order.getMerOrdId());
        dataMap.put("org_hf_seq_id", order.getHfSeqId());
        dataMap.put("org_req_date", payTimeStr);

//        dataMap.put("notify_url", notifyUrl);

        Map<String, Object> transRefundInfo = new HashMap<>();
        try {
            System.out.println("线上交易退款请求参数：" + JSON.toJSONString(dataMap));
            // 单商户模式可不指定merchantKey，会自动套用default配置
            transRefundInfo = BasePayClient.request(dataMap, "v2/trade/payment/scanpay/refund","default", false);
            // 多商户模式需指定merchantKey
            // transRefundInfo = BasePayClient.request(dataMap, "top-online-ser.refund", "merchantKey1");
            System.out.println("线上交易查询返回参数：" + JSON.toJSONString(transRefundInfo));
        } catch (BasePayException e) {
            e.printStackTrace();
        }

        String subRespCode = (String) transRefundInfo.get("resp_code");
        if ("00000000".equals(subRespCode)) {
            // 业务处理成功
            System.out.println("处理成功");
            // 获取退款交易的状态
            String transStat = (String) transRefundInfo.get("trans_stat");
            System.out.println("交易状态trans_stat=" + transStat);
            return (String) transRefundInfo.get("hf_seq_id");
        } else if ("00000100".equals(subRespCode)) {
            // 退款返回业务处理中后续可通过退款查询接口查询退款具体状态
            // 获取退款交易的状态
            String transStat = (String) transRefundInfo.get("trans_stat");
            System.out.println("交易状态trans_stat=" + transStat);
            return (String) transRefundInfo.get("hf_seq_id");
        } else {
            String subRespDesc = (String) transRefundInfo.get("resp_desc");
            // 业务处理失败
            System.out.println("处理失败，失败信息："  + subRespDesc);
            return null;
        }
    }

    /**
     * 查询退款状态
     * @param order
     * @return state 1 成功  -1失败  0 进行中
     */
    public JSONObject queryRefundState(Order order) {
        LocalDateTime payTime = order.getPayTime();
        String payTimeStr = payTime.format(DateTimeFormatter.ofPattern("yyyyMMdd"));

        V2TradePaymentScanpayRefundqueryRequest request = new V2TradePaymentScanpayRefundqueryRequest();
        request.setHuifuId(PayCert.sysId);
        request.setOrgReqDate(payTimeStr);
        request.setOrgHfSeqId(order.getRefundHfSeqId());

        try {
            Map<String, Object> resp = BasePayClient.request(request, request.getFunctionCode().getCode(), "default", false);
            return JSON.parseObject(JSON.toJSONString(resp));
        } catch (Exception e) {
            throw new ApiException("查询退款失败");
        }
    }

    public static String convertChannelId2TradeType(String channelId) {
        if (channelId == null) {
            return TradeType.T_MINIAPP;
        }
        switch (channelId) {
            case "ALIPAY_PC":
                return TradeType.A_JSAPI;
            case "WX_NATIVE":
                return TradeType.T_JSAPI;
            case "WX_JSAPI":
            case "WX_APP":
            default:
                return TradeType.T_MINIAPP;
        }
    }

    public static class TradeType {
        // 微信小程序
        public static final String T_MINIAPP = "T_MINIAPP";
        // 支付宝网页
        public static final String A_JSAPI = "A_JSAPI";
        // 微信网页
        public static final String T_JSAPI = "T_JSAPI";
        // 支付宝正扫
        public static final String A_NATIVE = "A_NATIVE";
    }
   @Override
    public boolean verifyPayResponse(Map<String, Object> map) {
        return true;
    }

    public void queryOrderState() {

    }

    public String genRefundSign(Long orderId) throws NoSuchAlgorithmException, InvalidKeyException {
        String str = "refundSign:" + orderId;

        Mac hmac = Mac.getInstance("HmacSHA256");
        SecretKeySpec keySpec = new SecretKeySpec(secretKey.getBytes(StandardCharsets.UTF_8), "HmacSHA256");
        hmac.init(keySpec);
        byte[] hash = hmac.doFinal(str.getBytes(StandardCharsets.UTF_8));

        StringBuilder hexSign = new StringBuilder();
        for (byte b : hash) {
            hexSign.append(String.format("%02x", b));
        }
        return hexSign.toString().toUpperCase();
    }

    public boolean validateRefundSign(Long orderId, String sign) {
        String s = null;
        try {
            s = genRefundSign(orderId);
        } catch (NoSuchAlgorithmException | InvalidKeyException e) {
            return false;
        }
        return Objects.equals(s, sign);
    }
}
