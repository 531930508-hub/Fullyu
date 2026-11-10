package com.macro.mall.utils;
import com.alibaba.fastjson2.JSONObject;
import com.aliyun.tea.*;
import com.aliyun.dysmsapi20170525.*;
import com.aliyun.dysmsapi20170525.models.*;
import com.aliyun.teaopenapi.*;
import com.aliyun.teaopenapi.models.*;
import com.aliyun.teautil.*;

import com.macro.mall.common.utils.Env;
import org.springframework.stereotype.Component;

@Component
public class SendSMS {
    public static com.aliyun.dysmsapi20170525.Client createClient(String accessKeyId, String accessKeySecret) throws Exception {
        Config config = new Config();
        config.accessKeyId = accessKeyId;
        config.accessKeySecret = accessKeySecret;
        return new com.aliyun.dysmsapi20170525.Client(config);
    }
    public static int sendSMS(String phone, String parems) throws Exception {
        com.aliyun.dysmsapi20170525.Client client = SendSMS.createClient(Env.get("ALIYUN_SMS_ACCESS_KEY_ID"), Env.get("ALIYUN_SMS_ACCESS_KEY_SECRET"));
        SendSmsRequest request = new SendSmsRequest();
        request.setSignName("Full愈");
        request.setPhoneNumbers(phone);
        request.setTemplateCode("SMS_509125176");
        //prames  "{\"$name$\":\"张三\",\"$project$\":\"13:30人广来福士店的2位60分钟项目\"}"
        request.setTemplateParam(parems);
        SendSmsResponse sendSmsResponse= client.sendSms(request);
        if(sendSmsResponse.getBody().getCode().equals("OK")){
            return 1;
        }else{
            throw new RuntimeException(sendSmsResponse.getBody().getMessage());
        }
    }

}
