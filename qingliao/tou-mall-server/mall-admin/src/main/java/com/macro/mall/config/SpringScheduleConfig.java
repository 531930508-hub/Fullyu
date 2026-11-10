package com.macro.mall.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.SchedulingConfigurer;
import org.springframework.scheduling.concurrent.ThreadPoolTaskScheduler;
import org.springframework.scheduling.config.ScheduledTaskRegistrar;

import java.util.concurrent.ThreadPoolExecutor;

/**
 * Created by oahnus on 2025/6/19
 *
 * @author oahnus
 */
@EnableScheduling
@Configuration
public class SpringScheduleConfig implements SchedulingConfigurer {

    @Override
    public void configureTasks(ScheduledTaskRegistrar taskRegistrar) {
        ThreadPoolTaskScheduler scheduler = new ThreadPoolTaskScheduler();
        scheduler.setPoolSize(10);                   // 线程数（根据任务量调整）
        scheduler.setThreadNamePrefix("mallSched-");      // 线程名前缀
        scheduler.setRejectedExecutionHandler(        // 拒绝策略
                new ThreadPoolExecutor.CallerRunsPolicy() // 由调用线程执行任务
        );
        scheduler.initialize();
        taskRegistrar.setTaskScheduler(scheduler);
    }
}
