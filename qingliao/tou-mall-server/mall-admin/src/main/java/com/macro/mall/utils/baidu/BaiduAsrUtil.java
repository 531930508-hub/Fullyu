package com.macro.mall.utils.baidu;

import com.alibaba.fastjson2.JSON;
import com.alibaba.fastjson2.JSONArray;
import com.alibaba.fastjson2.JSONObject;
import com.baomidou.mybatisplus.core.toolkit.Constants;
import com.google.common.primitives.Bytes;
import lombok.SneakyThrows;
import lombok.extern.slf4j.Slf4j;
import org.apache.commons.io.FileUtils;
import org.apache.logging.log4j.util.Strings;
import org.bytedeco.javacv.FFmpegFrameGrabber;
import org.bytedeco.javacv.Frame;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.multipart.MultipartFile;

import javax.net.ssl.HttpsURLConnection;
import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLConnection;
import java.net.URLDecoder;
import java.nio.Buffer;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.ShortBuffer;
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;
import java.util.UUID;

/**
 * 百度语音识别
 */
@Component
@Slf4j
public class BaiduAsrUtil {
    @Autowired
    private BaiduToken baiduToken;

    /**
     * 语音识别
     *
     * @param fileUrl 要识别的MP3文件完整地址
     * @return 识别的文本结果
     */
    public String discernByUrl(String fileUrl) {
        if (Strings.isBlank(fileUrl) || !fileUrl.startsWith("http")) {
            return null;
        }
        String[] split = fileUrl.split("\\?Expires=");
        fileUrl = split[0];
        File file = null;
        try {
            // 下载文件
            file = url2File(fileUrl);
            if (file == null) {
                return null;
            }
            // 转码
            // 识别
            String s = doDiscern(file.getPath());
            return s;
        } catch (Exception e) {
            log.error("语音文件识别失败：url={}", fileUrl);
            e.printStackTrace();
        } finally {
            if (file != null) {
                // 删除临时文件
                file.delete();
            }
        }
        return null;
    }

    /**
     * 语音识别
     *
     * @param file 需要识别的文件
     * @return 识别的文本结果
     */
    public String discernByFile(MultipartFile file) {
        File tempFile = null;
        try {
            tempFile = File.createTempFile(UUID.randomUUID().toString(), ".mp3");
            file.transferTo(tempFile);
            return doDiscern(tempFile.getPath());
        } catch (IOException e) {
            log.error("语音识别失败,message={}", e.getMessage());
            e.printStackTrace();
            return null;
        }
    }

    /**
     * @param tempFilePath 要识别的MP3文件路径
     * @return 识别的文本结果
     */
    private String doDiscern(String tempFilePath) {
        if (Strings.isBlank(tempFilePath)) {
            return null;
        }
        try {
            // 转码
            byte[] bytes = buildAndGetBytes(tempFilePath);
            // 获取token
            String accessToken = baiduToken.getToken();
            // 构造请求参数
            BaiduDiscernReqDto dto = new BaiduDiscernReqDto().setLen(bytes.length)
                    .setSpeech(Base64.getEncoder().encodeToString(bytes))
                    .setToken(accessToken).setCuid(System.currentTimeMillis() + "");
            String params = JSON.toJSONString(dto);
            String url = BaiduRequestUrl.DISCERN_URL;
            RestTemplate restTemplate = new RestTemplate();
            HttpHeaders headers = new HttpHeaders();
            MediaType type = MediaType.parseMediaType("application/json");
            headers.setContentType(type);
            headers.add("Accept", MediaType.APPLICATION_JSON.toString());
            HttpEntity<String> formEntity = new HttpEntity<String>(params, headers);
            String result = restTemplate.postForObject(url, formEntity, String.class);
            System.out.println(result);
            JSONObject resultObj = JSONObject.parseObject(result);
            if (isSuccess(resultObj)) {
                JSONArray textArray = resultObj.getJSONArray("result");
                if (textArray.size() > 0) {
                    return textArray.get(0).toString();
                }
            }
        } catch (Exception e) {
            log.error("语音识别出错，msg={}", e.getMessage());
            e.printStackTrace();
        }
        return null;
    }

    private static boolean isSuccess(JSONObject resultObject) {
        String errorCode = resultObject.getString("err_no");
        return "0".equals(errorCode);
    }

    public static void main(String[] args) {
        String utl = ""; // 调试用签名 URL 已移除，避免泄露 OSS AccessKey
//        String utl = "http://fullytherapy.oss-cn-hangzhou.aliyuncs.com/fully/file/voice/20250620/8adc3d6b-f98d-43cf-8f77-1bd451c07830(._.)tempVoice17504128368996263675350857755395.mp3";
        String[] split = utl.split("\\?Expires=");
        System.out.println(split[0]);
        System.out.println(split[1]);
//        File file = url2File(utl);
//        System.out.println(file.getPath());
    }

    /**
     * 通过url下载文件并转为字节数组
     *
     * @param urlStr
     * @return
     */
    @SneakyThrows
    public static File url2File(String urlStr) {
        InputStream inputStream = null;
        try {
            //url解码
            String decode = URLDecoder.decode(urlStr, Constants.UTF_8).replace(" ", "%20");
            URL url = new URL(decode);
            URLConnection connection;
            if (urlStr.contains("https")) {
                // 绕过https验证失效，改为http下载
                urlStr = urlStr.replace("https", "http");
                HttpsURLConnection conn = (HttpsURLConnection) url.openConnection();
                connection = conn;
            } else {
                HttpURLConnection conn = (HttpURLConnection) url.openConnection();
                connection = conn;
            }
            // 设置是否使用缓存
            connection.setUseCaches(true);
            //设置超时间为6秒
            connection.setConnectTimeout(6 * 1000);
            //防止屏蔽程序抓取而返回403错误
            connection.setRequestProperty("User-Agent", "Mozilla/4.0 (compatible; MSIE 5.0; Windows NT; DigExt)");
            // 连接
            connection.connect();
            //得到输入流
            inputStream = connection.getInputStream();
            // 存为临时文件
            File tempFile = File.createTempFile(System.currentTimeMillis() + "temp", ".mp3");
            FileUtils.copyInputStreamToFile(inputStream, tempFile);
//            return IOUtils.toByteArray(inputStream);
            return tempFile;
        } catch (IOException e) {
            e.printStackTrace();
            log.error("url转文件，下载失败,url={}", urlStr);
            return null;
        } finally {
            if (inputStream != null) {
                inputStream.close();
            }
        }
    }

    /**
     * 音频文件编码
     *
     * @param tempFilePath 文件完成路径
     * @return
     * @throws Exception
     */
    private byte[] buildAndGetBytes(String tempFilePath) {
        FFmpegFrameGrabber frameGrabber = null;
        List<Byte> bytesList = new ArrayList<>();
        try {
            frameGrabber = FFmpegFrameGrabber.createDefault(tempFilePath);
            // 16K赫兹采样率
            frameGrabber.setSampleRate(16000);
            // 单声道
            frameGrabber.setAudioChannels(1);
            frameGrabber.start();
            Frame frame;
            Buffer buffer;
            short[] shorts;
            byte[] bytes;
            while ((frame = frameGrabber.grabSamples()) != null) {
                if (frame.samples == null) {
                    continue;
                }
                buffer = frame.samples[0];
                shorts = new short[buffer.limit()];
                ((ShortBuffer) buffer).get(shorts);
                bytes = shortArr2byteArr(shorts, buffer.limit());
                List<Byte> byteList = Bytes.asList(bytes);
                bytesList.addAll(byteList);
            }
            // 直接关闭流
            frameGrabber.close();
        } catch (Exception e) {
            log.error("音频转码失败");
            e.printStackTrace();
        }
        return Bytes.toArray(bytesList);
    }

    /**
     * 8位字节数组转16位字节数组，也就是16位的采样位深，转小端点字节数组
     *
     * @param shortArr
     * @param shortArrLen
     * @return
     */
    private byte[] shortArr2byteArr(short[] shortArr, int shortArrLen) {
        byte[] byteArr = new byte[shortArrLen * 2];
        ByteBuffer.wrap(byteArr).order(ByteOrder.LITTLE_ENDIAN).asShortBuffer().put(shortArr);
        return byteArr;
    }
}
