package com.macro.mall.incentive.service;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * 内训三人考核开关与窗口。默认关闭，仅在测试环境通过环境变量打开。
 */
@Component
public class TrainingTeamCertProperties {

    @Value("${incentive.team-cert-enabled:false}")
    private boolean enabled;

    @Value("${incentive.team-cert-backfill-days:30}")
    private int backfillDays;

    @Value("${incentive.team-cert-duplicate-minutes:10}")
    private int duplicateMinutes;

    public boolean enabled() {
        return enabled;
    }

    public int backfillDays() {
        return backfillDays;
    }

    public int duplicateMinutes() {
        return duplicateMinutes;
    }
}
