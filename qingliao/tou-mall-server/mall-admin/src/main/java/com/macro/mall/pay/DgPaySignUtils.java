package com.macro.mall.pay;

import java.security.MessageDigest;
import java.util.HashMap;
import java.util.Map;

/**
 * Created by oahnus on 2022-12-21
 *
 * @author oahnus
 */
public class DgPaySignUtils {
    private static final char[] hexDigits = {'0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'A', 'B', 'C', 'D', 'E', 'F'};
    private static final String MD5 = "MD5";//加签方式：MD5

    /*
     * @Author boy
     * @Description 数据签名
     * @Date 2019/8/31 1:57 PM
     * @Param [data, key]
     * @return java.lang.String
     */
    public static String sign(String data, String key) throws Exception {
        //得到明文的字节数组
        byte[] btInput = (data + key).getBytes();
        // 创建一个提供信息摘要算法的对象(MD5摘要算法)
        MessageDigest messageDigest = MessageDigest.getInstance(MD5);
        // 使用指定的字节更新摘要
        messageDigest.update(btInput);
        // 得到二进制的密文
        byte[] encryptData = messageDigest.digest();
        // 把密文转换成十六进制的字符串形式
        return bytesToHex(encryptData);
    }

    /*
     * @Author boy
     * @Description 验签
     * @Date 2019/8/31 1:57 PM
     * @Param [data, key, sign][明文数据,签名key,接收到的签名]
     * @return boolean
     */
    public static boolean verifySign(String data, String key, String sign) throws Exception {
        //调用加签方法，看加签后的签名是否和接收到的一致
        String encryptData = sign(data, key);
        return encryptData.equals(sign);
    }

    /*
     * @Author boy
     * @Description 将byte数组转化为16进制字符串
     * @Date 2019/8/31 1:58 PM
     * @Param [bytes]
     * @return java.lang.String
     */
    public static String bytesToHex(byte[] bytes) {
        int k = 0;
        char[] hexChars = new char[bytes.length * 2];
        for (byte byte0 : bytes) {
            hexChars[k++] = hexDigits[byte0 >>> 4 & 0xf];
            hexChars[k++] = hexDigits[byte0 & 0xf];
        }
        return new String(hexChars);
    }


    public static void main(String[] args) throws Exception {
        Map<String, String> hashMap = new HashMap<>();
        String data = "你好！MD你好！MD5!你好！MD5!你好！MD5!你好！MD5!你好！MD5!你好！MD5!你好！MD5!你好！MD5!你好！MD5!你好！MD5!你好！MD5!你好！MD5!你好！MD5!你好！MD5!你好！MD5!你好！MD5!你好！MD5!你好！MD5!你好！MD5!你好！MD5!你好！MD5!你好！MD5!你好！MD5!你好！MD5!你好！MD5!你好！MD5!你好！MD5!你好！MD5!你好！MD5!你好！MD5!你好！MD5!你好！MD5!你好！MD5!你好！MD5!你好！MD5!你好！MD5!你好！MD5!你好！MD5!你好！MD5!你好！MD5!你好！MD5!你好！MD5!你好！MD5!你好！MD5!你好！MD5!你好！MD5!你好！MD5!你好！MD5!你好！MD5!你好！MD5!你好！MD5!你好！MD5!你好！MD5!你好！MD5!你好！MD5!你好！MD5!你好！MD5!你好！MD5!你好！MD5!你好！MD5!5!";
        String key = "1234567890abcdef";//密钥
        String dataSign = sign(data, key);
        hashMap.put("data", data);
        hashMap.put("dataSign", dataSign);
        System.out.println("明文:" + hashMap.get("data"));
        System.out.println("签名：" + hashMap.get("dataSign"));
        System.out.println("验签结果：" + verifySign(data, key, dataSign));
    }
}
