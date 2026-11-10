package com.macro.mall.config;

import com.baomidou.mybatisplus.extension.plugins.MybatisPlusInterceptor;
import com.baomidou.mybatisplus.extension.plugins.inner.OptimisticLockerInnerInterceptor;
import com.macro.mall.common.exception.MyOptimisticLockException;
import org.mybatis.spring.annotation.MapperScan;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.transaction.annotation.EnableTransactionManagement;

/**
 * MyBatis相关配置
 * Created by macro on 2019/4/8.
 */
@Configuration
@EnableTransactionManagement
public class MyBatisConfig {
    @Bean
    public MybatisPlusInterceptor mybatisPlusInterceptor() {
        MybatisPlusInterceptor interceptor = new MybatisPlusInterceptor();
        OptimisticLockerInnerInterceptor innerInterceptor = new OptimisticLockerInnerInterceptor();
        innerInterceptor.setException(new MyOptimisticLockException());
        interceptor.addInnerInterceptor(innerInterceptor);
        return interceptor;
    }
}
