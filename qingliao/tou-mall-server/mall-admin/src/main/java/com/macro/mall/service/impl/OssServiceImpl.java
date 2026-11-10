package com.macro.mall.service.impl;

import cn.hutool.core.util.StrUtil;
import com.alibaba.fastjson2.JSONObject;
import com.aliyun.oss.HttpMethod;
import com.aliyun.oss.OSS;
import com.aliyun.oss.model.GeneratePresignedUrlRequest;
import com.macro.mall.common.exception.BusinessException;
import com.macro.mall.consts.NormalConst;
import com.macro.mall.service.OssService;
import com.macro.mall.utils.RedisUtil;
import org.apache.logging.log4j.util.Strings;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.File;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.file.Files;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.UUID;

/**
 * Oss对象存储管理Service实现类
 * Created by macro on 2018/5/17.
 */
@Service
public class OssServiceImpl implements OssService {

    private static final Logger LOGGER = LoggerFactory.getLogger(OssServiceImpl.class);
    @Value("${aliyun.oss.policy.expire}")
    private int ALIYUN_OSS_EXPIRE;
    @Value("${aliyun.oss.maxSize}")
    private int ALIYUN_OSS_MAX_SIZE;
    @Value("${aliyun.oss.callback}")
    private String ALIYUN_OSS_CALLBACK;
    @Value("${aliyun.oss.bucketName}")
    private String OSS_BUCKET_NAME;
    @Value("${aliyun.oss.endpoint}")
    private String ALIYUN_OSS_ENDPOINT;
    @Value("${aliyun.oss.dir.prefix}")
    private String OSS_DIR_PREFIX;

    @Autowired
    private OSS ossClient;

    @Autowired
    RedisUtil redisUtil;

    /**
     * 签名生成
     */
    /*@Override
    public OssPolicyResult policy() {
        OssPolicyResult result = new OssPolicyResult();
        // 存储目录
        SimpleDateFormat sdf = new SimpleDateFormat("yyyyMMdd");
        String dir = ALIYUN_OSS_DIR_PREFIX + sdf.format(new Date());
        // 签名有效期
        long expireEndTime = System.currentTimeMillis() + ALIYUN_OSS_EXPIRE * 1000;
        Date expiration = new Date(expireEndTime);
        // 文件大小
        long maxSize = ALIYUN_OSS_MAX_SIZE * 1024 * 1024;
        // 回调
        OssCallbackParam callback = new OssCallbackParam();
        callback.setCallbackUrl(ALIYUN_OSS_CALLBACK);
        callback.setCallbackBody("filename=${object}&size=${size}&mimeType=${mimeType}&height=${imageInfo.height}&width=${imageInfo.width}");
        callback.setCallbackBodyType("application/x-www-form-urlencoded");
        // 提交节点
        String action = "http://" + ALIYUN_OSS_BUCKET_NAME + "." + ALIYUN_OSS_ENDPOINT;
        try {
            PolicyConditions policyConds = new PolicyConditions();
            policyConds.addConditionItem(PolicyConditions.COND_CONTENT_LENGTH_RANGE, 0, maxSize);
            policyConds.addConditionItem(MatchMode.StartWith, PolicyConditions.COND_KEY, dir);
            String postPolicy = ossClient.generatePostPolicy(expiration, policyConds);
            byte[] binaryData = postPolicy.getBytes("utf-8");
            String policy = BinaryUtil.toBase64String(binaryData);
            String signature = ossClient.calculatePostSignature(postPolicy);
            String callbackData = BinaryUtil.toBase64String(JSONUtil.parse(callback).toString().getBytes("utf-8"));
            // 返回结果
            result.setAccessKeyId(ossClient.getCredentialsProvider().getCredentials().getAccessKeyId());
            result.setPolicy(policy);
            result.setSignature(signature);
            result.setDir(dir);
            //result.setCallback(callbackData);
            result.setHost(action);
        } catch (Exception e) {
            LOGGER.error("签名生成失败", e);
        }
        return result;
    }*/

/*    @Override
    public OssCallbackResult callback(HttpServletRequest request) {
        OssCallbackResult result = new OssCallbackResult();
        String filename = request.getParameter("filename");
        filename = "http://".concat(ALIYUN_OSS_BUCKET_NAME).concat(".").concat(ALIYUN_OSS_ENDPOINT).concat("/").concat(filename);
        result.setFilename(filename);
        result.setSize(request.getParameter("size"));
        result.setMimeType(request.getParameter("mimeType"));
        result.setWidth(request.getParameter("width"));
        result.setHeight(request.getParameter("height"));
        return result;
    }*/

    //使用预签名URL上传文件
    @Override
    public JSONObject generatePreSignedUrl(String fileName, String prefix) {
        // 存储目录
        SimpleDateFormat sdf = new SimpleDateFormat("yyyyMMdd");
        String ossDirPrefix = OSS_DIR_PREFIX;
        if (StrUtil.isNotBlank(prefix)) {
            ossDirPrefix = ossDirPrefix + prefix + "/";
        }
        String dir = ossDirPrefix + sdf.format(new Date());
        // 签名有效期 30分钟
        Date expiration = new Date(System.currentTimeMillis() + 30 * 60 * 1000);
        // 生成带签名的URL
        String fileKey = dir + "/" + UUID.randomUUID().toString() + NormalConst.FILE_NAME_SPLIT + fileName; // 与上传时的dir保持一致
        GeneratePresignedUrlRequest request = new GeneratePresignedUrlRequest(OSS_BUCKET_NAME, fileKey, HttpMethod.PUT);
        request.setExpiration(expiration);
        request.setContentType("application/octet-stream");
        URL url = ossClient.generatePresignedUrl(request);
        // 返回结果
        JSONObject result = new JSONObject();
        result.put("url", url.toString());
        result.put("expireTime", expiration.toString());
        result.put("key", fileKey);
        return result;

    }

    public JSONObject generatePreSigneImagedUrl(String fileName) {
        // 签名有效期 30分钟
        Date expiration = new Date(System.currentTimeMillis() + 30 * 60 * 1000);
        // 生成带签名的URL
        String fileKey ="customerQrImg/" +  fileName; // 与上传时的dir保持一致
        GeneratePresignedUrlRequest request = new GeneratePresignedUrlRequest(OSS_BUCKET_NAME, fileKey, HttpMethod.PUT);
        request.setExpiration(expiration);
        request.setContentType("image/png");
        URL url = ossClient.generatePresignedUrl(request);
        // 返回结果
        JSONObject result = new JSONObject();
        result.put("url", url.toString());
        result.put("expireTime", expiration.toString());
        result.put("key", fileKey);
        return result;

    }

    public String getFinalUrl(String key) {
        return doGetFinalUrl(key, 30);
    }

    private String generateFinalUrl(String fileKey, Long expire) {
        // 设置预签名URL过期时间
        Date expiration = new Date(new Date().getTime() + expire);
        URL url = ossClient.generatePresignedUrl(OSS_BUCKET_NAME, fileKey, expiration);
        System.out.println(url);
        return url.toString();
    }

    private String doGetFinalUrl(String key, int expireDay) {
        if (Strings.isBlank(key)) {
            return null;
        }
        if (key.startsWith("http")) {
            return key;
        }
        StringBuilder builder = new StringBuilder();
        if (!key.contains("http")) {
            builder.append(OSS_BUCKET_NAME);
            builder.append("/");
        }
        builder.append(key);
        String baseUrl = "file:" + builder.toString();
        String finalUrl = redisUtil.getString(baseUrl);
        if (Strings.isNotBlank(finalUrl)) {
            return finalUrl;
        }
        // 过期豪秒数
        Long expire = expireDay * 24 * 60 * 60 * 1000L;
        finalUrl = generateFinalUrl(key, expire);
        redisUtil.setStringDay(baseUrl, finalUrl, expireDay);
        return finalUrl;
    }


    public String uploadFile(File file, String prefix) {
        JSONObject jsonObject = generatePreSignedUrl(file.getName(), prefix);
        String key = jsonObject.getString("key");
        String url = jsonObject.getString("url");
        String expireTime = jsonObject.getString("expireTime");
        uploadFile(url, file,"application/octet-stream");
        System.out.println("key::");
        System.out.println(key);
        return key;
    }

    public String uploadImage(File file) {
        JSONObject jsonObject = generatePreSigneImagedUrl(file.getName());
        String key = jsonObject.getString("key");
        String url = jsonObject.getString("url");
        uploadFile(url, file,"image/png");
        return key;
    }

    private static void uploadFile(String signedUrl, File file,String contentType) {
        HttpURLConnection connection = null;
        try {
            URL url = new URL(signedUrl);
            connection = (HttpURLConnection) url.openConnection();
            connection.setDoOutput(true);
            connection.setRequestMethod("PUT");
            connection.setRequestProperty("Content-Type", contentType);
            long fileSize = file.length();
            if (fileSize > 0) {
                connection.setFixedLengthStreamingMode(fileSize);
            } else {
                connection.setChunkedStreamingMode(0);
            }
            try (OutputStream out = connection.getOutputStream();
                 InputStream in = Files.newInputStream(file.toPath())) {
                byte[] buffer = new byte[8192];
                int bytesRead;
                while ((bytesRead = in.read(buffer)) != -1) {
                    out.write(buffer, 0, bytesRead);
                }
            }
            int statusCode = connection.getResponseCode();
            System.out.println("返回上传状态码：" + statusCode);
            if (statusCode == HttpURLConnection.HTTP_OK) {
                System.out.println("使用网络库上传成功");
            }
        } catch (Exception error) {
            throw new BusinessException("上传文件出现问题，文件上传失败");
        } finally {
            if (connection != null) {
                connection.disconnect();
            }
        }
    }
}
