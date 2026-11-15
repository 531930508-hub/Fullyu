package com.macro.mall.service;

import com.macro.mall.bo.AdminNoticeJob;
import com.macro.mall.common.exception.BusinessException;
import com.macro.mall.mapper.AdminApprovalNoticeMapper;
import com.macro.mall.mapper.AdminNoticeBindingMapper;
import lombok.extern.slf4j.Slf4j;
import me.chanjar.weixin.common.error.WxErrorException;
import me.chanjar.weixin.mp.bean.template.WxMpTemplateData;
import me.chanjar.weixin.mp.bean.template.WxMpTemplateMessage;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.time.*;
import java.time.format.DateTimeFormatter;
import java.util.*;

/**
 * 已提交审批的定向提醒：业务事务内只排队，提交后由定时任务向本人绑定的openid发送。
 * 真正的模板消息发送、重试与状态回写在 AdminNoticeDeliveryService / AdminNoticeWxSender。
 */
@Service
@Slf4j
public class AdminApprovalNoticeService {
    private static final DateTimeFormatter TIME=DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm");
    @Autowired AdminApprovalNoticeMapper mapper;
    @Autowired AdminNoticeBindingMapper bindings;
    @Autowired AdminNoticeDeliveryService delivery;
    @Autowired AdminNoticeWxSender sender;
    @Autowired(required=false) AdminNoticeLinkService linkService;
    @Value("${fullyu.notice.enabled:false}") boolean enabled;
    @Value("${fullyu.notice.admin-app-id:}") String appId;
    @Value("${fullyu.notice.admin-template-id:}") String templateId;
    @Value("${fullyu.notice.admin-web-url:}") String adminWebUrl;
    Clock clock=Clock.system(ZoneId.of("Asia/Shanghai"));

    public boolean isEnabled(){return enabled;}

    @Transactional(rollbackFor=Exception.class)
    public void advanceGeneration(Long approvalId){
        if(appId==null||appId.trim().isEmpty())return;
        if(!TransactionSynchronizationManager.isActualTransactionActive())throw new BusinessException("审批代际必须在事务内推进");
        mapper.advanceGeneration(approvalId);
    }

    /** 必须在审批业务事务内调用，保证提醒与审批数据同生共死。 */
    @Transactional(rollbackFor=Exception.class)
    public void capture(Long approvalId){
        if(!enabled)return;
        if(!TransactionSynchronizationManager.isActualTransactionActive())throw new BusinessException("审批提醒必须在事务内排队");
        if(appId==null||appId.trim().isEmpty())return;
        mapper.capture(approvalId);
    }

    /** 单条提醒的投递：先取模板内容，再占用任务，最后发消息并回写结果。 */
    public void process(Long id){
        if(!enabled||id==null)return;
        String content=null;
        try{content=sender.templateContent(trim(appId),trim(templateId));}
        catch(WxErrorException e){log.warn("审批提醒模板读取失败 template={} code={}",templateId,e.getError().getErrorCode());}
        AdminNoticeJob job;
        try{job=delivery.claim(id,content);}
        catch(BusinessException e){log.warn("审批提醒状态回写失败 id={} reason={}",id,e.getMessage());return;}
        if(job==null)return;
        String messageId;
        try{
            List<WxMpTemplateData> data=AdminNoticeTemplate.render(content,job.getContext());
            String url=link(job);
            log.info("审批提醒跳转 notice={} approval={} detail={} linkReady={} url={}",id,job.getApprovalId(),job.getDetailId(),linkService!=null,url);
            WxMpTemplateMessage message=WxMpTemplateMessage.builder()
                .toUser(job.getOpenId()).templateId(job.getTemplateId()).url(url).data(data).build();
            messageId=sender.send(trim(appId),message);
        }catch(WxErrorException e){
            String[] outcome=classify(e.getError().getErrorCode());
            log.warn("审批提醒发送失败 notice={} code={} state={}",id,e.getError().getErrorCode(),outcome[0]);
            delivery.failed(job,outcome[0],outcome[1]);
            return;
        }catch(Exception e){
            log.warn("审批提醒发送异常 notice={}",id,e);
            delivery.failed(job,"SEND_FAILED","SEND_ERROR");
            return;
        }
        // 微信已受理后不再回写失败，避免重复发送；回写失败留给SENDING超时重投。
        try{delivery.delivered(job,messageId);}
        catch(Exception e){log.warn("审批提醒已发送但状态回写失败 notice={}",id,e);return;}
        log.info("审批提醒已发送 notice={} approval={} kind={}",job.getNoticeId(),job.getApprovalId(),job.getKind());
    }

    /** 自助发送一条测试消息，用同一模板、同一绑定关系验证真实链路。 */
    public Map<String,Object> sendTest(Long adminId){
        if(!delivery.isLive())throw new BusinessException("真实发送未开启，需要服务端 mode=live 并配置模板ID");
        if(adminId==null||adminId<=0)throw new BusinessException("请先登录后台");
        if(trim(templateId).isEmpty())throw new BusinessException("尚未配置消息模板ID");
        String content;
        try{content=sender.templateContent(trim(appId),trim(templateId));}
        catch(WxErrorException e){throw new BusinessException("读取消息模板失败，请核对公众号配置");}
        if(content==null||AdminNoticeTemplate.keys(content).isEmpty())throw new BusinessException("消息模板不可用，请核对模板ID是否属于该公众号");
        Map<String,Object> binding=bindings.binding(adminId,trim(appId));
        String openId=binding==null?null:(String)binding.get("openId");
        if(openId==null||openId.trim().isEmpty())throw new BusinessException("请先绑定服务号");
        if(!Integer.valueOf(1).equals(binding.get("following")))throw new BusinessException("尚未确认关注服务号，请关注后重新绑定");
        Map<String,Object> recent=bindings.recentTestSends(adminId);
        if(count(recent,"lastMinute")>=1)throw new BusinessException("测试消息每分钟最多一条，请稍后再试");
        if(count(recent,"lastDay")>=10)throw new BusinessException("今日测试消息已达上限，请明天再试");
        Map<String,String> context=new HashMap<>();
        context.put("title","审批通知测试");
        context.put("status","测试");
        context.put("code","TEST");
        String name=bindings.adminName(adminId);
        context.put("person",cut(name==null||name.trim().isEmpty()?"同事":name.trim(),10));
        context.put("time",LocalDateTime.now(clock).format(TIME));
        context.put("remark","这是后台发送的测试消息");
        try{
            List<WxMpTemplateData> data=AdminNoticeTemplate.render(content,context);
            String messageId=sender.send(trim(appId),WxMpTemplateMessage.builder()
                .toUser(openId).templateId(trim(templateId)).url(link(null)).data(data).build());
            bindings.audit(adminId,"TEST_SENT");
            Map<String,Object> result=new LinkedHashMap<>();
            result.put("messageId",messageId);
            return result;
        }catch(WxErrorException e){
            int code=e.getError().getErrorCode();
            if(code==43004||code==40003)bindings.markUnfollowed(trim(appId),openId);
            throw new BusinessException("发送失败（"+code+"），请检查关注状态和模板配置");
        }
    }

    public Map<String,Object> logs(Long adminId,int page,int size){
        if(adminId==null||adminId<=0)throw new BusinessException("请先登录后台");
        if(mapper.activeAdmin(adminId)!=1)throw new BusinessException("后台账号不可用");
        if(page<1||size<1||size>100)throw new BusinessException("分页参数不合法");
        List<Map<String,Object>> rows=mapper.logs(adminId,(page-1)*size,size);
        List<Map<String,Object>> list=new ArrayList<>();
        for(Map<String,Object> row:rows){
            Map<String,Object> item=new LinkedHashMap<>();
            item.put("id",row.get("id"));
            item.put("approvalId",row.get("approvalId"));
            item.put("kind",row.get("kind"));
            item.put("state",row.get("state"));
            item.put("result",row.get("lastResult"));
            item.put("createTime",row.get("createTime"));
            item.put("finishTime",row.get("finishTime"));
            list.add(item);
        }
        Map<String,Object> result=new LinkedHashMap<>();
        result.put("list",list);
        result.put("total",mapper.count(adminId));
        result.put("pageNum",page);
        result.put("pageSize",size);
        return result;
    }

    private String link(AdminNoticeJob job){
        Long detailId=job==null?null:job.getDetailId();
        if(job!=null&&(detailId==null||detailId<=0)&&job.getNoticeId()!=null){
            detailId=mapper.noticeDetailId(job.getNoticeId());
        }
        String deep=linkService==null||job==null?null:linkService.approvalUrl(job.getApprovalId(),detailId,job.getAdminId());
        if(deep!=null)return deep;
        String base=trim(adminWebUrl);
        if(base.isEmpty()||!(base.startsWith("https://")||base.startsWith("http://")))return null;
        while(base.endsWith("/"))base=base.substring(0,base.length()-1);
        return base+"/#/todo/index";
    }

    /** 微信错误码归类：关注失效与模板/授权问题分别退避，其余按发送失败重试。 */
    static String[] classify(int code){
        if(code==43004)return new String[]{"NOT_BOUND","NOT_FOLLOWED"};
        if(code==40003)return new String[]{"NOT_BOUND","INVALID_OPENID"};
        if(code==40037||code==47003)return new String[]{"NOT_CONFIGURED","TEMPLATE_INVALID"};
        if(code==40001||code==40013||code==40125||code==48001)return new String[]{"NOT_CONFIGURED","AUTH_INVALID"};
        return new String[]{"SEND_FAILED","WECHAT_"+code};
    }

    private static int count(Map<String,Object> row,String key){
        if(row==null)return 0;
        Object value=row.get(key);
        return value instanceof Number?((Number)value).intValue():0;
    }
    private static String trim(String value){return value==null?"":value.trim();}
    private static String cut(String text,int max){return text.length()<=max?text:text.substring(0,max);}
}