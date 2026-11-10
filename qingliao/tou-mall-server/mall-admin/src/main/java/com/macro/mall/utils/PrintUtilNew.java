package com.macro.mall.utils;

import java.io.IOException;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;

import lombok.extern.slf4j.Slf4j;
import org.apache.commons.codec.digest.DigestUtils;
import org.apache.http.HttpEntity;
import org.apache.http.NameValuePair;
import org.apache.http.client.ClientProtocolException;
import org.apache.http.client.config.RequestConfig;
import org.apache.http.client.entity.UrlEncodedFormEntity;
import org.apache.http.client.methods.*;
import org.apache.http.client.utils.URLEncodedUtils;
import org.apache.http.impl.client.CloseableHttpClient;
import org.apache.http.impl.client.HttpClients;
import org.apache.http.message.BasicNameValuePair;
import org.apache.http.util.EntityUtils;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

@Component
public class PrintUtilNew {
    public static final String baseUri = "https://open.spyun.net/v1/";

    private String appid = com.macro.mall.common.utils.Env.get("PRINT_APPID");
    private String appsecret = com.macro.mall.common.utils.Env.get("PRINT_APPSECRET");

/*    public PrintUtilNew(String appid, String appsecret) {
        this.appid = appid;
        this.appsecret = appsecret;
    }*/
    // 添加打印机
    public String addPrinter(String sn, String pkey, String name) throws IOException {
        ArrayList<NameValuePair> params = new ArrayList<>();
        params.add(new BasicNameValuePair("sn", sn));
        params.add(new BasicNameValuePair("pkey", pkey));
        params.add(new BasicNameValuePair("name", name));

        return request("POST", "printer/add", params);
    }

    // 删除打印机
    public String deletePrinter(String sn) throws IOException {
        ArrayList<NameValuePair> params = new ArrayList<>();
        params.add(new BasicNameValuePair("sn", sn));

        return request("DELETE", "printer/delete", params);
    }

    // 修改打印机信息
    public String updatePrinter(String sn, String name) throws IOException {
        ArrayList<NameValuePair> params = new ArrayList<>();
        params.add(new BasicNameValuePair("sn", sn));
        params.add(new BasicNameValuePair("name", name));

        return request("PATCH", "printer/update", params);
    }

    // 修改打印机参数
    public String updatePrinterSetting(String sn, int auto_cut, String voice) throws IOException {
        ArrayList<NameValuePair> params = new ArrayList<>();
        params.add(new BasicNameValuePair("sn", sn));
        params.add(new BasicNameValuePair("auto_cut", String.valueOf(auto_cut)));
        params.add(new BasicNameValuePair("voice", voice));

        return request("PATCH", "printer/setting", params);
    }

    // 获取打印机信息
    public String getPrinter(String sn) throws IOException {
        ArrayList<NameValuePair> params = new ArrayList<>();
        params.add(new BasicNameValuePair("sn", sn));

        return request("GET", "printer/info", params);
    }

    // 打印订单
    public String print(String sn, String content, int times) throws IOException {
        ArrayList<NameValuePair> params = new ArrayList<>();
        params.add(new BasicNameValuePair("sn", sn));
        params.add(new BasicNameValuePair("content", content));
        params.add(new BasicNameValuePair("times", String.valueOf(times)));

        return request("POST", "printer/print", params);
    }

    // 清空待打印订单
    public String deletePrints(String sn) throws IOException {
        ArrayList<NameValuePair> params = new ArrayList<>();
        params.add(new BasicNameValuePair("sn", sn));

        return request("DELETE", "printer/cleansqs", params);
    }

    // 查询打印订单状态
    public String getPrintsStatus(String id) throws IOException {
        ArrayList<NameValuePair> params = new ArrayList<>();
        params.add(new BasicNameValuePair("id", id));

        return request("GET", "printer/order/status", params);
    }

    // 查询打印机历史打印订单数
    public String getPrintsOrders(String sn, String date) throws IOException {
        ArrayList<NameValuePair> params = new ArrayList<>();
        params.add(new BasicNameValuePair("sn", sn));
        params.add(new BasicNameValuePair("date", date));

        return request("GET", "printer/order/number", params);
    }

    // 发送请求
    private String request(String method, String uri, ArrayList<NameValuePair> params) throws IOException {
        RequestConfig requestConfig = RequestConfig.custom()
                .setSocketTimeout(4000)    //读取超时
                .setConnectTimeout(1000)   //连接超时
                .build();

        CloseableHttpClient httpClient = HttpClients.custom()
                .setDefaultRequestConfig(requestConfig)
                .build();

        // 公共请求参数
        params.add(new BasicNameValuePair("appid", appid));
        params.add(new BasicNameValuePair("timestamp", String.valueOf(System.currentTimeMillis() / 1000)));
        params.add(new BasicNameValuePair("sign", makeSign(params)));

        CloseableHttpResponse response = null;
        String url = baseUri + uri;
        if (method.equals("GET")) {
            HttpGet request = new HttpGet(url + "?" + URLEncodedUtils.format(params, "utf-8"));
            response = httpClient.execute(request);
        } else if (method.equals("DELETE")) {
            HttpDelete request = new HttpDelete(url + "?" + URLEncodedUtils.format(params, "utf-8"));
            response = httpClient.execute(request);
        } else if (method.equals("POST")) {
            HttpPost request = new HttpPost(url);
            request.setEntity(new UrlEncodedFormEntity(params,"utf-8"));
            response = httpClient.execute(request);
        } else if (method.equals("PATCH")) {
            HttpPatch request = new HttpPatch(url);
            request.setEntity(new UrlEncodedFormEntity(params,"utf-8"));
            response = httpClient.execute(request);
        } else if (method.equals("PUT")) {
            HttpPut request = new HttpPut(url);
            request.setEntity(new UrlEncodedFormEntity(params,"utf-8"));
            response = httpClient.execute(request);
        }

        if (response == null) {
            throw new ClientProtocolException();
        }

        HttpEntity httpEntity = response.getEntity();
        if (httpEntity == null) {
            throw new ClientProtocolException();
        }

        if (response.getStatusLine().getStatusCode() != 200) {
            throw new ClientProtocolException(EntityUtils.toString(httpEntity));
        }

        return EntityUtils.toString(httpEntity);
    }

    // 创建签名
    public String makeSign(ArrayList<NameValuePair> params) {
        int size = params.size();
        String[] keys = new String[params.size()];
        HashMap<String, String> values = new HashMap<>();
        for (int i = 0; i < size; i++) {
            NameValuePair p = params.get(i);
            keys[i] = p.getName();
            values.put(p.getName(), p.getValue());
        }
        Arrays.sort(keys);

        String sign = "";
        for (int i = 0; i < keys.length; i++) {
            String v = values.get(keys[i]);
            if (!keys[i].equals("sign") && !keys[i].equals("appsecret") && !v.equals("")) {
                if (i > 0) {
                    sign += "&";
                }
                sign += keys[i] + "=" + v;
            }
        }
        sign += "&appsecret=" + appsecret;

        return DigestUtils.md5Hex(sign).toUpperCase();
    }
}
