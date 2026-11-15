package com.macro.mall.component;

import com.macro.mall.common.exception.BusinessException;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Component;
import org.springframework.web.method.HandlerMethod;
import org.springframework.web.servlet.HandlerInterceptor;

import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;

/**
 * 疗愈师排班看板只读保护。
 *
 * <p>前端会隐藏看板上的新增、编辑和拖拽入口，这里再按角色拦截写请求，避免绕过页面直接调用接口。
 * 仅限制看板相关的预约/订单、排班与门店待办接口；请假等其他疗愈师可用功能不受影响。</p>
 *
 * <p>看板上疗愈师本人需要填写的两类内容单独放行：服务备注、精油和部位。</p>
 */
@Component
public class TherapistReadOnlyInterceptor implements HandlerInterceptor {

    /** 看板读数据之外的可写接口前缀 */
    private static final Set<String> BOARD_WRITE_PREFIXES = new HashSet<>(Arrays.asList(
            "/order",
            "/orderDetail",
            "/massagistSchedules",
            "/adminTodo"
    ));

    /** 疗愈师在只读看板上允许写入的接口（方法 + 路径） */
    private static final Set<String> THERAPIST_WRITE_ALLOWED = new HashSet<>(Arrays.asList(
            "PUT /orderDetail/comment",
            "POST /order/addLabel"
    ));

    @Autowired
    @Lazy
    private TherapistGuard therapistGuard;

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
        if (!(handler instanceof HandlerMethod) || !isWriteMethod(request.getMethod())) {
            return true;
        }
        String path = request.getRequestURI();
        String contextPath = request.getContextPath();
        if (contextPath != null && !contextPath.isEmpty() && path.startsWith(contextPath)) {
            path = path.substring(contextPath.length());
        }
        path = trimTrailingSlash(path);
        if (!isBoardWritePath(path) || isTherapistWriteAllowed(request.getMethod(), path)
                || !therapistGuard.isTherapist()) {
            return true;
        }
        throw new BusinessException("疗愈师账号仅可查看排班看板，不能新增、编辑、调店或翻班");
    }

    private boolean isWriteMethod(String method) {
        return !("GET".equalsIgnoreCase(method)
                || "HEAD".equalsIgnoreCase(method)
                || "OPTIONS".equalsIgnoreCase(method));
    }

    private boolean isBoardWritePath(String path) {
        for (String prefix : BOARD_WRITE_PREFIXES) {
            if (path.equals(prefix) || path.startsWith(prefix + "/")) {
                return true;
            }
        }
        return false;
    }

    private boolean isTherapistWriteAllowed(String method, String path) {
        return THERAPIST_WRITE_ALLOWED.contains(method.toUpperCase() + " " + path);
    }

    private String trimTrailingSlash(String path) {
        if (path.length() > 1 && path.endsWith("/")) {
            return path.substring(0, path.length() - 1);
        }
        return path;
    }
}