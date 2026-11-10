package com.macro.mall.service.job;

import com.macro.mall.mapper.PrepaidMemberRewardMapper;
import com.macro.mall.service.PrepaidMemberRewardService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import java.util.List;

@Component
@Slf4j
public class PrepaidMemberRewardScheduled {
    @Autowired PrepaidMemberRewardService rewards;
    @Autowired PrepaidMemberRewardMapper mapper;

    @Scheduled(cron="35 * * * * ?",zone="Asia/Shanghai")
    public void scheduled() { poll(); }

    public synchronized void poll() {
        if (!rewards.isEnabled()) return;
        List<Long> sourceIds=mapper.due();
        for (Long sourceId:sourceIds) {
            try { rewards.process(sourceId); }
            catch (Exception e) {
                log.warn("耗尽赠会员评估失败，sourceOrderId={}",sourceId);
                try {
                    if (mapper.defer(sourceId)!=1) log.warn("耗尽赠会员任务已变化，sourceOrderId={}",sourceId);
                } catch (Exception retryError) {
                    log.warn("耗尽赠会员任务退避保存失败，sourceOrderId={}",sourceId);
                }
            }
        }
    }
}
