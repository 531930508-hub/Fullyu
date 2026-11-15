package com.macro.mall.component;

import com.macro.mall.common.exception.BusinessException;
import com.macro.mall.service.base.ShopScope;
import com.macro.mall.service.base.ShopScopeHolder;
import com.macro.mall.service.base.ShopScopeService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.web.method.HandlerMethod;
import org.springframework.web.servlet.HandlerInterceptor;

import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import java.util.ArrayList;
import java.util.List;

/**
 * L1：进入 controller 前解析并校验门店作用域。
 *
 * <p>只对已登录的后台账号生效；小程序与匿名请求直接放行。
 * 越界请求在 {@code shop.scope.enforce=true} 时返回“无权查看该门店”，否则只记日志便于灰度。</p>
 *
 * @author shop-scope
 */
@Component
public class ShopScopeInterceptor implements HandlerInterceptor {

    private static final Logger LOGGER = LoggerFactory.getLogger(ShopScopeInterceptor.class);

    /** 单店参数名 */
    private static final String PARAM_SHOP_ID = "shopId";
    /** 多店参数名（支持逗号分隔或重复参数） */
    private static final String PARAM_SHOP_IDS = "shopIds";

    @Autowired
    private ShopScopeService shopScopeService;

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
        ShopScopeHolder.clear();
        if (!(handler instanceof HandlerMethod)) {
            return true;
        }
        ShopScope scope;
        try {
            scope = shopScopeService.resolve(parseLong(request.getParameter(PARAM_SHOP_ID)), parseIds(request));
        } catch (BusinessException e) {
            // 未登录等场景交给后续鉴权处理
            return true;
        }
        if (scope == null) {
            return true;
        }
        ShopScopeHolder.set(scope);
        try {
            scope.checkRequested();
        } catch (BusinessException e) {
            if (shopScopeService.isEnforce()) {
                throw e;
            }
            if (shopScopeService.isLogOnly()) {
                LOGGER.warn("[SHOP_SCOPE] 越界请求（当前未拦截）uri={} shopId={} userId={}",
                        request.getRequestURI(), scope.getRequestedShopIds(),
                        shopScopeService.currentAdminOrNull() == null ? null
                                : shopScopeService.currentAdminOrNull().getId());
            }
        }
        return true;
    }

    @Override
    public void afterCompletion(HttpServletRequest request, HttpServletResponse response, Object handler, Exception ex) {
        ShopScopeHolder.clear();
    }

    private Long parseLong(String raw) {
        if (raw == null || raw.trim().isEmpty()) {
            return null;
        }
        try {
            long value = Long.parseLong(raw.trim());
            return value > 0 ? value : null;
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private List<Long> parseIds(HttpServletRequest request) {
        String[] values = request.getParameterValues(PARAM_SHOP_IDS);
        if (values == null || values.length == 0) {
            return null;
        }
        List<Long> ids = new ArrayList<>();
        for (String value : values) {
            if (value == null) {
                continue;
            }
            for (String part : value.split(",")) {
                Long id = parseLong(part);
                if (id != null && !ids.contains(id)) {
                    ids.add(id);
                }
            }
        }
        return ids;
    }
}