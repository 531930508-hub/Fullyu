package com.macro.mall.serializer;

import cn.hutool.core.net.URLDecoder;
import com.fasterxml.jackson.core.JsonParser;
import com.fasterxml.jackson.databind.DeserializationContext;
import com.fasterxml.jackson.databind.JsonDeserializer;
import org.apache.logging.log4j.util.Strings;

import java.io.IOException;
import java.nio.charset.Charset;

/**
 * @Author: jinlong
 * @Date: 2020/7/6 14:53
 */
public class QiniuUrlDeSerializer extends JsonDeserializer<String> {
    @Override
    public String deserialize(JsonParser jsonParser, DeserializationContext deserializationContext) {
        String completeUrl = null;
        try {
            completeUrl = jsonParser.getText();
        } catch (IOException e) {
            e.printStackTrace();
        }
        if (Strings.isNotBlank(completeUrl)) {
            if (completeUrl.startsWith("http")) {
                String substring = getPartyUrl(completeUrl);
                return substring;
            }
        }
        return completeUrl;
    }

    public static String getPartyUrl(String completeUrl) {
        int start = completeUrl.indexOf(".com/");
        start = start == -1 ? 0 : start + 5;
        int end = completeUrl.indexOf("?Expires=");
        end = end == -1 ? completeUrl.length() : end;
        String fileKey = completeUrl.substring(start, end);
        String decodedStr = URLDecoder.decode(fileKey, Charset.defaultCharset());
        return decodedStr;
    }
}
