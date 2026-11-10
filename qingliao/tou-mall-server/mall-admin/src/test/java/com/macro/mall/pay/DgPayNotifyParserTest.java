package com.macro.mall.pay;

import com.alibaba.fastjson2.JSONObject;
import com.huifu.bspay.sdk.opps.core.utils.RsaUtils;
import org.junit.jupiter.api.Test;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

/**
 * 汇付斗拱异步通知（form-urlencoded + SHA256WithRSA）解析与验签测试。
 */
public class DgPayNotifyParserTest {

    private static String encode(String value) {
        try {
            return URLEncoder.encode(value, "UTF-8");
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    @Test
    public void parsesSignedFormNotify() throws Exception {
        Map<String, String> keyPair = RsaUtils.generateKeyPair(2048);
        String respData = "{\"mer_ord_id\":\"C202611090043029009A558\",\"trans_stat\":\"S\","
                + "\"trans_amt\":\"0.01\",\"hf_seq_id\":\"HF001\"}";
        String sign = RsaUtils.sign(respData, keyPair.get(RsaUtils.RSA_PRIVATE_KEY));
        String body = "resp_desc=" + encode("交易成功") + "&resp_code=00000000&sign=" + encode(sign)
                + "&resp_data=" + encode(respData);

        JSONObject payload = DgPayNotifyParser.verifyAndParse(body,
                keyPair.get(RsaUtils.RSA_PUBLIC_KEY));

        assertNotNull(payload);
        assertEquals("C202611090043029009A558", payload.getString("mer_ord_id"));
        assertEquals("0.01", payload.getString("trans_amt"));
    }

    @Test
    public void rejectsTamperedRespData() throws Exception {
        Map<String, String> keyPair = RsaUtils.generateKeyPair(2048);
        String respData = "{\"mer_ord_id\":\"C1\",\"trans_stat\":\"S\",\"trans_amt\":\"0.01\"}";
        String sign = RsaUtils.sign(respData, keyPair.get(RsaUtils.RSA_PRIVATE_KEY));
        String tampered = "{\"mer_ord_id\":\"C1\",\"trans_stat\":\"S\",\"trans_amt\":\"299.00\"}";
        String body = "resp_code=00000000&sign=" + encode(sign) + "&resp_data=" + encode(tampered);

        assertNull(DgPayNotifyParser.verifyAndParse(body, keyPair.get(RsaUtils.RSA_PUBLIC_KEY)));
    }

    @Test
    public void rejectsWhenNoKeyMatches() throws Exception {
        Map<String, String> keyPair = RsaUtils.generateKeyPair(2048);
        Map<String, String> other = RsaUtils.generateKeyPair(2048);
        String respData = "{\"mer_ord_id\":\"C1\"}";
        String sign = RsaUtils.sign(respData, keyPair.get(RsaUtils.RSA_PRIVATE_KEY));
        String body = "resp_code=00000000&sign=" + encode(sign) + "&resp_data=" + encode(respData);

        assertNull(DgPayNotifyParser.verifyAndParse(body, other.get(RsaUtils.RSA_PUBLIC_KEY)));
    }

    @Test
    public void toleratesTrailingWhitespace() throws Exception {
        Map<String, String> keyPair = RsaUtils.generateKeyPair(2048);
        String respData = "{\"mer_ord_id\":\"C1\"}";
        String sign = RsaUtils.sign(respData, keyPair.get(RsaUtils.RSA_PRIVATE_KEY));
        String body = "resp_code=00000000&sign=" + encode(sign) + "&resp_data=" + encode(respData) + "\n";

        assertNotNull(DgPayNotifyParser.verifyAndParse(body, keyPair.get(RsaUtils.RSA_PUBLIC_KEY)));
    }

    @Test
    public void returnsNullForJsonOrMalformedBody() {
        assertNull(DgPayNotifyParser.verifyAndParse("{\"event_define_no\":\"pay.ali_js\"}", "any"));
        assertNull(DgPayNotifyParser.verifyAndParse("resp_code=00000000", "any"));
        assertNull(DgPayNotifyParser.verifyAndParse(null, "any"));
    }

    @Test
    public void decodesPlusAndChinese() throws Exception {
        Map<String, String> keyPair = RsaUtils.generateKeyPair(2048);
        String respData = "{\"mer_ord_id\":\"C1\",\"bank_message\":\"交易成功\"}";
        String sign = RsaUtils.sign(respData, keyPair.get(RsaUtils.RSA_PRIVATE_KEY));
        // URLEncoder 会把空格编码成 +，解析端必须按 form 规则还原
        String body = "resp_code=00000000&resp_desc=交易+成功&sign=" + encode(sign)
                + "&resp_data=" + encode(respData);
        JSONObject payload = DgPayNotifyParser.verifyAndParse(body,
                keyPair.get(RsaUtils.RSA_PUBLIC_KEY));
        assertNotNull(payload);
        assertEquals("交易成功", payload.getString("bank_message"));
    }
}
