package com.macro.mall.config;

import com.macro.mall.security.util.SpringUtil;
import com.macro.mall.service.SessionService;
import org.springframework.util.StringUtils;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

import javax.servlet.http.HttpServletRequest;

/**
 * Created by oahnus on 2025/6/13
 *
 * @author oahnus
 */
public interface ContextMixin {
    default HttpServletRequest request() {
        return ((ServletRequestAttributes) RequestContextHolder.getRequestAttributes())
                .getRequest();
    }

    default String getToken() {
        String token = request().getHeader("Authorization");
        return token;
    }

    default Long curCustomerId() {
       // return 2460L;
        SessionService sessionService = SpringUtil.getBean(SessionService.class);

        String token = getToken();
        if (StringUtils.hasText(token)) {
            return sessionService.getCustomerId(token);
        }
        return null;
    }
}
