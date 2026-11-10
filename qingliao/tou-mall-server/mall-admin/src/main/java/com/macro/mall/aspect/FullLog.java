package com.macro.mall.aspect;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

//执行后需要补充日志记录的,返回值需要map类型，并确定保存和返回的字段名
@Target(ElementType.METHOD)
@Retention(RetentionPolicy.RUNTIME)
public @interface FullLog {
    String saveLogField() default ""; // 指定要保存的字段名

    String returnField() default ""; // 指定要返回的字段名
}
