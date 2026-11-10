package com.macro.mall.service;

import com.macro.mall.common.exception.BusinessException;
import com.macro.mall.mapper.AdminApprovalNoticeMapper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import java.sql.Timestamp;
import java.time.LocalDateTime;
import java.util.*;

/** 事务内只写outbox；独立事务读取已提交记录后进行mock评估，绝不调用微信SDK。 */
@Service
public class AdminApprovalNoticeService {
    @Autowired AdminApprovalNoticeMapper mapper;
    @Value("${fullyu.notice.admin-enabled:false}") boolean enabled;
    @Value("${fullyu.notice.admin-app-id:}") String appId;
    @Value("${fullyu.notice.admin-template-id:}") String templateId;
    @Value("${fullyu.notice.mode:mock}") String mode;
    public boolean isEnabled(){return enabled;}
    private void requireBusinessTransaction(Long approvalId){
        if(approvalId==null||approvalId<=0||!TransactionSynchronizationManager.isActualTransactionActive())throw new BusinessException("审批提醒必须与业务记录一并保存");
    }
    public void advanceGeneration(Long approvalId){
        if(!enabled)return;
        requireBusinessTransaction(approvalId);
        if(mapper.advanceGeneration(approvalId)<1)throw new BusinessException("审批提醒代际保存失败");
    }
    public void capture(Long approvalId){
        if(!enabled)return;
        requireBusinessTransaction(approvalId);
        mapper.capture(approvalId);
    }
    @Transactional(rollbackFor=Exception.class)
    public void process(Long id){
        if(!enabled)return;
        Map<String,Object> row=mapper.lock(id);
        if(row==null||!Arrays.asList("PENDING","NOT_CONFIGURED","NOT_BOUND").contains(row.get("state")))return;
        String status;
        Object created=row.get("createTime");LocalDateTime createdAt=created instanceof Timestamp?((Timestamp)created).toLocalDateTime():created instanceof LocalDateTime?(LocalDateTime)created:null;
        if(createdAt!=null&&createdAt.isBefore(LocalDateTime.now().minusDays(30)))status="EXPIRED";
        else if(mapper.current(id)!=1)status="SUPERSEDED";
        else if(mapper.activeAdmin(((Number)row.get("adminId")).longValue())!=1)status="INACTIVE";
        else if(templateId==null||templateId.trim().isEmpty()||appId==null||appId.trim().isEmpty())status="NOT_CONFIGURED";
        else if(!"mock".equals(mode))status="LIVE_BLOCKED";
        else if(mapper.boundAndFollowing(((Number)row.get("adminId")).longValue(),appId)!=1)status="NOT_BOUND";
        else status="MOCK";
        int attempt=((Number)row.get("attempts")).intValue()+1;
        // 原评估日志不覆盖；缺配置/绑定每小时重新评估，并在30天后结束。
        if(mapper.attempt(id,attempt,status,templateId==null?"":templateId)!=1)throw new BusinessException("审批提醒评估记录保存失败");
        int changed=Arrays.asList("NOT_CONFIGURED","NOT_BOUND").contains(status)?mapper.defer(id,status):mapper.finish(id,status);
        if(changed!=1)throw new BusinessException("审批提醒状态已变化");
    }
    public Map<String,Object> logs(Long admin,int page,int size){
        if(admin==null||admin<=0)throw new BusinessException("请先登录后台");
        if(page<1||page>100000||size<1||size>100)throw new BusinessException("分页参数不正确");
        if(enabled&&mapper.activeAdmin(admin)!=1)throw new BusinessException("后台账号不可用");
        Map<String,Object> result=new LinkedHashMap<>();result.put("realDeliveryEnabled",false);
        result.put("list",enabled?mapper.logs(admin,(page-1)*size,size):Collections.emptyList());result.put("total",enabled?mapper.count(admin):0L);return result;
    }
}
