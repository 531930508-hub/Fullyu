package com.macro.mall.utils;

import com.baomidou.mybatisplus.core.toolkit.Constants;
import com.google.common.collect.Maps;
import lombok.SneakyThrows;
import org.apache.commons.codec.digest.DigestUtils;
import org.apache.commons.compress.utils.IOUtils;
import org.apache.logging.log4j.util.Strings;
import org.springframework.beans.BeanUtils;
import org.springframework.beans.BeanWrapper;
import org.springframework.beans.BeanWrapperImpl;
import org.springframework.cglib.beans.BeanMap;
import org.springframework.util.CollectionUtils;
import org.springframework.util.ObjectUtils;

import javax.net.ssl.HttpsURLConnection;
import javax.net.ssl.SSLContext;
import javax.net.ssl.TrustManager;
import javax.net.ssl.X509TrustManager;
import java.io.IOException;
import java.io.InputStream;
import java.math.BigInteger;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLConnection;
import java.net.URLDecoder;
import java.security.KeyManagementException;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.security.cert.CertificateException;
import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;
import java.util.stream.IntStream;

/**
 * 通用util
 *
 * @author jinlong
 * @date 2019/7/16 11:25
 */
public class CustomUtil {
    private final static Pattern pattern = Pattern.compile("[A-Z]");
    private static Pattern patternPhone = Pattern.compile("1(3|4|5|6|7|8|9)\\d{9}$*");
    private static final char[] CHARS = {'0', '1', '2', '3', '4', '5', '6', '7', '8', '9',
            'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n', 'o',
            'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z', 'A', 'B', 'C', 'D',
            'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O',
            'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z'};
    private static final String CHARACTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    private static final SecureRandom RANDOM = new SecureRandom();

    /**
     * 小驼峰转下划线
     *
     * @param humpStr
     * @return
     */
    public static String humpToLine(String humpStr) {
        if (Strings.isBlank(humpStr)) {
            return null;
        }
        if (humpStr.length() == 0) {
            return humpStr.toLowerCase(Locale.ROOT);
        }
        Matcher matcher = pattern.matcher(humpStr);
        StringBuffer sb = new StringBuffer();
        while (matcher.find()) {
            matcher.appendReplacement(sb, "_" + matcher.group(0).toLowerCase());
        }
        matcher.appendTail(sb);
        return sb.toString();
    }

    /**
     * 下划线转小驼峰
     *
     * @param lineStr
     * @return
     */
    public static String lineToHump(String lineStr) {
        if (Strings.isBlank(lineStr)) {
            return null;
        }
        if (lineStr.indexOf("_") < 0) {
            return lineStr.toLowerCase(Locale.ROOT);
        }
        String[] values = lineStr.toLowerCase(Locale.ROOT).split("_");
        StringBuffer sb = new StringBuffer(values[0]);
        for (int i = 1; i < values.length; i++) {
            String value = values[i];
            sb.append(value.substring(0, 1).toUpperCase());
            sb.append(value.substring(1));
        }
        return sb.toString();
    }

    /**
     * 逗号分隔的string转Long数组：234,34,,453,4, > [234,34,453,4]
     *
     * @param args
     * @return
     */
    public static Long[] string2LongArray(String args) {
        if (Strings.isBlank(args)) {
            return new Long[0];
        }
        return Arrays.stream(args.split(","))
                .filter(s -> Strings.isNotBlank(s))
                .map(s -> Long.parseLong(s))
                .distinct()
                .toArray(Long[]::new);
    }

    public static List<Long> string2LongList(String args) {
        return Arrays.asList(string2LongArray(args));
    }

    public static List<String> string2StringList(String args) {
        return string2StringList(args, ",");
    }

    public static List<String> stringBlankSpace2StringList(String args) {
        return string2StringList(args, " ");
    }

    public static String[] string2StringArray(String args) {
        return string2StringArray(args, ",");
    }

    public static List<String> string2StringList(String args, String character) {
        return Arrays.asList(string2StringArray(args, character));
    }

    private static String[] string2StringArray(String args, String Character) {
        if (Strings.isNotBlank(args)) {
            return args.split(Character);
        }
        return null;
    }

    public static String longList2String(List<Long> list) {
        if (CollectionUtils.isEmpty(list)) {
            return "";
        }
        return list.stream().map(d -> d.toString()).collect(Collectors.joining(","));
    }

    /**
     * md5加密
     *
     * @param str
     * @return
     */
    public static String genMd5(String str) {
        try {
            MessageDigest md = MessageDigest.getInstance("MD5");
            md.update(str.getBytes());
            return new BigInteger(1, md.digest()).toString(16);
        } catch (Exception e) {
            e.printStackTrace();
        }
        return "";
    }

    /**
     * 提取手机号
     *
     * @param value
     * @return
     */
    public static String getPhone(String value) {
        if (Strings.isBlank(value)) {
            return "";
        }
        Matcher matcher = patternPhone.matcher(value);
        while (matcher.find()) {
            return matcher.group();
        }
        return "";
    }

    /**
     * 判断s是否为正整数
     *
     * @param s
     * @return
     */
    public static boolean isInteger(String s) {
        if (Strings.isNotBlank(s)) {
            return s.matches("^[0-9]*$");
        }
        return false;
    }

    public static void main(String[] args) {
//        String dfdkasgfd = "dfg和第三方，132675jhksdf 大发射13678980498";
//        System.out.println(getPhone(dfdkasgfd));

        for (int i = 0; i < 10; i++) {
            System.out.println(toShortCode("zhanger多福多寿", 4));

            String md5Hex = DigestUtils.md5Hex("zhanger多福多寿");
            System.out.println(md5Hex);
        }
    }

    /**
     * 生成邀请码
     *
     * @return
     */
    public static String generateInvitationCode() {
        // 随机确定长度：5或6
        int length = RANDOM.nextInt(2) + 6;
        return IntStream.range(0, length)
                .mapToObj(i -> CHARACTERS.charAt(RANDOM.nextInt(CHARACTERS.length())))
                .map(Object::toString)
                .collect(Collectors.joining());
    }


    /**
     * 对象转map
     *
     * @param bean
     * @param ignoreNull
     * @param <T>
     * @return
     */
    public static <T> HashMap<String, Object> objectToMap(T bean, boolean ignoreNull) {
        HashMap<String, Object> map = Maps.newHashMap();
        if (bean != null) {
            BeanMap beanMap = BeanMap.create(bean);
            beanMap.forEach((k, v) -> {
                if (ignoreNull) {
                    if (!ObjectUtils.isEmpty(v)) {
                        map.put(k + "", v);
                    }
                } else {
                    map.put(k + "", v);
                }
            });
        }
        return map;
    }

    /**
     * map转对象
     *
     * @param map
     * @param clazz
     * @param <T>
     * @return
     * @throws Exception
     */
    public static <T> T mapToObject(Map<String, Object> map, Class<T> clazz) {
        T obj = null;
        try {
            obj = clazz.newInstance();
        } catch (Exception e) {
            e.printStackTrace();
            return null;
        }
        BeanMap beanMap = BeanMap.create(obj);
        beanMap.putAll(map);
        return obj;
    }

    /**
     * 唯一码
     *
     * @return
     */
    public static String uniCode() {
        String uniCode = System.currentTimeMillis() + UUID.randomUUID().toString().substring(0, 17);
        return uniCode;
    }

    /**
     * 关键词是否为省市名称
     *
     * @param word
     * @return
     */
    public static boolean ifProvinceOrCity(String word) {
        if (Strings.isBlank(word)) {
            return false;
        }
        // todo 省市增加至全国
        List<String> provinceOrCities = Arrays.asList("上海", "南京", "江苏", "深圳", "广东");
        for (String pc : provinceOrCities) {
            if (pc.equals(word)) {
                return true;
            }
        }
        return false;
    }

    public static String getPartyUrl(String completeUrl) {
        if (Strings.isNotBlank(completeUrl) && completeUrl.startsWith("http")) {
            int start = completeUrl.indexOf(".com/");
            start = start == -1 ? 0 : start + 5;
            int end = completeUrl.indexOf("?e=");
            end = end == -1 ? completeUrl.length() : end;
            return completeUrl.substring(start, end);
        }
        return completeUrl;
    }

    /**
     * 长码缩短为短码
     *
     * @param longCode 长码
     * @param length   短码长度
     * @return 短码
     */
    public static String toShortCode(String longCode, Integer length) {
        // 如果每次想生成不一样的短码可以自定义生成MD5加密字符传前的混合加密key
        // String key = System.currentTimeMillis() + "";
        String md5Hex = DigestUtils.md5Hex(longCode);
        for (int i = 0; i < 4; i++) {
            // 把加密字符按照8位一组16进制与0x3FFFFFFF进行位与运算
            String subString = md5Hex.substring(i * 8, (i + 1) * 8);
            long lHexLong = 0x3FFFFFFF & Long.parseLong(subString, 16);
            StringBuilder outChars = new StringBuilder();
            for (int j = 0; j < length; j++) {
                long index = 0x0000003D & lHexLong;
                outChars.append(CHARS[(int) index]);
                lHexLong = lHexLong >> length;
            }
            String shortUrl = outChars.toString();
            char firstChar = shortUrl.charAt(0);
            // 数字开头时替换成字母
            if (firstChar <= '9') {
//                int i1 = new SplittableRandom().nextInt(10, CHARS.length - 1);
                shortUrl = shortUrl.replace(firstChar, CHARS[10]);
            }
            return shortUrl;
        }
        return null;
    }

    /**
     * 通过url下载文件并转为字节数组
     *
     * @param urlStr
     * @return
     */
    @SneakyThrows
    public static byte[] url2Bytes(String urlStr) {
        InputStream inputStream = url2InputStream(urlStr);
        byte[] bytes = IOUtils.toByteArray(inputStream);
        inputStream.close();
        return bytes;
    }

    /**
     * 通过url下载文件并转为字节数组
     *
     * @param urlStr
     * @return
     */
    @SneakyThrows
    public static InputStream url2InputStream(String urlStr) {
        InputStream inputStream = null;
        try {
            if (urlStr.contains("https")) {
                // 绕过https验证失效，改为http下载
                urlStr = urlStr.replace("https", "http");
            }
            //url解码
            String decode = URLDecoder.decode(urlStr, Constants.UTF_8).replace(" ", "%20");
            URL url = new URL(decode);
            URLConnection connection;
            if (urlStr.contains("https")) {
                // 绕过https验证失效，改为http下载
//                urlStr = urlStr.replace("https", "http");
                HttpsURLConnection conn = (HttpsURLConnection) url.openConnection();
//                SSLContext context = createIgnoreVerifySSL();
//                conn.setSSLSocketFactory(context.getSocketFactory());
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
            return inputStream;
        } catch (IOException e) {
            e.printStackTrace();
            throw new Exception("模板文件下载失败" + urlStr);
        }
    }

    /**
     * 绕过验证
     *
     * @return
     */
    public static SSLContext createIgnoreVerifySSL() throws NoSuchAlgorithmException, KeyManagementException {
        SSLContext sc = SSLContext.getInstance("SSLv3");
        // 实现一个X509TrustManager接口，用于绕过验证，不用修改里面的方法
        X509TrustManager trustManager = new X509TrustManager() {
            @Override
            public void checkClientTrusted(
                    java.security.cert.X509Certificate[] paramArrayOfX509Certificate,
                    String paramString) throws CertificateException {
            }

            @Override
            public void checkServerTrusted(
                    java.security.cert.X509Certificate[] paramArrayOfX509Certificate,
                    String paramString) throws CertificateException {
            }

            @Override
            public java.security.cert.X509Certificate[] getAcceptedIssuers() {
                return null;
            }
        };

        sc.init(null, new TrustManager[]{trustManager}, null);
        return sc;
    }

    /**
     * 复制对象属性（忽略原对象的空属性）
     *
     * @param source 原对象
     * @param target 目标对象
     */
    public static void copyPropertiesIgnoreNull(Object source, Object target) {
        BeanUtils.copyProperties(source, target, getNullPropertyNames(source));
    }

    private static String[] getNullPropertyNames(Object source) {
        final BeanWrapper src = new BeanWrapperImpl(source);
        java.beans.PropertyDescriptor[] pds = src.getPropertyDescriptors();
        Set<String> emptyNames = new HashSet<>();
        for (java.beans.PropertyDescriptor pd : pds) {
            Object srcValue = src.getPropertyValue(pd.getName());
            if (srcValue == null || Strings.isBlank(srcValue.toString())) {
                emptyNames.add(pd.getName());
            }
        }
        String[] result = new String[emptyNames.size()];
        return emptyNames.toArray(result);
    }

    /**
     * 去除字符串末尾逗号
     *
     * @param str
     * @return
     */
    public static String removeTrailingComma(String str) {
        return _removeTrailingComma(str, "，");
    }

    private static String _removeTrailingComma(String str, String replaceStr) {
        if (Strings.isBlank(replaceStr)) {
            return str;
        }
        if (str == null || str.isEmpty()) {
            return str;
        }
        int lastIndex = str.lastIndexOf(replaceStr);
        if (lastIndex != -1 && lastIndex == str.length() - 1) {
            // 如果最后一个字符是逗号，则去掉它
            return str.substring(0, lastIndex);
        }
        return str;
    }

    public static Long paramsToLong(Map<String, Object> params, String key) {
        if (Strings.isBlank(key) || params == null) {
            return null;
        }
        Object o = params.get(key);
        if (o != null) {
            return Long.valueOf(o.toString());
        }
        return null;
    }

    public static Integer paramsToInteger(Map<String, Object> params, String key) {
        if (Strings.isBlank(key) || params == null) {
            return null;
        }
        Object o = params.get(key);
        if (o != null) {
            return Integer.valueOf(o.toString());
        }
        return null;
    }

    public static String paramsToString(Map<String, Object> params, String key) {
        if (Strings.isBlank(key) || params == null) {
            return null;
        }
        Object o = params.get(key);
        if (o != null) {
            String s = o.toString();
            if (Strings.isBlank(s)) {
                return null;
            }
            return s;
        }
        return null;
    }

}

