package com.macro.mall.config;

import com.alibaba.ttl.threadpool.TtlExecutors;
import lombok.extern.slf4j.Slf4j;
import org.springframework.aop.interceptor.AsyncUncaughtExceptionHandler;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.AsyncConfigurer;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;

import java.util.concurrent.Executor;
import java.util.concurrent.ThreadPoolExecutor;

/**
 * @author jinlong
 * @Async异步线程池配置
 * @date 2021/11/11
 */
@Configuration
@Slf4j
public class AsyncThreadPoolConfig implements AsyncConfigurer {
    @Bean("ppzAsync")
    public Executor executor() {
        ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
        int corePoolSize = 10;
        executor.setCorePoolSize(corePoolSize);
        int maxPoolSize = 20;
        executor.setMaxPoolSize(maxPoolSize);
        int queueCapacity = 10;
        executor.setQueueCapacity(queueCapacity);
        executor.setRejectedExecutionHandler(new ThreadPoolExecutor.CallerRunsPolicy());
        String threadNamePrefix = "ppzAsync-";
        executor.setThreadNamePrefix(threadNamePrefix);
        executor.setWaitForTasksToCompleteOnShutdown(true);
        int awaitTerminationSeconds = 5;
        executor.setAwaitTerminationSeconds(awaitTerminationSeconds);
        executor.initialize();
        return TtlExecutors.getTtlExecutorService(executor.getThreadPoolExecutor());
    }

    @Override
    public Executor getAsyncExecutor() {
        return executor();
    }

    @Override
    public AsyncUncaughtExceptionHandler getAsyncUncaughtExceptionHandler() {
        return (ex, method, params) -> log.error("执行异步任务出错,method={},params={},ex={}", method, params, ex);
    }
}
