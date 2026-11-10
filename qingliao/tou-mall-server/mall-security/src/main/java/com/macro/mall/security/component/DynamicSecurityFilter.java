package com.macro.mall.security.component;

import cn.hutool.json.JSONUtil;
import com.alibaba.excel.util.StringUtils;
import com.macro.mall.common.api.CommonResult;
import com.macro.mall.security.config.IgnoreUrlsConfig;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpMethod;
import org.springframework.security.access.SecurityMetadataSource;
import org.springframework.security.access.intercept.AbstractSecurityInterceptor;
import org.springframework.security.access.intercept.InterceptorStatusToken;
import org.springframework.security.web.FilterInvocation;
import org.springframework.util.AntPathMatcher;
import org.springframework.util.PathMatcher;

import javax.servlet.*;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletRequestWrapper;
import java.io.IOException;
import java.util.Enumeration;
import java.util.Vector;

/**
 * 动态权限过滤器，用于实现基于路径的动态权限过滤
 * Created by macro on 2020/2/7.
 */
public class DynamicSecurityFilter extends AbstractSecurityInterceptor implements Filter {

    @Autowired
    private DynamicSecurityMetadataSource dynamicSecurityMetadataSource;
    @Autowired
    private IgnoreUrlsConfig ignoreUrlsConfig;

    private final static String phoneAgentToken = "HYc*CIFRi7rr6dmBDtzkS7QizIKylj2kF.FQc,8i";

    @Autowired
    public void setMyAccessDecisionManager(DynamicAccessDecisionManager dynamicAccessDecisionManager) {
        super.setAccessDecisionManager(dynamicAccessDecisionManager);
    }

    @Override
    public void init(FilterConfig filterConfig) throws ServletException {
    }

    @Override
    public void doFilter(ServletRequest servletRequest, ServletResponse servletResponse, FilterChain filterChain) throws IOException, ServletException {
        HttpServletRequest request = (HttpServletRequest) servletRequest;
        FilterInvocation fi = new FilterInvocation(servletRequest, servletResponse, filterChain);
        //OPTIONS请求直接放行
        if (request.getMethod().equals(HttpMethod.OPTIONS.toString())) {
            fi.getChain().doFilter(fi.getRequest(), fi.getResponse());
            return;
        }
        //白名单请求直接放行
        PathMatcher pathMatcher = new AntPathMatcher();
        for (String path : ignoreUrlsConfig.getUrls()) {
            if (pathMatcher.match(path, request.getRequestURI())) {
                fi.getChain().doFilter(fi.getRequest(), fi.getResponse());
                return;
            }
        }
        //rpc路径验证访问
        for (String path : ignoreUrlsConfig.getOpenUrls()) {
            if (pathMatcher.match(path, request.getRequestURI())) {
                String authToken = request.getHeader("AUTH_TOKEN");
                if (StringUtils.isBlank(authToken)) {
                    authToken = request.getParameter("auth_token");
                }
                if (phoneAgentToken.equals(authToken)) {
                    HttpServletRequestWrapper requestWrapper = buildHead(request, "phone-agent");
                    fi.getChain().doFilter(requestWrapper, fi.getResponse());
                    return;
                } else {
                    servletResponse.setCharacterEncoding("UTF-8");
                    servletResponse.setContentType("application/json");
                    servletResponse.getWriter().println(JSONUtil.parse(CommonResult.forbidden("不合法调用")));
                    servletResponse.getWriter().flush();
                    return;
                }
            }
        }
        //此处会调用AccessDecisionManager中的decide方法进行鉴权操作
        InterceptorStatusToken token = super.beforeInvocation(fi);
        try {
            fi.getChain().doFilter(fi.getRequest(), fi.getResponse());
        } finally {
            super.afterInvocation(token, null);
        }
    }

    @Override
    public void destroy() {
    }

    @Override
    public Class<?> getSecureObjectClass() {
        return FilterInvocation.class;
    }

    @Override
    public SecurityMetadataSource obtainSecurityMetadataSource() {
        return dynamicSecurityMetadataSource;
    }

    private HttpServletRequestWrapper buildHead(HttpServletRequest request, String headValue) {
        return new HttpServletRequestWrapper(request) {
            @Override
            public Enumeration<String> getHeaderNames() {
                // 获取原始请求头
                Enumeration<String> headerNames = super.getHeaderNames();
                Vector<String> headerNameList = new Vector<>();
                while (headerNames.hasMoreElements()) {
                    headerNameList.add(headerNames.nextElement());
                }
                // 追加自定义的请求头
                headerNameList.add("fully_open");
                return headerNameList.elements();
            }

            @Override
            public String getHeader(String name) {
                if ("fully_open".equals(name)) {
                    return headValue;
                }
                return super.getHeader(name);
            }
        };
    }

}
