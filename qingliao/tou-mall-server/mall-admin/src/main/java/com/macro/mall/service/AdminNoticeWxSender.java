package com.macro.mall.service;

import lombok.extern.slf4j.Slf4j;
import me.chanjar.weixin.common.error.WxError;
import me.chanjar.weixin.common.error.WxErrorException;
import me.chanjar.weixin.mp.api.WxMpService;
import me.chanjar.weixin.mp.bean.template.WxMpTemplate;
import me.chanjar.weixin.mp.bean.template.WxMpTemplateMessage;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

/** 公众号模板消息与模板内容的唯一出口；调用方负责事务与状态流转。 */
@Component
@Slf4j
public class AdminNoticeWxSender {
    private static final long CACHE_MILLIS=10*60*1000L;
    @Autowired WxMpService wxService;
    private final Map<String,CachedTemplates> cache=new ConcurrentHashMap<>();

    public String templateContent(String appId,String templateId) throws WxErrorException {
        if(templateId==null||templateId.trim().isEmpty())return null;
        CachedTemplates cached=cache.get(appId);
        if(cached==null||cached.expired()){
            synchronized(cache){
                cached=cache.get(appId);
                if(cached==null||cached.expired()){
                    List<WxMpTemplate> list=fetch(appId);
                    cached=new CachedTemplates(list,System.currentTimeMillis());
                    cache.put(appId,cached);
                }
            }
        }
        for(WxMpTemplate template:cached.templates){
            if(templateId.equals(template.getTemplateId()))return template.getContent();
        }
        return null;
    }

    public String send(String appId,WxMpTemplateMessage message) throws WxErrorException {
        synchronized(wxService){
            if(!wxService.switchover(appId))throw new WxErrorException(new WxError(40013,"服务号配置不匹配"));
            return wxService.getTemplateMsgService().sendTemplateMsg(message);
        }
    }

    private List<WxMpTemplate> fetch(String appId) throws WxErrorException {
        synchronized(wxService){
            if(!wxService.switchover(appId))throw new WxErrorException(new WxError(40013,"服务号配置不匹配"));
            List<WxMpTemplate> list=wxService.getTemplateMsgService().getAllPrivateTemplate();
            return list==null?Collections.<WxMpTemplate>emptyList():list;
        }
    }

    void clearCache(){cache.clear();}

    private static final class CachedTemplates{
        private final List<WxMpTemplate> templates;
        private final long loadedAt;
        private CachedTemplates(List<WxMpTemplate> templates,long loadedAt){this.templates=templates;this.loadedAt=loadedAt;}
        private boolean expired(){return System.currentTimeMillis()-loadedAt>CACHE_MILLIS;}
    }
}