package com.macro.mall.service;

import com.macro.mall.common.exception.BusinessException;
import com.macro.mall.mapper.AdminNoticeBindingMapper;
import lombok.extern.slf4j.Slf4j;
import me.chanjar.weixin.common.api.WxConsts;
import me.chanjar.weixin.common.bean.oauth2.WxOAuth2AccessToken;
import me.chanjar.weixin.common.error.WxErrorException;
import me.chanjar.weixin.mp.api.WxMpService;
import me.chanjar.weixin.mp.bean.result.WxMpUser;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.sql.Timestamp;
import java.time.*;
import java.util.*;

/**
 * 服务号网页授权绑定：后台生成一次性授权二维码，微信扫码后回调直接写入本人绑定。
 * 不需要配置服务号消息服务器；state 只存摘要，回调由授权码换 openid，不接受前端传 openid。
 */
@Service
@Slf4j
public class AdminNoticeOAuthService {
    private static final int QR_SIZE=320;
    @Autowired AdminNoticeBindingMapper mapper;
    @Autowired WxMpService wxService;
    @Value("${fullyu.notice.admin-enabled:false}") boolean enabled;
    @Value("${fullyu.notice.admin-app-id:}") String appId;
    @Value("${fullyu.notice.admin-oauth-callback:}") String callbackUrl;
    Clock clock=Clock.system(ZoneId.of("Asia/Shanghai"));
    private final SecureRandom random=new SecureRandom();

    public boolean isEnabled(){return enabled&&!isBlank(appId);}

    @Transactional(rollbackFor=Exception.class)
    public Map<String,Object> authorize(Long admin){
        if(admin==null||admin<=0)throw new BusinessException("请先登录后台");
        if(!isEnabled())throw new BusinessException("服务号提醒尚未开启");
        if(isBlank(callbackUrl))throw new BusinessException("未配置网页授权回调地址");
        if(mapper.activeAdmin(admin)!=1)throw new BusinessException("后台账号不可用");
        byte[] bytes=new byte[24];
        random.nextBytes(bytes);
        String state=Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
        LocalDateTime expires=now().plusMinutes(10);
        mapper.expireChallenges(admin);
        if(mapper.insertChallenge(digest(state),admin,appId,expires)!=1)throw new BusinessException("无法生成绑定二维码，请重试");
        String url;
        try{url=authorizationUrl(state);}
        catch(WxErrorException e){throw new BusinessException("服务号授权地址生成失败，请核对公众号配置");}
        Map<String,Object> result=new LinkedHashMap<>();
        result.put("url",url);
        result.put("qrDataUrl",AdminNoticeQrCode.dataUrl(url,QR_SIZE));
        result.put("expiresAt",expires);
        return result;
    }

    /**
     * 微信回调：校验一次性state、换openid、写本人绑定并消费凭证。
     * 同一微信已绑定其他后台账号时拒绝，避免互相顶号。
     */
    @Transactional(rollbackFor=Exception.class)
    public void callback(String code,String state){
        if(!isEnabled())throw new BusinessException("服务号提醒尚未开启");
        if(isBlank(code)||code.length()>512)throw new BusinessException("授权结果无效，请回到后台重新获取二维码");
        if(state==null||!state.matches("[A-Za-z0-9_-]{32}"))throw new BusinessException("绑定请求无效，请回到后台重新获取二维码");
        String hash=digest(state);
        Map<String,Object> row=mapper.lockChallenge(hash);
        if(row==null)throw new BusinessException("绑定请求无效或已使用，请回到后台重新获取二维码");
        if(row.get("consumedAt")!=null)throw new BusinessException("绑定请求已使用，请回到后台重新获取二维码");
        Long admin=number(row.get("adminId"));
        if(admin==null||!appId.equals(row.get("appId")))throw new BusinessException("绑定请求无效，请回到后台重新获取二维码");
        LocalDateTime expires=time(row.get("expiresAt"));
        if(expires==null||!expires.isAfter(now()))throw new BusinessException("二维码已过期，请回到后台重新获取");
        if(mapper.activeAdmin(admin)!=1)throw new BusinessException("后台账号不可用");
        String openId;
        int following=1;
        try{
            WxOAuth2AccessToken token=accessToken(code);
            openId=token==null?null:token.getOpenId();
            if(openId==null||!openId.matches("[A-Za-z0-9_-]{8,128}"))throw new BusinessException("授权结果无效，请回到后台重新获取二维码");
            WxMpUser user=userInfo(openId);
            if(user!=null&&Boolean.FALSE.equals(user.getSubscribe()))following=0;
        }catch(WxErrorException e){
            if(e.getError().getErrorCode()==40163)throw new BusinessException("授权码已使用，请回到后台重新获取二维码");
            throw new BusinessException("微信授权校验失败，请回到后台重新获取二维码");
        }
        Long other=mapper.bindingByOpenId(appId,openId);
        if(other!=null&&!other.equals(admin))throw new BusinessException("该微信已绑定其他后台账号，请先在原账号解绑");
        Map<String,Object> current=mapper.binding(admin,appId);
        int written;
        if(current==null){
            try{written=mapper.insertOAuthBinding(admin,appId,openId,following);}
            catch(org.springframework.dao.DuplicateKeyException e){throw new BusinessException("该微信已绑定其他后台账号，请先在原账号解绑");}
        }else{
            written=mapper.updateBinding(admin,appId,openId,now());
            if(written==1&&following!=1)mapper.markUnfollowed(appId,openId);
        }
        if(written!=1)throw new BusinessException("绑定状态已变化，请刷新后重试");
        if(mapper.consume(hash)!=1)throw new BusinessException("绑定请求已使用，请回到后台重新获取二维码");
        if(mapper.audit(admin,"OAUTH_BOUND")!=1)throw new BusinessException("绑定记录保存失败");
        log.info("后台人员完成服务号绑定 admin={}",admin);
    }

    private String authorizationUrl(String state) throws WxErrorException {
        synchronized(wxService){
            if(!wxService.switchover(appId))throw new WxErrorException(new me.chanjar.weixin.common.error.WxError(40013,"服务号配置不匹配"));
            return wxService.getOAuth2Service().buildAuthorizationUrl(callbackUrl,WxConsts.OAuth2Scope.SNSAPI_BASE,state);
        }
    }

    private WxOAuth2AccessToken accessToken(String code) throws WxErrorException {
        synchronized(wxService){
            if(!wxService.switchover(appId))throw new WxErrorException(new me.chanjar.weixin.common.error.WxError(40013,"服务号配置不匹配"));
            return wxService.getOAuth2Service().getAccessToken(code);
        }
    }

    private WxMpUser userInfo(String openId) throws WxErrorException {
        synchronized(wxService){
            if(!wxService.switchover(appId))throw new WxErrorException(new me.chanjar.weixin.common.error.WxError(40013,"服务号配置不匹配"));
            return wxService.getUserService().userInfo(openId,null);
        }
    }

    static String digest(String value){
        try{
            StringBuilder out=new StringBuilder();
            for(byte b:MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8)))out.append(String.format("%02x",b&255));
            return out.toString();
        }catch(Exception e){throw new IllegalStateException("无法生成绑定摘要");}
    }

    private LocalDateTime now(){return LocalDateTime.now(clock);}
    private static LocalDateTime time(Object value){
        if(value instanceof LocalDateTime)return (LocalDateTime)value;
        if(value instanceof Timestamp)return ((Timestamp)value).toLocalDateTime();
        return null;
    }
    private static Long number(Object value){
        if(value instanceof Number)return ((Number)value).longValue();
        return null;
    }
    private static boolean isBlank(String value){return value==null||value.trim().isEmpty();}
}