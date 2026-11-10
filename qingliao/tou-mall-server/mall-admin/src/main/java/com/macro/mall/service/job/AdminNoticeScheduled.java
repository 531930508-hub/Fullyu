package com.macro.mall.service.job;

import com.macro.mall.mapper.AdminApprovalNoticeMapper;
import com.macro.mall.mapper.AdminNoticeBindingMapper;
import com.macro.mall.service.AdminApprovalNoticeService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import java.util.List;

@Component
@Slf4j
public class AdminNoticeScheduled {
    @Autowired AdminApprovalNoticeService notices;
    @Autowired AdminApprovalNoticeMapper mapper;
    @Autowired AdminNoticeBindingMapper bindings;
    @Scheduled(cron="15 * * * * ?",zone="Asia/Shanghai")
    public void scheduled(){poll();}
    public synchronized void poll(){
        if(!notices.isEnabled())return;
        try{bindings.purgeExpiredChallenges();}catch(Exception e){log.warn("过期服务号绑定凭证清理失败");}
        List<Long> ids=mapper.due();
        for(Long id:ids){try{notices.process(id);}catch(Exception e){log.warn("审批提醒评估失败，noticeId={}",id);}}
    }
}
