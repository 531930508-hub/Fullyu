package com.macro.mall.serializer;

import com.fasterxml.jackson.core.JsonGenerator;
import com.fasterxml.jackson.databind.JsonSerializer;
import com.fasterxml.jackson.databind.SerializerProvider;
import com.macro.mall.service.impl.OssServiceImpl;
import com.macro.mall.utils.ContextUtil;
import org.apache.logging.log4j.util.Strings;

import java.io.IOException;

/**
 * @Author: jinlong
 * @Date: 2020/7/6 14:53
 */
public class QiniuUrlSerializer extends JsonSerializer<String> {
    @Override
    public void serialize(String url, JsonGenerator jsonGenerator, SerializerProvider serializerProvider) throws IOException {
        if (Strings.isBlank(url)) {
            jsonGenerator.writeString("");
        } else {
            OssServiceImpl qiniuService = ContextUtil.getBeanByClass(OssServiceImpl.class);
            jsonGenerator.writeString(qiniuService.getFinalUrl(url));
        }
    }
}
