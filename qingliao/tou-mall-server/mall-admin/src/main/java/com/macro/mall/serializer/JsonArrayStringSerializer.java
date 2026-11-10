package com.macro.mall.serializer;

import com.alibaba.fastjson2.JSONArray;
import com.alibaba.fastjson2.JSONObject;
import com.fasterxml.jackson.core.JsonGenerator;
import com.fasterxml.jackson.databind.JsonSerializer;
import com.fasterxml.jackson.databind.SerializerProvider;
import org.apache.logging.log4j.util.Strings;

import java.io.IOException;
import java.util.Collections;
import java.util.List;

/**
 * @author zkl on 2024/02/19
 */
public class JsonArrayStringSerializer extends JsonSerializer<String> {
    @Override
    public void serialize(String s, JsonGenerator jsonGenerator, SerializerProvider serializerProvider) throws IOException {
        if (Strings.isBlank(s)) {
            jsonGenerator.writeObject(Collections.emptyList());
        } else {
            try {
                List<JSONObject> jsonObjectList = JSONArray.parseArray(s, JSONObject.class);
                jsonGenerator.writeObject(jsonObjectList);
            } catch (Exception e) {
                if (Strings.isBlank(s)) {
                    jsonGenerator.writeObject(null);
                } else {
                    e.printStackTrace();
                    jsonGenerator.writeObject(null);
                }
            }

        }
    }

}
