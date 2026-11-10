package com.macro.mall.utils.baidu;

import com.alibaba.fastjson2.JSON;
import com.alibaba.fastjson2.JSONObject;
import com.macro.mall.common.exception.BusinessException;
import com.macro.mall.utils.RedisUtil;
import lombok.extern.slf4j.Slf4j;
import org.apache.logging.log4j.util.Strings;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.List;
import java.util.Map;

@Component
@Slf4j
public class BaiduToken {
    @Value("${baidu.voice.appId}")
    private String appId;
    @Value("${baidu.voice.apiKey}")
    private String apiKey;
    @Value("${baidu.voice.secretKey}")
    private String secretKey;
    @Autowired
    RedisUtil redisUtil;

    /**
     * 获取token
     *
     * @return
     */
    public String getToken() {
        String tokenKey = "baiduToken:"+appId;
        String token = redisUtil.getString(tokenKey);
        if (Strings.isNotBlank(token)) {
            return token;
        }
        StringBuilder urlBuilder = new StringBuilder(BaiduRequestUrl.TOKEN_URL);
        urlBuilder.append("?grant_type=client_credentials");
        urlBuilder.append("&client_id=");
        urlBuilder.append(apiKey);
        urlBuilder.append("&client_secret=");
        urlBuilder.append(secretKey);
        String getAccessTokenUrl = urlBuilder.toString();
        try {
            URL realUrl = new URL(getAccessTokenUrl);
            HttpURLConnection connection = (HttpURLConnection) realUrl.openConnection();
            connection.setRequestMethod("GET");
            connection.connect();
            // 获取所有响应头字段
            Map<String, List<String>> map = connection.getHeaderFields();
            // 定义 BufferedReader输入流来读取URL的响应
            BufferedReader in = new BufferedReader(new InputStreamReader(connection.getInputStream()));
            String result = "";
            String line;
            while ((line = in.readLine()) != null) {
                result += line;
            }
            JSONObject jsonObject = JSON.parseObject(result);
            token = jsonObject.getString("access_token");
            if (Strings.isBlank(token)) {
                throw new BusinessException("获取token失败！");
            }
            redisUtil.setStringDay(tokenKey, token, 30);
        } catch (Exception e) {
            e.printStackTrace(System.err);
            log.error("获取token失败，appid={},msg={}", appId, e.getMessage());
            throw new BusinessException("获取token失败！");
        }
        return token;
    }
}
