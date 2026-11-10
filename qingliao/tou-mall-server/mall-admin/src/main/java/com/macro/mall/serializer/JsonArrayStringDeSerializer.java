package com.macro.mall.serializer;

import com.alibaba.fastjson2.JSON;
import com.fasterxml.jackson.core.JsonParser;
import com.fasterxml.jackson.databind.DeserializationContext;
import com.fasterxml.jackson.databind.JsonDeserializer;
import org.springframework.util.ObjectUtils;

import java.io.IOException;

/**
 * @author zkl on 2022/6/7
 */
public class JsonArrayStringDeSerializer extends JsonDeserializer<Object> {
    @Override
    public String deserialize(JsonParser jsonParser, DeserializationContext deserializationContext) throws IOException {
        Object strings = jsonParser.readValueAs(Object.class);
        if (ObjectUtils.isEmpty(strings)) {
            return null;
        }
        return JSON.toJSONString(strings);
    }
}
