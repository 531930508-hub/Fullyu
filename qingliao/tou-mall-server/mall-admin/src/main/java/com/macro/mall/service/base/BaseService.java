package com.macro.mall.service.base;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.github.pagehelper.PageHelper;
import com.github.pagehelper.PageInfo;
import com.macro.mall.common.exception.BusinessException;
import com.macro.mall.security.util.SpringUtil;
import com.macro.mall.utils.CustomUtil;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.util.ObjectUtils;

import java.lang.reflect.Field;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 基础服务
 *
 * @param <M> mapper
 * @param <T> 实体
 * @author jinlong
 * @date 2021/10/21
 */
public class BaseService<M extends BaseMapper<T>, T> extends ServiceImpl<M, T> {

    private static final Logger LOGGER = LoggerFactory.getLogger(BaseService.class);

    /**
     * 按 id 读取单条记录时的门店校验（IDOR 防护）。
     *
     * <p>列表已经按授权收敛，但直接用 id 访问仍能绕过，因此在此处兜底：
     * 门店归属实体越界时拒绝；非门店实体（无 shopId 字段）与后台之外调用不受影响。</p>
     */
    @Override
    public T getById(java.io.Serializable id) {
        T entity = super.getById(id);
        checkShopAccessOf(entity);
        return entity;
    }

    @Override
    public boolean removeById(java.io.Serializable id) {
        checkShopAccessOf(super.getById(id));
        return super.removeById(id);
    }

    @Override
    public boolean updateById(T entity) {
        // 部分更新可能只带主键，若无 shopId 字段值则跳过（避免误伤）
        if (entity != null && readShopId(entity) != null) {
            checkShopAccessOf(entity);
        }
        return super.updateById(entity);
    }

    @Override
    public boolean save(T entity) {
        // 写侧防伪造：DTO/请求体里的 shopId 不能被客户端改成他店
        if (entity != null && readShopId(entity) != null) {
            checkShopAccessOf(entity);
        }
        return super.save(entity);
    }

    @Override
    public boolean saveBatch(java.util.Collection<T> entityList) {
        if (entityList != null) {
            for (T entity : entityList) {
                if (entity != null && readShopId(entity) != null) {
                    checkShopAccessOf(entity);
                }
            }
        }
        return super.saveBatch(entityList);
    }

    @Override
    public List<T> listByIds(java.util.Collection<? extends java.io.Serializable> idList) {
        List<T> list = super.listByIds(idList);
        if (list != null) {
            // 批量按 id 读取（导出/勾选场景）同样需要逐条校验
            for (T entity : list) {
                checkShopAccessOf(entity);
            }
        }
        return list;
    }

    private static final Map<Class<?>, Optional<Field>> SHOP_ID_FIELD_MAP = new ConcurrentHashMap<>();

    private Long readShopId(T entity) {
        if (entity == null) {
            return null;
        }
        Optional<Field> fieldOptional = SHOP_ID_FIELD_MAP.computeIfAbsent(entity.getClass(), clazz -> {
            for (Class<?> current = clazz; current != null && current != Object.class; current = current.getSuperclass()) {
                for (Field field : current.getDeclaredFields()) {
                    if ("shopId".equals(field.getName())) {
                        field.setAccessible(true);
                        return Optional.of(field);
                    }
                }
            }
            return Optional.empty();
        });
        if (!fieldOptional.isPresent()) {
            return null;
        }
        try {
            Object value = fieldOptional.get().get(entity);
            return value instanceof Number ? ((Number) value).longValue() : null;
        } catch (IllegalAccessException e) {
            LOGGER.warn("[SHOP_SCOPE] 读取门店字段失败: {}", entity.getClass().getName(), e);
            return null;
        }
    }

    private void checkShopAccessOf(T entity) {
        if (entity == null) {
            return;
        }
        ShopScope scope = ShopScopeHolder.current();
        if (scope == null || scope.isGlobal()) {
            return;
        }
        Long shopId = readShopId(entity);
        if (shopId == null || shopId <= 0) {
            return;
        }
        if (scope.contains(shopId)) {
            return;
        }
        ShopScopeService shopScopeService = shopScopeService();
        if (shopScopeService == null) {
            // 容器尚未就绪（无作用域上下文），不阻断
            return;
        }
        if (shopScopeService.isEnforce()) {
            throw new BusinessException("无权访问该门店的数据");
        }
        LOGGER.warn("[SHOP_SCOPE] 越权访问（当前未拦截）entity={} shopId={}",
                entity.getClass().getSimpleName(), shopId);
    }

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
            // 门店作用域兜底：实体含 shop_id 时，默认按当前账号授权范围收敛，
            // 避免“清空门店筛选 = 查全公司”。详见 docs/designs/2026-11-11-门店数据权限统一标准-需求设计.md
            applyShopScope(queryWrapper, params);
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

    /** 实体是否带门店归属字段（带缓存，避免每次反射） */
    private static final Map<Class<?>, Boolean> SHOP_ID_FIELD_CACHE = new ConcurrentHashMap<>();

    private static volatile ShopScopeService SHOP_SCOPE_SERVICE;

    private ShopScopeService shopScopeService() {
        if (SHOP_SCOPE_SERVICE == null) {
            synchronized (BaseService.class) {
                if (SHOP_SCOPE_SERVICE == null) {
                    try {
                        SHOP_SCOPE_SERVICE = SpringUtil.getBean(ShopScopeService.class);
                    } catch (Exception e) {
                        return null;
                    }
                }
            }
        }
        return SHOP_SCOPE_SERVICE;
    }

    private boolean hasShopIdField() {
        Class<?> entityClass = getEntityClass();
        if (entityClass == null) {
            return false;
        }
        Boolean cached = SHOP_ID_FIELD_CACHE.get(entityClass);
        if (cached != null) {
            return cached;
        }
        boolean exists = false;
        for (Class<?> current = entityClass; current != null && current != Object.class; current = current.getSuperclass()) {
            for (Field field : current.getDeclaredFields()) {
                if ("shopId".equals(field.getName())) {
                    exists = true;
                    break;
                }
            }
            if (exists) {
                break;
            }
        }
        SHOP_ID_FIELD_CACHE.put(entityClass, exists);
        return exists;
    }

    /**
     * 按当前账号的授权门店收敛查询范围。
     *
     * <p>约定见标准文档 R2：空值不等于全表。全局角色不受限制；受限账号强制
     * {@code shop_id in (授权 ∩ 请求)}。集团级实体（无 shop_id 字段）自动跳过。</p>
     *
     * <p>逃生口：{@code params.put("ignoreShopScope", true)}，仅限评审过的集团级列表使用。</p>
     */
    @SuppressWarnings("unchecked")
    protected void applyShopScope(QueryWrapper<T> queryWrapper, Map<String, Object> params) {
        if (queryWrapper == null || !hasShopIdField()) {
            return;
        }
        if (params != null && Boolean.TRUE.equals(params.get("ignoreShopScope"))) {
            return;
        }
        if (shopScopeService() == null) {
            return;
        }
        ShopScope scope = ShopScopeHolder.current();
        if (scope == null || scope.isGlobal()) {
            return;
        }
        if (scope.isEmpty()) {
            throw new BusinessException("当前账号尚未配置可查看门店");
        }
        List<Long> shopIds = scope.effectiveShopIds();
        if (shopIds == null || shopIds.isEmpty()) {
            throw new BusinessException("当前账号尚未配置可查看门店");
        }
        queryWrapper.in("shop_id", shopIds);
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
