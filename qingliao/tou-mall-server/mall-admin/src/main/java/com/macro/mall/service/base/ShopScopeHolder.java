package com.macro.mall.service.base;

/**
 * 单请求内的门店作用域持有者。
 *
 * <p>由 {@code ShopScopeInterceptor} 在进入 controller 前写入、请求结束后清理，
 * 业务层通过静态方法读取，避免每个 service 都注入一遍。</p>
 *
 * @author shop-scope
 */
public final class ShopScopeHolder {

    private static final ThreadLocal<ShopScope> HOLDER = new ThreadLocal<>();

    private ShopScopeHolder() {
    }

    public static void set(ShopScope scope) {
        HOLDER.set(scope);
    }

    /** 非后台请求（小程序、定时任务、匿名）返回 null */
    public static ShopScope current() {
        return HOLDER.get();
    }

    public static void clear() {
        HOLDER.remove();
    }

    /**
     * 资源级断言。没有作用域上下文时不做限制（小程序链路走 customerId 维度，不在此处约束）。
     */
    public static void assertAccess(Long shopId) {
        ShopScope scope = HOLDER.get();
        if (scope != null) {
            scope.assertAccess(shopId);
        }
    }

    /** 当前请求是否已将范围收敛到单店以外（用于统计类接口判断是否需要合并） */
    public static boolean isAllShops() {
        ShopScope scope = HOLDER.get();
        return scope == null || scope.isAllShops();
    }
}