package com.macro.mall.service;

import com.macro.mall.bo.AdminNoticeJob;
import com.macro.mall.common.exception.BusinessException;
import com.macro.mall.mapper.AdminApprovalNoticeMapper;
import com.macro.mall.mapper.AdminNoticeBindingMapper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.sql.Timestamp;
import java.time.*;
import java.time.format.DateTimeFormatter;
import java.util.*;

/**
 * 审批提醒的投递状态机：占用任务、记录结果、退避重试。
 * 外部接口调用不在这里，避免把微信请求放在数据库事务里。
 */
@Service
public class AdminNoticeDeliveryService {
    private static final DateTimeFormatter TIME=DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm");
    @Autowired AdminApprovalNoticeMapper mapper;
    @Autowired AdminNoticeBindingMapper bindings;
    @Value("${fullyu.notice.admin-enabled:false}") boolean enabled;
    @Value("${fullyu.notice.mode:mock}") String mode;
    @Value("${fullyu.notice.admin-app-id:}") String appId;
    @Value("${fullyu.notice.admin-template-id:}") String templateId;
    Clock clock=Clock.system(ZoneId.of("Asia/Shanghai"));

    public boolean isLive(){return enabled&&"live".equalsIgnoreCase(trim(mode))&&!isBlank(appId);}

    /**
     * 占用一条到期待发送任务。返回null表示本次不发送（已完成、配置缺失或已过状态）。
     * 模板内容由调用方在事务外获取，避免在持锁期间访问微信接口。
     */
    @Transactional(rollbackFor=Exception.class)
    public AdminNoticeJob claim(Long id,String templateContent){
        if(id==null)return null;
        Map<String,Object> row=mapper.lock(id);
        if(row==null)return null;
        Long noticeId=number(row.get("id"));
        Long adminId=number(row.get("adminId"));
        Long approvalId=number(row.get("approvalId"));
        int attemptNo=number(row.get("attempts")).intValue()+1;
        LocalDateTime created=time(row.get("createTime"));
        if(created!=null&&created.isBefore(now().minusDays(30))){
            finish(noticeId,attemptNo,"EXPIRED","EXPIRED");
            return null;
        }
        // 首次开启真实发送时不要补推积压待办，避免绑定后集中轰炸。
        if(created!=null&&created.isBefore(now().minusHours(24))){
            finish(noticeId,attemptNo,"SUPERSEDED","STALE");
            return null;
        }
        if(!isLive()){
            finish(noticeId,attemptNo,"LIVE_BLOCKED","LIVE_DISABLED");
            return null;
        }
        if(mapper.current(noticeId)!=1){
            finish(noticeId,attemptNo,"SUPERSEDED","SUPERSEDED");
            return null;
        }
        if(adminId==null||mapper.activeAdmin(adminId)!=1){
            finish(noticeId,attemptNo,"INACTIVE","ADMIN_DISABLED");
            return null;
        }
        if(isBlank(templateId)){
            defer(noticeId,attemptNo,"NOT_CONFIGURED","TEMPLATE_MISSING");
            return null;
        }
        if(templateContent==null||AdminNoticeTemplate.keys(templateContent).isEmpty()){
            defer(noticeId,attemptNo,"NOT_CONFIGURED","TEMPLATE_INVALID");
            return null;
        }
        String openId=mapper.followingOpenId(adminId,appId);
        if(isBlank(openId)){
            defer(noticeId,attemptNo,"NOT_BOUND","NOT_FOLLOWED");
            return null;
        }
        if(mapper.claim(noticeId)!=1)return null;
        AdminNoticeJob job=new AdminNoticeJob();
        job.setNoticeId(noticeId);job.setAdminId(adminId);job.setApprovalId(approvalId);
        job.setDetailId(number(row.get("detailId")));
        job.setKind(string(row.get("kind")));job.setApprovalState(row.get("approvalState")==null?null:number(row.get("approvalState")).intValue());
        job.setAttemptNo(attemptNo);job.setOpenId(openId);job.setTemplateId(trim(templateId));
        job.setContext(context(row));
        return job;
    }

    @Transactional(rollbackFor=Exception.class)
    public void delivered(AdminNoticeJob job,String messageId){
        mapper.attempt(job.getNoticeId(),job.getAttemptNo(),"SENT","WECHAT_OK",job.getTemplateId());
        if(mapper.finish(job.getNoticeId(),"SENT","WECHAT_OK")!=1)throw new BusinessException("审批提醒状态已变化");
    }

    /** 发送失败按分类回写；关注/授权失效立即清掉关注标记，避免持续碰壁。 */
    @Transactional(rollbackFor=Exception.class)
    public void failed(AdminNoticeJob job,String state,String result){
        mapper.attempt(job.getNoticeId(),job.getAttemptNo(),state,result,job.getTemplateId());
        if("NOT_BOUND".equals(state)&&job.getOpenId()!=null){
            bindings.markUnfollowed(appId,job.getOpenId());
        }
        if(mapper.defer(job.getNoticeId(),state,result)!=1)throw new BusinessException("审批提醒状态已变化");
    }

    private void finish(Long id,int attemptNo,String state,String result){
        mapper.attempt(id,attemptNo,state,result,trim(templateId));
        if(mapper.finish(id,state,result)!=1)throw new BusinessException("审批提醒状态已变化");
    }

    private void defer(Long id,int attemptNo,String state,String result){
        mapper.attempt(id,attemptNo,state,result,trim(templateId));
        if(mapper.defer(id,state,result)!=1)throw new BusinessException("审批提醒状态已变化");
    }

    private Map<String,String> context(Map<String,Object> row){
        Map<String,String> ctx=new LinkedHashMap<>();
        String kind=string(row.get("kind"));
        Integer approvalState=row.get("approvalState")==null?null:number(row.get("approvalState")).intValue();
        ctx.put("title",cut(firstNonBlank(string(row.get("categoryTitle")),"审批待办"),20));
        ctx.put("status",statusText(kind,approvalState));
        Long approvalId=number(row.get("approvalId"));
        ctx.put("code",approvalId==null?"":String.valueOf(approvalId));
        ctx.put("person",cut(firstNonBlank(string(row.get("applicant")),"同事"),10));
        LocalDateTime approvalCreateTime=time(row.get("approvalCreateTime"));
        ctx.put("time",(approvalCreateTime==null?now():approvalCreateTime).format(TIME));
        ctx.put("remark","点击查看详情");
        return ctx;
    }

    static String statusText(String kind,Integer approvalState){
        int state=approvalState==null?2:approvalState;
        if("PENDING".equals(kind))return "待审批";
        if("CC".equals(kind))return "抄送";
        if(state==3)return "已通过";
        if(state==4)return "已退回";
        if(state==0)return "已撤回";
        return "已处理";
    }

    private LocalDateTime now(){return LocalDateTime.now(clock);}
    private static LocalDateTime time(Object value){
        if(value instanceof LocalDateTime)return (LocalDateTime)value;
        if(value instanceof Timestamp)return ((Timestamp)value).toLocalDateTime();
        return null;
    }
    private static Long number(Object value){
        if(value instanceof Number)return ((Number)value).longValue();
        if(value==null)return 0L;
        try{return Long.valueOf(String.valueOf(value));}catch(NumberFormatException e){return 0L;}
    }
    private static String string(Object value){return value==null?null:String.valueOf(value);}
    private static String trim(String value){return value==null?"":value.trim();}
    private static boolean isBlank(String value){return value==null||value.trim().isEmpty();}
    private static String firstNonBlank(String first,String fallback){return isBlank(first)?fallback:first.trim();}
    private static String cut(String text,int max){return text.length()<=max?text:text.substring(0,max);}
}