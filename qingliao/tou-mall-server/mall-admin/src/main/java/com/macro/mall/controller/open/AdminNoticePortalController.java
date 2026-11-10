package com.macro.mall.controller.open;

import com.macro.mall.aspect.IgnoreLog;
import com.macro.mall.common.exception.BusinessException;
import com.macro.mall.service.AdminNoticeBindingService;
import com.macro.mall.service.AdminNoticeCipher;
import me.chanjar.weixin.mp.api.WxMpService;
import me.chanjar.weixin.mp.config.WxMpConfigStorage;
import me.chanjar.weixin.mp.bean.message.WxMpXmlMessage;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;
import java.time.*;

/** 独立人员绑定回调，不走会记录完整事件/同步客户档案的旧公众号Router。 */
@RestController
@RequestMapping("/wx/mp/admin-notice/{appid}")
public class AdminNoticePortalController {
    @Autowired AdminNoticeBindingService bindings;
    @Autowired WxMpService wxService;
    @IgnoreLog
    @GetMapping(produces="text/plain;charset=utf-8")
    public String verify(@PathVariable("appid") String appId,@RequestParam String signature,@RequestParam String timestamp,@RequestParam String nonce,@RequestParam String echostr){
        if(!bindings.acceptsApp(appId))throw new BusinessException("服务号提醒尚未配置");
        synchronized(wxService){if(!wxService.switchover(appId)||!wxService.checkSignature(timestamp,nonce,signature))throw new BusinessException("服务号验签失败");return echostr;}
    }
    @IgnoreLog
    @PostMapping(produces="text/plain;charset=utf-8")
    public String post(@PathVariable("appid") String appId,@RequestBody String body,@RequestParam String signature,@RequestParam String timestamp,@RequestParam String nonce,
                       @RequestParam(name="encrypt_type",required=false) String encoding,@RequestParam(name="msg_signature",required=false) String messageSignature){
        if(!bindings.isEnabled())return "success";
        if(!bindings.acceptsApp(appId))throw new BusinessException("服务号不匹配");
        if(!"aes".equalsIgnoreCase(encoding)||messageSignature==null||messageSignature.isEmpty())throw new BusinessException("人员绑定仅接受加密验证事件");
        if(body==null||body.length()>16384)throw new BusinessException("服务号事件格式无效");
        synchronized(wxService){
            if(!wxService.switchover(appId)||!wxService.checkSignature(timestamp,nonce,signature))throw new BusinessException("服务号验签失败");
            WxMpConfigStorage config=wxService.getWxMpConfigStorage();
            String plain=AdminNoticeCipher.decrypt(body,config.getToken(),config.getAesKey(),appId,timestamp,nonce,messageSignature);
            WxMpXmlMessage message=WxMpXmlMessage.fromXml(plain);
            if(message.getCreateTime()==null)throw new BusinessException("服务号事件时间无效");
            LocalDateTime time=LocalDateTime.ofInstant(Instant.ofEpochSecond(message.getCreateTime()),ZoneId.of("Asia/Shanghai"));
            bindings.acceptVerifiedEvent(appId,message.getFromUser(),message.getEvent(),message.getEventKey(),time);
        }
        return "success";
    }
}
