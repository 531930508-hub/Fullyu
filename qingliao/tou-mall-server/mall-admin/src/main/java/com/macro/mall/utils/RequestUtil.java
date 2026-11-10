package com.macro.mall.utils;

import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;

/**
 * http请求相关
 *
 * @author jinlong
 * @date 2021/4/12
 */
public interface RequestUtil {
    /**
     * 获取请求信息
     *
     * @return
     */
    default HttpServletRequest request() {
        return ((ServletRequestAttributes) RequestContextHolder.getRequestAttributes()).getRequest();
    }

    /**
     * 获取响应信息
     *
     * @return
     */
    default HttpServletResponse response() {
        return ((ServletRequestAttributes) RequestContextHolder.getRequestAttributes()).getResponse();
    }

    /**
     * 获取请求头
     *
     * @param key
     * @return
     */
    default String getHeader(String key) {
        return request().getHeader(key);
    }

    /**
     * 判断是否为手机浏览器
     *
     * @return
     */
    default boolean judgeIsMobile() {
        HttpServletRequest request = request();
        return judgeIsMobile(request);
    }

    default boolean judgeIsMobile(HttpServletRequest request) {
        String requestHeader = request.getHeader("user-agent");
        String[] deviceArray = new String[]{"android", "iphone", "windows phone"};
        if (requestHeader == null) {
            return false;
        }
        requestHeader = requestHeader.toLowerCase();
        for (int i = 0; i < deviceArray.length; i++) {
            if (requestHeader.indexOf(deviceArray[i]) > 0) {
                return true;
            }
        }
        return false;
    }
}
