package com.macro.mall.pay;

/**
 * Created by oahnus on 2025/7/7
 *
 * @author oahnus
 */
public class PayChannel {
    public static final String WX_MINI = "wx_mini";
    public static final String A_NATIVE = "a_native";
    public static final String WX_WAP_SCAN = "wx_wap_scan"; // 扫码支付
    // 微信wap支付，临时状态，只用于生成微信支付参数，不存储在数据库
    public static final String WX_WAP_PAY = "wx_wap_pay";
}
