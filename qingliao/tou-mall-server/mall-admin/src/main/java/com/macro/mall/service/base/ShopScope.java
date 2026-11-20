package com.macro.mall.service.base;

import com.macro.mall.common.exception.BusinessException;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

/**
 * 当前请求的门店作用域。
 *
 * <p>约定：客户端传入的 shopId 只是“请求范围”，可见范围始终由服务端授权决定。
 * 不存在“不传门店 = 查全表”的语义：受限账号不传门店时等于其授权门店集合。</p>
 *
 * @author shop-scope
 */
public class ShopScope {

    /** 全局角色：可跨店查看 */
    private final boolean global;

    /** 授权门店；global=true 时为 null */
    private final List<Long> authorizedShopIds;

    /** 客户端请求的门店；null 表示未指定 */
    private final List<Long> requestedShopIds;

    public ShopScope(boolean global, List<Long> authorizedShopIds, List<Long> requestedShopIds) {
        this.global = global;
        this.authorizedShopIds = authorizedShopIds;
        this.requestedShopIds = requestedShopIds == null || requestedShopIds.isEmpty()
                ? null : new ArrayList<>(requestedShopIds);
    }

    /** 全局且未指定门店：不加任何门店条件 */
    public static ShopScope allShops() {
        return new ShopScope(true, null, null);
    }

    public boolean isGlobal() {
        return global;
    }

    public List<Long> getAuthorizedShopIds() {
        return authorizedShopIds;
    }

    public List<Long> getRequestedShopIds() {
        return requestedShopIds;
    }

    /** 全局且未指定门店 */
    public boolean isAllShops() {
        return global && requestedShopIds == null;
    }

    /** 受限账号且没有任何授权门店 */
    public boolean isEmpty() {
        return !global && (authorizedShopIds == null || authorizedShopIds.isEmpty());
    }

    /**
     * 最终生效的门店集合；返回 null 表示不需要门店条件。
     * 受限账号返回“请求范围 ∩ 授权”，请求范围为空时返回全部授权门店。
     */
    public List<Long> effectiveShopIds() {
        if (global) {
            return requestedShopIds;
        }
        List<Long> authorized = authorizedShopIds == null ? new ArrayList<>() : authorizedShopIds;
        if (requestedShopIds == null) {
            return new ArrayList<>(authorized);
        }
        Set<Long> result = new LinkedHashSet<>(authorized);
        result.retainAll(requestedShopIds);
        return new ArrayList<>(result);
    }

    /** 校验请求范围是否越界；越界抛 403 语义的业务异常 */
    public void checkRequested() {
        if (global || requestedShopIds == null) {
            return;
        }
        if (isEmpty()) {
            throw new BusinessException("当前账号尚未配置可查看门店");
        }
        for (Long shopId : requestedShopIds) {
            if (!authorizedShopIds.contains(shopId)) {
                throw new BusinessException("无权查看该门店");
            }
        }
    }

    /**
     * 追加临时授权门店，返回新的作用域对象。
     *
     * <p>用于“疗愈师按排班日期临时多一间店”的场景：授权只对本次请求生效，
     * 不写回账号配置；全局角色与未登录上下文原样返回。</p>
     */
    public ShopScope withExtraShopIds(List<Long> extraShopIds) {
        if (global || extraShopIds == null || extraShopIds.isEmpty()) {
            return this;
        }
        Set<Long> merged = new LinkedHashSet<>();
        if (authorizedShopIds != null) {
            merged.addAll(authorizedShopIds);
        }
        for (Long shopId : extraShopIds) {
            if (shopId != null && shopId > 0) {
                merged.add(shopId);
            }
        }
        return new ShopScope(false, new ArrayList<>(merged), requestedShopIds);
    }

    /** 判断某条记录是否在当前作用域内，用于按 id 读写的资源级校验 */
    public boolean contains(Long shopId) {
        if (global) {
            return true;
        }
        if (shopId == null || authorizedShopIds == null) {
            return false;
        }
        return authorizedShopIds.contains(shopId);
    }

    /** 资源级断言：越界直接拒绝 */
    public void assertAccess(Long shopId) {
        if (global) {
            return;
        }
        if (isEmpty()) {
            throw new BusinessException("当前账号尚未配置可查看门店");
        }
        if (!contains(shopId)) {
            throw new BusinessException("无权查看该门店");
        }
    }
}