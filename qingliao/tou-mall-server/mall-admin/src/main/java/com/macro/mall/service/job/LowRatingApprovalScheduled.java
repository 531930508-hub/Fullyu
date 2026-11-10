package com.macro.mall.service.job;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.macro.mall.entity.MassagistRate;
import com.macro.mall.enums.FlowState;
import com.macro.mall.service.MassagistRateService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import java.math.BigDecimal;
import java.util.List;
import java.util.Objects;
import java.util.stream.Collectors;

/** 仅补入内部待办，不发送微信、短信或支付请求。每轮最多读取100条。 */
@Component
@Slf4j
public class LowRatingApprovalScheduled {
    @Autowired
    MassagistRateService massagistRateService;

    @Scheduled(cron = "0 0/5 * * * ?")
    public void retryPending() {
        List<Long> orderIds = massagistRateService.list(new LambdaQueryWrapper<MassagistRate>()
                .le(MassagistRate::getRating, BigDecimal.valueOf(4))
                .eq(MassagistRate::getReviewState, FlowState.NOT_SUBMIT.getValue())
                .isNull(MassagistRate::getApprovalId).orderByAsc(MassagistRate::getId).last("LIMIT 100"))
                .stream().map(MassagistRate::getOrderId).filter(Objects::nonNull).distinct().sorted()
                .collect(Collectors.toList());
        for (Long orderId : orderIds) {
            try {
                massagistRateService.enqueueLowRatings(orderId);
            } catch (Exception e) {
                // 不输出客户原文、手机号或外部异常详情。
                log.warn("低星反馈待办补入失败，orderId={}", orderId);
            }
        }
    }
}
