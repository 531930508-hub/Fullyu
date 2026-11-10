package com.macro.mall.utils;

import com.macro.mall.common.exception.BusinessException;
import com.macro.mall.entity.Order;
import com.macro.mall.enums.OrderPayType;
import com.macro.mall.service.shop.ShopService;
import lombok.extern.slf4j.Slf4j;
import org.apache.commons.codec.digest.DigestUtils;
import org.apache.http.HttpEntity;
import org.apache.http.NameValuePair;
import org.apache.http.client.config.RequestConfig;
import org.apache.http.client.entity.UrlEncodedFormEntity;
import org.apache.http.client.methods.CloseableHttpResponse;
import org.apache.http.client.methods.HttpPost;
import org.apache.http.impl.client.CloseableHttpClient;
import org.apache.http.impl.client.HttpClients;
import org.apache.http.message.BasicNameValuePair;
import org.apache.http.util.EntityUtils;
import org.apache.logging.log4j.util.Strings;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.text.DecimalFormat;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

/**
 * @author HeDaJiang
 * @date 2025/6/12
 */
@Component
@Slf4j
public class PrintUtil {
    private static final String baseUrl = "http://api.feieyun.cn/Api/Open/";
    @Value("${print.user}")
    private String user;
    @Value("${print.ukey}")
    private String ukey;
    @Value("${print.sn}")
    private String sn;

    @Autowired
    ShopService shopService;

    /**
     * 根据订单打印小票（订单编号、总金额、关联门店）
     *
     * @param order
     */
    public String printOrder(Order order) {
        LocalDateTime now = LocalDateTime.now();
        StringBuilder builder = new StringBuilder();
        builder.append("<C>（人广来福士店）</C><BR>");
        builder.append("<C>地址：上海市西藏中路268号5层-11</C><BR>");
        builder.append("<CB>收银单</CB><BR>");
        builder.append("交易编号：");
        builder.append(order.getCode());
        builder.append("<BR>交易日期：");
        builder.append(DateUtil.formatYYYYMMDD2(order.getPayTime()));
        builder.append("<BR>服务明细：");
        builder.append(order.getProductTitle());
        builder.append("<BR>服务时长：");
        builder.append(order.getDuration()+"min");
        builder.append("<BR>交易金额：");
        builder.append(new DecimalFormat("#.0").format(order.getPayAmount()));
        builder.append("元");
        builder.append("<BR>支付方式：");
        builder.append(OrderPayType.getLabel(order.getPayType()));
        builder.append("<BR>打印时间：");
        builder.append(DateUtil.toStandString(now));
        builder.append("<BR><BR><L>预约请关注微信公众号Full愈</L>");
        builder.append("<BR><BR>");
//        builder.append("<C><QR>https://mp.weixin.qq.com/mp/profile_ext?action=home&__biz=MzI3ODQ5ODQ2NA==</QR></C>");
        builder.append("<C><QR>http://weixin.qq.com/r/mp/jxYQCBjEIEVfrVxr90Od</QR></C>");
        builder.append("<BR>加入【上海来福士广场】微信，注册凯德星会员，上传小票即享积分兑换好礼");
        String s = builder.toString();
        print(s);
        return s;
    }

    /**
     * 执行小票打印
     *
     * @param printContent 打印内容
     * @return
     */
    private String print(String printContent) {
        if (Strings.isBlank(printContent)) {
            return null;
        }
        RequestConfig requestConfig = RequestConfig.custom()
                .setSocketTimeout(30000)
                .setConnectTimeout(30000)
                .build();
        CloseableHttpClient httpClient = HttpClients.custom()
                .setDefaultRequestConfig(requestConfig)
                .build();
        HttpPost post = new HttpPost(baseUrl);
        List<NameValuePair> nvps = new ArrayList<>();
        nvps.add(new BasicNameValuePair("user", user));
        String stime = String.valueOf(System.currentTimeMillis() / 1000);
        nvps.add(new BasicNameValuePair("stime", stime));
        nvps.add(new BasicNameValuePair("sig", DigestUtils.sha1Hex(user + ukey + stime)));
        nvps.add(new BasicNameValuePair("apiname", "Open_printMsg"));
        nvps.add(new BasicNameValuePair("sn", sn));
        nvps.add(new BasicNameValuePair("content", printContent));
        //打印联数
        nvps.add(new BasicNameValuePair("times", "1"));

        CloseableHttpResponse response = null;
        String result = null;
        try {
            post.setEntity(new UrlEncodedFormEntity(nvps, "utf-8"));
            response = httpClient.execute(post);
            int statecode = response.getStatusLine().getStatusCode();
            if (statecode == 200) {
                HttpEntity httpentity = response.getEntity();
                if (httpentity != null) {
                    result = EntityUtils.toString(httpentity);
                    log.info("打印小票结果；content={},result{}", printContent, result);
                }
            }
        } catch (Exception e) {
            log.error("打印小票失败,message={}", e.getMessage());
            e.printStackTrace();
            throw new BusinessException("打印小票失败：" + e.getMessage());
        } finally {
            try {
                if (response != null) {
                    response.close();
                }
            } catch (IOException e) {
                e.printStackTrace();
            }
            try {
                post.abort();
            } catch (Exception e) {
                e.printStackTrace();
            }
            try {
                httpClient.close();
            } catch (IOException e) {
                e.printStackTrace();
            }
        }
        return result;
    }
}
