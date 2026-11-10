package com.macro.mall.serializer;

import com.alibaba.fastjson2.JSON;
import com.fasterxml.jackson.core.JsonGenerator;
import com.fasterxml.jackson.databind.JsonSerializer;
import com.fasterxml.jackson.databind.SerializerProvider;
import org.apache.logging.log4j.util.Strings;

import java.io.IOException;
import java.util.Collections;
import java.util.List;

/**
 * @author zkl on 2022/6/7
 */
public class ArrayStringSerializer extends JsonSerializer<String> {
    @Override
    public void serialize(String s, JsonGenerator jsonGenerator, SerializerProvider serializerProvider) throws IOException {
        if (Strings.isBlank(s)) {
            jsonGenerator.writeObject(Collections.emptyList());
        } else {
            try {
                List<String> strings = JSON.parseArray(s, String.class);
                jsonGenerator.writeObject(strings);
            } catch (Exception e) {
                if (Strings.isBlank(s)) {
                    jsonGenerator.writeObject(Collections.emptyList());
                } else {
                    List<String> strings = JSON.parseArray("[\"" + s + "\"]", String.class);
                    jsonGenerator.writeObject(strings);
                }
            }

        }
    }

}
