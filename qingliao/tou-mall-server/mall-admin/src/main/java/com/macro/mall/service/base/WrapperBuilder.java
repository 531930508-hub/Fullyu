package com.macro.mall.service.base;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import lombok.Data;
import org.apache.logging.log4j.util.Strings;
import org.springframework.util.ObjectUtils;

import java.util.Arrays;
import java.util.List;
import java.util.Map;

/**
 * 查询构造器
 *
 * @author jinlong
 */
@Data
public class WrapperBuilder {
    QueryWrapper queryWrapper;
    Map<String, Object> params;

    public static WrapperBuilder init(QueryWrapper queryWrapper, Map<String, Object> params) {
        WrapperBuilder builder = new WrapperBuilder();
        builder.setQueryWrapper(queryWrapper);
        builder.setParams(params);
        return builder;
    }

    public WrapperBuilder equal(String dbKey, Object value) {
        this.queryWrapper.eq(dbKey, value);
        return this;
    }

    public WrapperBuilder equal(String dbKey) {
        Object propObj = params.get(dbKey);
        if (propObj != null) {
            String propValue = propObj.toString().trim();
            if (Strings.isNotBlank(propValue)) {
                equal(dbKey, propValue);
            }
        }
        return this;
    }

    public WrapperBuilder ne(String dbKey, Object value) {
        this.queryWrapper.ne(dbKey, value);
        return this;
    }

    public WrapperBuilder ne(String dbKey) {
        Object propObj = params.get(dbKey);
        if (propObj != null) {
            String propValue = propObj.toString().trim();
            if (Strings.isNotBlank(propValue)) {
                ne(dbKey, propValue);
            }
        }
        return this;
    }

    public WrapperBuilder lt(String dbKey, Object value) {
        this.queryWrapper.lt(dbKey, value);
        return this;
    }

    public WrapperBuilder lt(String dbKey) {
        Object propObj = params.get(dbKey);
        if (propObj != null) {
            String propValue = propObj.toString().trim();
            if (Strings.isNotBlank(propValue)) {
                lt(dbKey, propValue);
            }
        }
        return this;
    }

    public WrapperBuilder ge(String dbKey, Object value) {
        this.queryWrapper.ge(dbKey, value);
        return this;
    }
    public WrapperBuilder ge(String dbKey) {
        Object propObj = params.get(dbKey);
        if (propObj != null) {
            String propValue = propObj.toString().trim();
            if (Strings.isNotBlank(propValue)) {
                ge(dbKey, propValue);
            }
        }
        return this;
    }

    public WrapperBuilder le(String dbKey, Object value) {
        this.queryWrapper.le(dbKey, value);
        return this;
    }
    public WrapperBuilder le(String dbKey) {
        Object propObj = params.get(dbKey);
        if (propObj != null) {
            String propValue = propObj.toString().trim();
            if (Strings.isNotBlank(propValue)) {
                le(dbKey, propValue);
            }
        }
        return this;
    }
    /**
     * @param dbKey    字段名
     * @param paramKey 参数名
     * @return
     */
    public WrapperBuilder paramKeyEqual(String dbKey, String paramKey) {
        Object propObj = params.get(paramKey);
        if (propObj != null) {
            String propValue = propObj.toString().trim();
            if (Strings.isNotBlank(propValue)) {
                equal(dbKey, propValue);
            }
        }
        return this;
    }

    public WrapperBuilder in(String dbKey, List<Object> value) {
        if (ObjectUtils.isEmpty(value) || value.size() == 0) {
            return this;
        }
        this.queryWrapper.in(dbKey, value);
        return this;
    }

    /**
     * 查询参数以逗号分割后传入
     *
     * @param dbKey
     * @return
     */
    public WrapperBuilder in(String dbKey) {
        Object propObj = params.get(dbKey);
        if (propObj != null) {
            String value = propObj.toString();
            if (Strings.isNotBlank(value)) {
                List list = Arrays.asList(value.split(","));
                in(dbKey, list);
            }
        }
        return this;
    }

    public WrapperBuilder like(String dbKey, Object value) {
        if (value == null){
            return this;
        }
        this.queryWrapper.like(dbKey, value);
        return this;
    }

    public WrapperBuilder like(String dbKey) {
        Object propObj = params.get(dbKey);
        if (propObj != null) {
            String propValue = propObj.toString().trim();
            if (Strings.isNotBlank(propValue)) {
                like(dbKey, propValue);
            }
        }
        return this;
    }

    public WrapperBuilder likeRight(String dbKey, Object value) {
        this.queryWrapper.likeRight(dbKey, value);
        return this;
    }

    public WrapperBuilder or() {
        this.queryWrapper.or();
        return this;
    }

    public WrapperBuilder likeRight(String dbKey) {
        Object propObj = params.get(dbKey);
        if (propObj != null) {
            String propValue = propObj.toString().trim();
            if (Strings.isNotBlank(propValue)) {
                likeRight(dbKey, propValue);
            }
        }
        return this;
    }

    public WrapperBuilder between(String dbKey, Object start, Object end) {
        if (start != null && end != null) {
            this.queryWrapper.between(dbKey, start, end);
        }
        return this;
    }

    public WrapperBuilder between(String dbKey) {
        Object start = params.get("start");
        Object end = params.get("end");
        return this.between(dbKey, start, end);
    }
}
