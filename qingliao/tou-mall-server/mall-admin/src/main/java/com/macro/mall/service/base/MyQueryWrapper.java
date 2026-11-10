package com.macro.mall.service.base;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.baomidou.mybatisplus.core.toolkit.CollectionUtils;

import java.util.Collection;
import java.util.Collections;
import java.util.List;

/**
 * @author jinlong
 */
public class MyQueryWrapper<T> extends QueryWrapper<T> {
    public MyQueryWrapper() {
    }

    /**
     * 解决in 为空查询所有的情况
     *
     * @param column 数据库字段名
     * @param value  集合
     * @return
     */
    @Override
    public QueryWrapper<T> in(String column, Collection<?> value) {
        if (CollectionUtils.isEmpty(value)) {
            List<Integer> collection = Collections.singletonList(-1);
            return super.in(column, collection);
        }
        return super.in(column, value);
    }

    /**
     * 解决in 为空查询所有的情况
     *
     * @param condition 判断条件，true时添加此条件，否则不添加
     * @param column    数据库字段名
     * @param value     集合
     * @return
     */
    @Override
    public QueryWrapper<T> in(boolean condition, String column, Collection<?> value) {
        if (CollectionUtils.isEmpty(value)) {
            List<Integer> collection = Collections.singletonList(-1);
            return super.in(condition, column, collection);
        }
        return super.in(condition, column, value);
    }
}

