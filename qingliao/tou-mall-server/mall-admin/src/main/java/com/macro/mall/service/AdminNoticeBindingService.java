package com.macro.mall.service;

import com.macro.mall.common.exception.BusinessException;
import com.macro.mall.mapper.AdminNoticeBindingMapper;
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

/** 后台人员专用绑定；不访问客户openid、用户同步、二维码或消息外部接口。 */
@Service
public class AdminNoticeBindingService {
    @Autowired AdminNoticeBindingMapper mapper;
    @Value("${fullyu.notice.admin-enabled:false}") boolean enabled;
    @Value("${fullyu.notice.admin-app-id:}") String appId;
    Clock clock=Clock.system(ZoneId.of("Asia/Shanghai"));
    private final SecureRandom random=new SecureRandom();
    private LocalDateTime now(){return LocalDateTime.now(clock);}
    public boolean isEnabled(){return enabled && appId!=null && !appId.trim().isEmpty();}
    public boolean acceptsApp(String candidate){return isEnabled() && appId.equals(candidate);}
    private void requireId(Long admin){if(admin==null||admin<=0)throw new BusinessException("请先登录后台");}
    private void requireActive(Long admin){requireId(admin);if(!isEnabled())throw new BusinessException("服务号提醒尚未开启");if(mapper.activeAdmin(admin)!=1)throw new BusinessException("后台账号不可用");}
    private void requireLockedAdmin(Long admin){if(!Integer.valueOf(1).equals(mapper.lockAdmin(admin)))throw new BusinessException("后台账号不可用");}
    static String digest(String value){
        try {StringBuilder out=new StringBuilder();for(byte b:MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8)))out.append(String.format("%02x",b&255));return out.toString();}
        catch(Exception e){throw new IllegalStateException("无法生成绑定摘要");}
    }
    private String validNonce(String nonce){if(nonce==null||!nonce.matches("[A-Za-z0-9_-]{32}"))throw new BusinessException("绑定凭证无效，请重新发起");return digest(nonce);}
    private LocalDateTime time(Object value){if(value instanceof LocalDateTime)return (LocalDateTime)value;if(value instanceof Timestamp)return ((Timestamp)value).toLocalDateTime();return null;}
    public Map<String,Object> status(Long admin){
        requireId(admin);Map<String,Object> result=new LinkedHashMap<>();result.put("enabled",isEnabled());result.put("realDeliveryEnabled",false);result.put("qrAvailable",false);
        Map<String,Object> row=null;if(isEnabled()){requireActive(admin);row=mapper.binding(admin,appId);}
        result.put("bound",row!=null&&row.get("openId")!=null);result.put("following",row!=null&&Integer.valueOf(1).equals(row.get("following")));result.put("boundAt",row==null?null:row.get("boundAt"));return result;
    }
    @Transactional(rollbackFor=Exception.class)
    public Map<String,Object> begin(Long admin){
        requireActive(admin);requireLockedAdmin(admin);byte[] bytes=new byte[24];random.nextBytes(bytes);String nonce=Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
        mapper.expireChallenges(admin);LocalDateTime expires=now().plusMinutes(10);
        if(mapper.insertChallenge(digest(nonce),admin,appId,expires)!=1)throw new BusinessException("无法生成绑定凭证，请重试");
        Map<String,Object> result=new LinkedHashMap<>();result.put("scene","admin_notice_"+nonce);result.put("expiresAt",expires);result.put("qrAvailable",false);result.put("realDeliveryEnabled",false);return result;
    }
    @Transactional(rollbackFor=Exception.class)
    public Map<String,Object> confirm(Long admin,String nonce){
        requireActive(admin);String hash=validNonce(nonce);requireLockedAdmin(admin);Map<String,Object> row=mapper.lockChallenge(hash);
        if(row==null||!admin.equals(row.get("adminId"))||!appId.equals(row.get("appId")))throw new BusinessException("绑定凭证无效，请重新发起");
        if(row.get("consumedAt")!=null)return status(admin);
        LocalDateTime expires=time(row.get("expiresAt"));if(expires==null||!expires.isAfter(now()))throw new BusinessException("绑定凭证已到期，请重新发起");
        String openId=(String)row.get("candidateOpenId");LocalDateTime eventAt=time(row.get("eventAt"));
        if(openId==null||eventAt==null||!Integer.valueOf(1).equals(row.get("candidateFollowing")))throw new BusinessException("请先关注服务号并完成验证扫码");
        Map<String,Object> current=mapper.binding(admin,appId);
        int written=current==null?mapper.insertBinding(admin,appId,openId,eventAt):mapper.updateBinding(admin,appId,openId,eventAt);
        if(written!=1||mapper.consume(hash)!=1)throw new BusinessException("绑定状态已变化，请刷新后重试");
        if(mapper.audit(admin,"BOUND")!=1)throw new BusinessException("绑定记录保存失败");return status(admin);
    }
    @Transactional(rollbackFor=Exception.class)
    public void unlink(Long admin){requireActive(admin);requireLockedAdmin(admin);mapper.expireChallenges(admin);mapper.unlink(admin,appId);if(mapper.audit(admin,"UNBOUND")!=1)throw new BusinessException("解绑记录保存失败");}
    /** 只能由已验签并解密的服务端事件入口调用，HTTP不接受任意openid或adminId。 */
    @Transactional(rollbackFor=Exception.class)
    public void acceptVerifiedEvent(String eventAppId,String openId,String event,String eventKey,LocalDateTime eventAt){
        if(!isEnabled()||!appId.equals(eventAppId)||eventAt==null||eventAt.isBefore(now().minusMinutes(5))||eventAt.isAfter(now().plusMinutes(1)))return;
        if(openId==null||!openId.matches("[A-Za-z0-9_-]{8,128}"))throw new BusinessException("服务号事件身份无效");
        if("unsubscribe".equalsIgnoreCase(event)){mapper.revokeCandidates(appId,openId,eventAt);mapper.following(appId,openId,0,eventAt);return;}
        if(!"subscribe".equalsIgnoreCase(event)&&!"SCAN".equalsIgnoreCase(event))return;
        String scene=eventKey;if(scene!=null&&scene.startsWith("qrscene_"))scene=scene.substring(8);
        if(scene==null||!scene.startsWith("admin_notice_")){if("subscribe".equalsIgnoreCase(event))mapper.following(appId,openId,1,eventAt);return;}
        String hash=validNonce(scene.substring(13));Map<String,Object> row=mapper.lockChallenge(hash);
        if(row==null||row.get("consumedAt")!=null||!appId.equals(row.get("appId")))return;
        LocalDateTime expires=time(row.get("expiresAt"));if(expires==null||!expires.isAfter(now()))return;
        String candidate=(String)row.get("candidateOpenId");if(candidate!=null&&!candidate.equals(openId))throw new BusinessException("该绑定凭证已被使用，请重新发起");
        LocalDateTime previous=time(row.get("eventAt"));if(previous!=null&&!eventAt.isAfter(previous))return;
        if(mapper.candidate(hash,openId,eventAt)!=1)throw new BusinessException("绑定凭证状态已变化");
    }
}
