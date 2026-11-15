package com.macro.mall.config;

import com.macro.mall.component.ShopScopeInterceptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/**
 * 注册门店作用域拦截器（L1）。
 *
 * @author shop-scope
 */
@Configuration
public class ShopScopeWebConfig implements WebMvcConfigurer {

    @Autowired
    private ShopScopeInterceptor shopScopeInterceptor;

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(shopScopeInterceptor)
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