package com.macro.mall.pay;

import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;

import java.util.Arrays;
import java.util.List;

/**
 * 启动时审计汇付配置，把"缺了哪个环境变量"提前到启动日志里。
 *
 * <p>不 fail-fast 是刻意的：缺支付配置时整站（登录、课程、预约）仍然可用，
 * 让应用起不来反而扩大故障面。真正的硬闸门放在发布脚本
 * {@code scripts/deploy-prod.sh}（发布前查 env 文件、起进程后查 environ）。
 * 这里负责把问题写进日志并给出可执行的修复提示，避免又出现"上线两小时后用户点支付才发现"。</p>
 */
@Component
@Slf4j
public class PayConfigAuditor implements ApplicationRunner {

    private final Environment environment;

    public PayConfigAuditor(Environment environment) {
        this.environment = environment;
    }

    @Override
    public void run(ApplicationArguments args) {
        List<String> missing = PayConfigGuard.missingKeys();
        if (missing.isEmpty()) {
            log.info("汇付支付配置自检通过：{} 个必需键齐全", PayConfigGuard.REQUIRED_KEYS.size());
            return;
        }
        String tip = "汇付支付配置缺失，支付/退款不可用: " + String.join(", ", missing)
                + "（检查 /etc/fullyu/qingliao.env 是否注入、start 脚本是否 set -a source）";
        if (Arrays.asList(environment.getActiveProfiles()).contains("prod")) {
            log.error(tip);
        } else {
            log.warn("{}（非 prod 环境，仅提示）", tip);
        }
    }
}
