package com.macro.mall.crm;

import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

/**
 * 会员中心熔断器：CRM 不可达时连续 N 次失败后短路一段时间。
 *
 * <p>没有它时，CRM 故障期间每个请求都要吃满 {@code crm.timeout-ms}×重试次数，
 * 登录、下单、卡面读取会在超时上排队，表现为「整站很慢」而不是「会员功能不可用」。
 * 短路期间调用方立刻拿到 503，登录等主流程可以按降级逻辑继续。</p>
 *
 * <p>只有「连不上/5xx」计入失败；409、422 这类业务响应说明 CRM 是活的，按成功重置计数。</p>
 */
@Component
@Slf4j
public class CrmCircuitBreaker {
    /** 连续失败多少次后打开。 */
    private static final int FAILURE_THRESHOLD = 5;
    /** 打开后多久放一个请求去试探（半开由下一次调用自然完成）。 */
    private static final long OPEN_MS = 30_000L;

    private int failures = 0;
    private long openUntil = 0L;

    /** 短路中：调用方应立刻返回不可用，不再发起网络请求。 */
    public synchronized boolean isOpen() {
        return System.currentTimeMillis() < openUntil;
    }

    public synchronized void recordSuccess() {
        failures = 0;
        openUntil = 0L;
    }

    public synchronized void recordFailure() {
        failures++;
        if (failures >= FAILURE_THRESHOLD) {
            failures = 0;
            openUntil = System.currentTimeMillis() + OPEN_MS;
            log.warn("会员中心连续失败达到阈值，熔断 {}ms", OPEN_MS);
        }
    }
}