package com.macro.mall.service.base;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.github.pagehelper.PageHelper;
import com.github.pagehelper.PageInfo;
import com.macro.mall.utils.CustomUtil;
import org.springframework.util.ObjectUtils;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 基础服务
 *
 * @param <M> mapper
 * @param <T> 实体
 * @author jinlong
 * @date 2021/10/21
 */
public class BaseService<M extends BaseMapper<T>, T> extends ServiceImpl<M, T> {

    /**
     * 分页查询
     *
     * @param params
     * @return
     */
    public PageInfo<T> page(Map<String, Object> params) {
        List<T> list = listByPage(params);
        return new PageInfo(list);
    }

    /**
     * 无分页list
     *
     * @param params
     * @return
     */
    public List<T> listNoPage(Map<String, Object> params) {
        QueryWrapper<T> queryWrapper = buildParams(params);
        Object all = params.get("all");
        if (all == null) {
            Object limit = params.get("limit");
            if (limit == null) {
                limit = "200";
            }
            queryWrapper.last("limit " + limit);
        }
        return list(queryWrapper);
    }

    /**
     * 分页查询获取list
     *
     * @param params
     * @return
     */
    public List<T> listByPage(Map<String, Object> params) {
        QueryWrapper<T> queryWrapper = buildParams(params);
        //queryWrapper.groupBy("type");
        PageHelper.startPage(getNumber(params, "page"), getNumber(params, "size"));
        return list(queryWrapper);
    }

    /**
     * 只查询一条记录
     *
     * @param queryWrapper
     * @return
     */
    public T getOnlyOne(QueryWrapper<T> queryWrapper) {
        queryWrapper.last("limit 1");
        return this.getOne(queryWrapper, false);
    }

    /**
     * 只查询一条记录
     *
     * @param queryWrapper
     * @return
     */
    public T getOnlyOne(LambdaQueryWrapper<T> queryWrapper) {
        queryWrapper.last("limit 1");
        return this.getOne(queryWrapper, false);
    }

    /**
     * 构建查询条件
     * 子类可重写此方法
     *
     * @param params
     * @param queryWrapper
     * @return
     */
    protected QueryWrapper<T> buildWrapper(Map<String, Object> params, QueryWrapper<T> queryWrapper) {
        return queryWrapper;
    }


    private int getNumber(Map<String, Object> params, String key) {
        Object page = params.get(key);
        if (page != null) {
            return Integer.parseInt(page.toString());
        }
        return "size".equalsIgnoreCase(key) ? 10 : 1;
    }

    public void startPage(Map<String, Object> params) {
        PageHelper.startPage(getNumber(params, "page"), getNumber(params, "size"));
    }

    /**
     * 查询参数封装
     *
     * @param params
     * @return
     */
    protected QueryWrapper<T> buildParams(Map<String, Object> params) {
        QueryWrapper<T> queryWrapper = new QueryWrapper<>();
        if (params == null) {
            return queryWrapper;
        } else {
            buildWrapper(humpToLine(params), queryWrapper);
        }
        Object order = params.get("order");
        if (!ObjectUtils.isEmpty(order)) {
            String[] orderArr = order.toString().split(",");
            for (String o : orderArr) {
                o = CustomUtil.humpToLine(o);
                if (o.startsWith("-")) {
                    queryWrapper.orderByDesc(o.substring(1));
                } else {
                    queryWrapper.orderByAsc(o);
                }
            }
        }
        return queryWrapper;
    }

    /**
     * 将驼峰参数转为下划线参数
     *
     * @param params
     * @return
     */
    private Map<String, Object> humpToLine(Map<String, Object> params) {
        Map<String, Object> resultParams = new HashMap<>(params.size());
        params.forEach((k, v) -> {
            resultParams.put(CustomUtil.humpToLine(k), v);
        });
        return resultParams;
    }
}
