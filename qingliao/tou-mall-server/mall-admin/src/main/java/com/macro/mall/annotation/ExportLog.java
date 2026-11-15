package com.macro.mall.annotation;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * 标记后台导出入口。导出成功后由切面自动写导出台账，避免维护接口清单。
 *
 * <p>module 是稳定标识（用于筛选/统计），value 是运营看到的模块名称。</p>
 */
@Target(ElementType.METHOD)
@Retention(RetentionPolicy.RUNTIME)
public @interface ExportLog {
    String module();

    String value();
}