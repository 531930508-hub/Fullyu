package com.macro.mall.utils;

import org.springframework.aop.framework.AopContext;
import org.springframework.beans.BeansException;
import org.springframework.context.ApplicationContext;
import org.springframework.context.ApplicationContextAware;
import org.springframework.stereotype.Component;

/**
 * @author jinlong
 */
@Component
public class ContextUtil implements ApplicationContextAware {


    private static ApplicationContext applicationContext;

    @Override
    public void setApplicationContext(ApplicationContext applicationContext) throws BeansException {
        ContextUtil.applicationContext = applicationContext;
    }

    public static ApplicationContext getApplicationContext() {
        return applicationContext;
    }

    public static <T> T getBeanByName(String name) {
        return (T) applicationContext.getBean(name);
    }

    public static <T> T getBeanByClass(Class clazz) {
        return (T) applicationContext.getBean(clazz);
    }

    public static <T> T getBean(T clazz) {
        return (T) AopContext.currentProxy();
    }

}