package com.macro.mall.controller.open;

import com.alibaba.fastjson2.JSON;
import com.alibaba.fastjson2.JSONObject;
import com.google.zxing.BarcodeFormat;
import com.google.zxing.EncodeHintType;
import com.google.zxing.WriterException;
import com.google.zxing.client.j2se.MatrixToImageConfig;
import com.google.zxing.client.j2se.MatrixToImageWriter;
import com.google.zxing.common.BitMatrix;
import com.google.zxing.qrcode.QRCodeWriter;
import com.google.zxing.qrcode.decoder.ErrorCorrectionLevel;
import com.macro.mall.common.api.CommonResult;
import com.macro.mall.common.exception.ApiException;
import com.macro.mall.common.service.RedisService;
import com.macro.mall.entity.Order;
import com.macro.mall.pay.DgPayNotifyParser;
import com.macro.mall.pay.DgPaySignUtils;
import com.macro.mall.pay.PayCert;
import com.macro.mall.pay.PayChannel;
import com.macro.mall.pay.PayService;
import com.macro.mall.service.BrandCardPaymentService;
import com.macro.mall.service.OrderService;
import com.macro.mall.utils.RedisUtil;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.*;

import javax.imageio.ImageIO;
import javax.servlet.ServletOutputStream;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import java.awt.*;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.List;
import java.util.*;

/**
 * Created by oahnus on 2025/6/12
 *
 * @author oahnus
 */
@RestController
@RequestMapping("/admin/open/dgpay")
@Slf4j
public class DyPayController {
    @Autowired
    private OrderService orderService;
    @Autowired
    private BrandCardPaymentService brandCardPaymentService;
    @Autowired
    private PayService payService;
    @Autowired
    private RedisUtil redisUtil;
    @Autowired
    private RedisService redisService;

    // 64x64 logo
    private static final String logoStr = "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";

    @RequestMapping("callback")
    public void handleRedirect(HttpServletRequest request) throws IOException {
        try {
            // 汇付斗拱 v2 异步通知是 form-urlencoded（resp_code/resp_desc/sign/resp_data），
            // 旧版 JSON + MD5 验签只适用于历史回调格式。
            // 这里必须直接读取原始请求体：若方法同时声明 @RequestParam/@RequestBody，
            // 容器解析 form 参数时会消费掉请求体，验签拿到的内容与汇付签名原文不一致。
            String msgBody = readRequestBody(request);
            String contentType = request.getContentType();
            boolean formNotify = contentType != null
                    && contentType.toLowerCase().contains("application/x-www-form-urlencoded");
            if (formNotify || (StringUtils.hasText(msgBody) && msgBody.trim().startsWith("resp_"))) {
                handleFormNotify(msgBody);
                return;
            }
            String sign = request.getParameter("sign");
            log.info("dougong pay mall webhook sign: {}", sign);
            log.info("dougong pay mall webhook mgsBody: {}", msgBody);
            // 加签校验
            boolean isValid = DgPaySignUtils.verifySign(msgBody, PayCert.signSecret, sign);

            log.info("dougong pay mall webhook valid: {}", isValid);
            if (!isValid) {
                log.error("dougong pay sign err");
                return;
            }

            JSONObject body = JSON.parseObject(msgBody);
            // 获取事件类型
            String eventDefineNo = body.getString("event_define_no");

            String transStat = body.getString("trans_stat");
            log.info("dougong pay mall webhook transStat: {}", transStat);

            if (eventDefineNo.equals("refund.standard")) {
                // 退款
                doHandleRefund(body);
                return;
            }

            if (!transStat.equals("S")) {
                return;
            }

            String orderSn = body.getString("mer_ord_id");
            log.info("dougong pay mall webhook orderSn: {}", orderSn);

            boolean isMallOrder = false;
            if (StringUtils.hasText(orderSn)) {
                if (orderSn.startsWith("S") || orderSn.startsWith("E") || orderSn.startsWith("H") || orderSn.startsWith("X")) {
                    isMallOrder = true;
                }
            }

            String transAmt = body.getString("trans_amt");
            // 支付账单上的商户订单号
            String partyOrderId = body.getString("party_order_id");
            String outTransId = body.getString("out_trans_id");
            String remark = body.getString("remark");
            String hfSeqId = body.getString("hf_seq_id");

            Integer payType = null;
            String payChannel = null;

            Boolean isRefund = false;
            // 对不同的事件类型做业务处理 注：demo仅以三个支付事件类型作为参考，具体全部事件类型请参考webhooc文档
            switch (eventDefineNo) {
                case "pay.ali_js":
                    // 支付宝JS支付 相关业务处理
                    payType = 0;
                    payChannel = PayChannel.A_NATIVE;
                    break;
                case "pay.ali_qr":
                    // 支付宝正扫支付 相关业务处理
                    payType = 0;
                    payChannel = PayChannel.A_NATIVE;
                    break;
                case "pay.union_js":
                    // 银联JS支付 相关业务处理
                    payType = 0;
                    break;
                case "pay.wx_pub":
                    // 微信公众号支付
                    payType = 0;
                    payChannel = PayChannel.WX_WAP_SCAN;
                    break;
                case "pay.wx_lite":
                    // 微信小程序支付
                    payType = 1;
                    payChannel = PayChannel.WX_MINI;
                    break;
                case "pay.wx_scan":
                    // 终端微信正扫
                    payType = 0;
                    payChannel = PayChannel.WX_WAP_SCAN;
                    break;
                case "pay.ali_scan":
                    // 终端支付宝正扫
                    payType = 0;
                    payChannel = PayChannel.A_NATIVE;
                    break;
                default:
                    // 未知业务处理
                    payType = 0;
            }

            BigDecimal orderAmount = new BigDecimal(transAmt);

            // 品牌会员卡开卡单（C 开头）单独结算：CRM issue + 本地权益期
            if (StringUtils.hasText(orderSn) && brandCardPaymentService.isCardOrder(orderSn)) {
                brandCardPaymentService.handlePayCallback(orderSn, orderAmount, hfSeqId,
                        partyOrderId, outTransId, payType, payChannel);
                return;
            }

            if (isMallOrder) {
                Map<String, Object> paramMap = new HashMap<>();
                paramMap.put("mchOrderNo", orderSn);
                paramMap.put("amount", orderAmount.multiply(BigDecimal.valueOf(100)).setScale(0, RoundingMode.HALF_UP).toString());

                // partyOrderId;
                // outTransId
                paramMap.put("outTransId", outTransId);
                paramMap.put("partyOrderId", partyOrderId);
                paramMap.put("hfSeqId", hfSeqId);
                paramMap.put("merOrdId", orderSn);
                paramMap.put("payType", payType);
                paramMap.put("payChannel", payChannel);

                // 处理订单成功
                orderService.handlePaySuccess(paramMap);
            } else {
                // 线下台牌 支付成功
                // 台牌id
                String devsId = body.getString("devs_id");
                // 商户名称
                String merName = body.getString("mer_name");
                // 手续费
                BigDecimal fee = body.getBigDecimal("fee_amount");
                String merOrdId = body.getString("mer_ord_id");
                String transType = body.getString("trans_type");

                JSONObject transOrderInfo = body.getJSONObject("trans_order_info");
                Long channelFinishTime = null;
                if (transOrderInfo != null) {
                    channelFinishTime = transOrderInfo.getLong("channel_finish_time");
                } else {
                    channelFinishTime = new Date().getTime();
                }
                JSONObject wxResponse = body.getJSONObject("wx_response");
                if (wxResponse != null) {
                    String openid = wxResponse.getString("sub_openid");
                }

                JSONObject alipayResponse = body.getJSONObject("alipay_response");
                if (alipayResponse != null) {
                    // 支付宝用户id
                    String aliPayId = alipayResponse.getString("buyer_id");
                    // 支付宝账号
                    String aliPayLogonId = alipayResponse.getString("buyer_logon_id");
                }
            }
        } catch (Exception e) {
            e.printStackTrace();
            throw new RuntimeException("dougong pay mall webhook err");
        }
    }

    /**
     * 读取原始请求体（UTF-8），不使用 @RequestBody，避免 form 参数解析提前消费 body。
     */
    private String readRequestBody(HttpServletRequest request) throws IOException {
        try (InputStream in = request.getInputStream()) {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buffer = new byte[4096];
            int len;
            while ((len = in.read(buffer)) != -1) {
                out.write(buffer, 0, len);
            }
            return new String(out.toByteArray(), StandardCharsets.UTF_8);
        }
    }

    /**
     * 仅用于日志排查的请求体摘要，不输出原文。
     */
    private static String digest16(String value) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256")
                    .digest(value.getBytes(StandardCharsets.UTF_8));
            StringBuilder builder = new StringBuilder();
            for (int i = 0; i < 8; i++) {
                builder.append(String.format("%02x", digest[i]));
            }
            return builder.toString();
        } catch (Exception e) {
            return "-";
        }
    }

    /**
     * 汇付斗拱 v2 通知（form-urlencoded）：用平台公钥验证 resp_data 的 SHA256WithRSA 签名，
     * 再只结算品牌会员卡（C 开头）通知；商城订单继续走原 JSON 回调，避免改变既有线上行为。
     */
    private void handleFormNotify(String msgBody) {
        JSONObject payload = DgPayNotifyParser.verifyAndParse(msgBody,
                PayCert.payPubKey, PayCert.payPubKey1, PayCert.payPubKey2, PayCert.payPubKey3);
        if (payload == null) {
            int len = msgBody == null ? -1 : msgBody.length();
            log.error("dougong form notify sign err, len={}, sha={}", len, digest16(msgBody));
            return;
        }
        String merOrdId = payload.getString("mer_ord_id");
        String orgReqSeqId = payload.getString("org_req_seq_id");
        String transStat = payload.getString("trans_stat");
        String hfSeqId = payload.getString("hf_seq_id");

        // 退款通知：原支付请求流水在 org_req_seq_id
        if (StringUtils.hasText(orgReqSeqId) && brandCardPaymentService.isCardOrder(orgReqSeqId)) {
            brandCardPaymentService.handleRefundCallback(orgReqSeqId,
                    payload.getBigDecimal("ord_amt"), hfSeqId, transStat,
                    payload.getString("bank_message"));
            log.info("dougong form refund notify handled, ref={}, transStat={}", orgReqSeqId, transStat);
            return;
        }

        if (StringUtils.hasText(merOrdId) && brandCardPaymentService.isCardOrder(merOrdId)) {
            if (!"S".equals(transStat) || !"00000000".equals(payload.getString("resp_code"))) {
                log.warn("dougong form pay notify not success, merOrdId={}, transStat={}, respCode={}",
                        merOrdId, transStat, payload.getString("resp_code"));
                return;
            }
            Integer payType = 1;
            String payChannel = PayChannel.WX_MINI;
            if (!"T_MINIAPP".equals(payload.getString("trade_type"))) {
                payType = 0;
                payChannel = PayChannel.WX_WAP_SCAN;
            }
            brandCardPaymentService.handlePayCallback(merOrdId,
                    payload.getBigDecimal("trans_amt"), hfSeqId,
                    payload.getString("party_order_id"), payload.getString("out_trans_id"),
                    payType, payChannel);
            log.info("dougong form pay notify handled, merOrdId={}, hfSeqId={}", merOrdId, hfSeqId);
            return;
        }
        log.info("dougong form notify ignored (not brand card), merOrdId={}", merOrdId);
    }

    private void doHandleRefund(JSONObject body) {
        String refundOrderSn = body.getString("org_req_seq_id");
        BigDecimal refundAmount = body.getBigDecimal("ord_amt");
        String bankMessage = body.getString("bank_message");
        String hfSeqId = body.getString("hf_seq_id");
        String remark = body.getString("remark");

        String transStat = body.getString("trans_stat");

        if (!"S".equals(transStat) && !"F".equals(transStat)) {
            return;
        }

        refundOrderSn = cleanOrderSn(refundOrderSn);

        // 品牌会员卡退款（C 开头）单独对账，不能按商城订单处理
        String cardRef = StringUtils.hasText(remark) ? remark : refundOrderSn;
        if (StringUtils.hasText(cardRef) && brandCardPaymentService.isCardOrder(cardRef)) {
            brandCardPaymentService.handleRefundCallback(cardRef, refundAmount, hfSeqId,
                    transStat, bankMessage);
            return;
        }

        Order order = orderService.getByOrderSn(remark);

        if (order != null) {
            log.debug("refund orderId = {}", order.getId());
            orderService.handleRefundNotify2(remark, hfSeqId, refundAmount, transStat, bankMessage);
        }else{//解决分单退款的问题
        }
        log.debug("refund finish");
    }

    /*    */

    /**
     * notify_url对应回调， 调用不传notify_url 此接口无调用
     *
     * @param orderId
     * @param
     *//*
    @RequestMapping("refund/notify")
    public void handleRefundNotify(@RequestParam Long orderId,
                                   @RequestParam String sign) {
        try {
            log.debug("订单退款 Notify: orderId={}", orderId);
            log.debug("订单退款 Notify: sign={}", sign);

            boolean isValid = payService.validRefundSign(orderId, sign);
            if (!isValid) {
                log.error("订单退款 签名校验异常: orderId = {}, sign={}", orderId, sign);
                return;
            }
            orderService.handleRefundNotify(orderId);
        } catch (Exception e) {
            e.printStackTrace();
        }
    }*/
    @GetMapping("/test")
    public void testRefund(@RequestParam Long orderId) {
        // TODO 隐藏
//        orderService.refundOrder(orderId, BigDecimal.valueOf(0.05));
//        orderService.refundOrder(null, BigDecimal.valueOf(0.05));
//        Order order = orderService.getById(orderId);
//        orderService.afterOrderPaid(order);
        System.out.println("test");
    }


    @PostMapping("/wxWapPay")
    public CommonResult<Object> genWxPay(@RequestParam String orderSn,
                                         @RequestParam String openId) {
        orderSn = cleanOrderSn(orderSn);

        Order order = orderService.getDougongWapPayOrder(orderSn);
        if (StringUtils.isEmpty(openId)) {
            throw new ApiException("获取微信授权失败");
        }

        // 临时替换支付方式， 直接生成公众号支付参数
        order.setPayChannel(PayChannel.WX_WAP_PAY);
        Map<String, String> map = payService.generatePay(order, openId, order.getProductTitle());
        return CommonResult.success(map);
    }

    private static final List<String> allowChannel = Arrays.asList(
            PayChannel.A_NATIVE,
            PayChannel.WX_WAP_SCAN
    );

    @GetMapping("/pay/code")
    public void genAliNativePay(@RequestParam String orderSn,
                                @RequestParam String payChannel,
                                HttpServletResponse response) throws IOException {
        orderSn = cleanOrderSn(orderSn);

        if (!allowChannel.contains(payChannel)) {
            throw new ApiException("暂不支持当前支付方式");
        }
        Order order = orderService.getDougongWapPayOrder(orderSn);
        String lockKey = "orderLock:" + order.getId();
        synchronized (lockKey.intern()) {
            order = orderService.getDougongWapPayOrder(orderSn);

            // 临时替换支付方式， 直接生成支付参数
            order.setPayChannel(payChannel);
            String codeUrl = null;
            Object code = redisService.get(payChannel + ":" + orderSn + "+" + order.getPayAmount());
            if (code != null) {
                codeUrl = code.toString();
            }
            if (codeUrl == null) {
                Map<String, String> params = payService.generatePay(order, null, order.getProductTitle());

                codeUrl = params.get("qrcode");
                redisService.set(PayChannel.A_NATIVE + ":" + orderSn + "+" + order.getPayAmount(), codeUrl, 3600);
            }

            //        String codeUrl = "https://qr.alipay.com/bax00990tv4j7w7ysrcj00d6";
            //        String codeUrl = "https://manage.fullytherapy.com/wxWapPay/wx.html";

            ServletOutputStream out = response.getOutputStream();
            response.setContentType("image/png");

            try {
                genQrCode(payChannel, codeUrl, out, false);
            } catch (WriterException e) {
                throw new ApiException("二维码生成失败");
            }
        }
    }

    /**
     * 生成二维码
     *
     * @param channel 支付渠道
     * @param txt     文本
     * @param out     输出流
     * @param addLogo 是否加logo
     * @throws WriterException
     * @throws IOException
     */
    private void genQrCode(String channel, String txt, OutputStream out, Boolean addLogo) throws WriterException, IOException {
        QRCodeWriter qrCodeWriter = new QRCodeWriter();
        // 设置编码参数
        Map<EncodeHintType, Object> hints = new HashMap<>();
        hints.put(EncodeHintType.CHARACTER_SET, "UTF-8"); // 字符编码
        hints.put(EncodeHintType.MARGIN, 0); // 边距，最小为0
        hints.put(EncodeHintType.ERROR_CORRECTION, ErrorCorrectionLevel.H); // 容错级别（L/M/Q/H）

        final int width = 300, height = 300;
        // 生成BitMatrix（二维码的矩阵表示）
        BitMatrix bitMatrix = qrCodeWriter.encode(txt, BarcodeFormat.QR_CODE, width, height, hints);

        MatrixToImageConfig config = new MatrixToImageConfig();
        if (PayChannel.A_NATIVE.equals(channel)) {
            config = new MatrixToImageConfig();
        }
        if (addLogo) {
            byte[] bytes = Base64.getDecoder().decode(logoStr.getBytes());
            BufferedImage logo = ImageIO.read(new ByteArrayInputStream(bytes));
            BufferedImage qrImage = MatrixToImageWriter.toBufferedImage(bitMatrix, config);
            Graphics2D graphics = qrImage.createGraphics();
            // 计算 Logo 位置（居中）
            int logoX = (width - logo.getWidth()) / 2;
            int logoY = (height - logo.getHeight()) / 2;
            graphics.drawImage(logo, logoX, logoY, null);
            ImageIO.write(qrImage, "PNG", out); // 重新写入流
        } else {
            MatrixToImageWriter.writeToStream(bitMatrix, "PNG", out, config);
        }
    }

    /**
     * 订单信息
     *
     * @param orderSn
     * @return
     */
    @GetMapping("/order/info")
    public CommonResult<Map<String, Object>> getDgPayOrder(@RequestParam String orderSn, @RequestParam String code) {
        orderSn = cleanOrderSn(orderSn);

        Order omsOrder = orderService.getByOrderSn(orderSn);
        if (omsOrder == null) {
            throw new ApiException("订单不存在");
        }
        String wxWpAppId = PayCert.wxWpAppId;
        String wapOpenId = payService.getWapOpenId(code);

        Map<String, Object> retMap = new HashMap<>();
        retMap.put("orderInfo", omsOrder);
        retMap.put("openId", wapOpenId);

        return CommonResult.success(retMap);
    }

    private String cleanOrderSn(String orderSn) {
        if (orderSn.contains("A")) {
            orderSn = orderSn.substring(0, orderSn.lastIndexOf("A"));
        }
        return orderSn;
    }
}
