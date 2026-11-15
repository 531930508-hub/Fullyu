package com.macro.mall.controller.open;

import com.macro.mall.aspect.IgnoreLog;
import com.macro.mall.common.exception.BusinessException;
import com.macro.mall.service.AdminNoticeOAuthService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * 服务号网页授权回调（白名单 /admin/open/**）。
 * 只接受微信带回来的 code+state，不接受 openid/adminId；成功后展示结果页并引导回后台。
 */
@RestController
@Slf4j
public class AdminNoticeOAuthController {
    @Autowired AdminNoticeOAuthService oauth;
    @Value("${fullyu.notice.admin-web-url:}") String adminWebUrl;

    @IgnoreLog
    @GetMapping(value="/admin/open/admin-notice/oauth/callback",produces="text/html;charset=UTF-8")
    public String callback(@RequestParam(required=false) String code,@RequestParam(required=false) String state){
        try{
            oauth.callback(code,state);
            return page("绑定成功","服务号提醒已绑定到当前后台账号。",true);
        }catch(BusinessException e){
            return page("绑定未完成",e.getMessage(),false);
        }catch(Exception e){
            log.warn("服务号授权回调异常",e);
            return page("绑定未完成","请回到后台待办中心重新获取二维码。",false);
        }
    }

    private String page(String title,String message,boolean success){
        String link=link();
        StringBuilder html=new StringBuilder(1024);
        html.append("<!DOCTYPE html><html lang=\"zh-CN\"><head><meta charset=\"utf-8\">")
            .append("<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">")
            .append("<title>").append(escape(title)).append("</title><style>")
            .append("body{margin:0;background:#f5f1ea;font-family:-apple-system,BlinkMacSystemFont,'PingFang SC',sans-serif;color:#2b2118;}")
            .append("main{max-width:420px;margin:18vh auto 0;padding:32px 24px;background:#fff;border-radius:16px;text-align:center;}")
            .append("h1{font-size:20px;margin:0 0 12px;}p{font-size:15px;line-height:1.7;color:#6b5d4e;margin:0 0 24px;}")
            .append("a{display:inline-block;padding:12px 28px;border-radius:999px;background:").append(success?"#2b2118":"#b0865a").append(";color:#fff;text-decoration:none;font-size:15px;}")
            .append("</style></head><body><main><h1>").append(escape(title)).append("</h1><p>").append(escape(message)).append("</p>")
            .append(link.isEmpty()?"<a href=\"javascript:history.back()\">返回</a>":"<a href=\""+escape(link)+"\">返回待办中心</a>")
            .append("</main></body></html>");
        return html.toString();
    }

    private String link(){
        String base=adminWebUrl==null?"":adminWebUrl.trim();
        if(!(base.startsWith("https://")||base.startsWith("http://")))return "";
        while(base.endsWith("/"))base=base.substring(0,base.length()-1);
        return base+"/#/todo/index";
    }

    private static String escape(String value){
        if(value==null)return "";
        return value.replace("&","&amp;").replace("<","&lt;").replace(">","&gt;")
            .replace("\"","&quot;").replace("'","&#39;");
    }
}