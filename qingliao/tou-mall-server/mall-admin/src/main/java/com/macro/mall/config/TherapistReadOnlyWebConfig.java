package com.macro.mall.config;

import com.macro.mall.component.TherapistReadOnlyInterceptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/**
 * 注册疗愈师排班看板只读拦截器。
 */
@Configuration
public class TherapistReadOnlyWebConfig implements WebMvcConfigurer {

    @Autowired
    private TherapistReadOnlyInterceptor therapistReadOnlyInterceptor;

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(therapistReadOnlyInterceptor)
                .addPathPatterns("/**")
                .excludePathPatterns(
                        "/v2/api-docs",
                        "/swagger-resources/**",
                        "/swagger-ui.html",
                        "/webjars/**",
                        "/favicon.ico",
                        "/actuator/**");
    }
}