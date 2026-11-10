package com.macro.mall.aspect;

import com.alibaba.fastjson2.JSON;
import com.alibaba.fastjson2.JSONObject;
import com.macro.mall.common.api.CommonResult;
import com.macro.mall.entity.ControllerLog;
import com.macro.mall.model.UmsAdmin;
import com.macro.mall.security.util.JwtTokenUtil;
import com.macro.mall.security.util.SpringUtil;
import com.macro.mall.service.ControllerLogService;
import com.macro.mall.service.SessionService;
import com.macro.mall.service.UmsAdminService;
import io.swagger.annotations.Api;
import io.swagger.annotations.ApiOperation;
import lombok.extern.slf4j.Slf4j;
import org.aspectj.lang.JoinPoint;
import org.aspectj.lang.annotation.*;
import org.aspectj.lang.reflect.MethodSignature;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;
import org.springframework.web.multipart.MultipartFile;

import javax.servlet.http.HttpServletRequest;
import java.lang.reflect.Method;
import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.Map;

@Slf4j
@Component
@Aspect
@Order(1)
public class LogAspect {
    @Autowired
    ControllerLogService controllerLogService;
    @Autowired
    JwtTokenUtil jwtTokenUtil;
    @Autowired
    UmsAdminService umsAdminService;

    @Before("@annotation(operation) && (@annotation(MustLog) || (!@annotation(org.springframework.web.bind.annotation.GetMapping)))")
    private void saveLog(JoinPoint point, ApiOperation operation) {
        try {
            String paramStr = null;
            String className = null;
            String classTag = null;
            MethodSignature signature = (MethodSignature) point.getSignature();
            Method method = signature.getMethod();
            IgnoreLog taxLog = method.getAnnotation(IgnoreLog.class);
            if (taxLog != null) {
                return;
            }
            try {
                Map<String, Object> paramMap = buildParamMap(point);
                if (paramMap == null) {
                    return;
                }
                paramStr = JSON.toJSONString(paramMap);
                Class<?> declaringClass = point.getTarget().getClass();
                className = point.getTarget().getClass().getName();
                if (className.contains("$Proxy")) {
                    declaringClass = method.getDeclaringClass();
                    String name = declaringClass.getName();
                    className = name;
                }
                Api apiAnnotation = declaringClass.getAnnotation(Api.class);
                if (apiAnnotation != null) {
                    String[] tags = apiAnnotation.tags();
                    if (tags.length > 0) {
                        classTag = tags[0];
                    }
                }
            } catch (Exception e) {
                e.printStackTrace();
                return;
            }
            try {
                ControllerLog log = new ControllerLog();
                log.setTitle(classTag + "-" + operation.value() + "-" + className);
                log.setParams(paramStr);
                log.setCreateTime(LocalDateTime.now());

                //获取操作者信息
                ServletRequestAttributes sra = (ServletRequestAttributes) RequestContextHolder.getRequestAttributes();
                HttpServletRequest request = sra.getRequest();
                String token = request.getHeader("Authorization");
                String fullyMini = request.getHeader("fullymini");
                String fullyOpen = request.getHeader("fully_open");
                if (fullyMini != null) {
                    Long customerId = resolveCustomerId(token);
                    if (customerId != null) {
                        log.setCreateUser(customerId);
                    }
                    log.setSource("fully-mini");
                } else if (fullyOpen != null) {
                    log.setSource(fullyOpen);
                } else {
                    // 后台账号优先；小程序/H5 未带 fullyMini 头时按客户会话兜底，
                    // 避免客户发起的支付/退款操作因身份解析失败而丢失审计日志
                    UmsAdmin admin = resolveAdmin(token);
                    if (admin != null) {
                        log.setSource("PC");
                        log.setCreateUser(admin.getId());
                    } else {
                        log.setSource("APP");
                        Long customerId = resolveCustomerId(token);
                        if (customerId != null) {
                            log.setCreateUser(customerId);
                        }
                    }
                }

                controllerLogService.add(log);
                FullLog fullLog = method.getAnnotation(FullLog.class);
                if (fullLog != null) {
                    LOG_HOLDER.remove();  // 清空之前遗留的上下文（尤其线程复用时）
                    LOG_HOLDER.set(log);  // 设置本次日志对象
                }
            } catch (Exception e) {
                log.error("保存日志失败，title={},params={}", operation.value() + className, paramStr);
                e.printStackTrace();
            }
        } catch (Exception e) {
            e.printStackTrace();
            return;
        }
    }

    /**
     * 解析后台账号；令牌无效或账号不存在时返回 null，由调用方降级处理，避免影响审计落库。
     */
    private UmsAdmin resolveAdmin(String token) {
        if (!StringUtils.hasText(token)) {
            return null;
        }
        try {
            String userName = jwtTokenUtil.getUserNameFromToken(token);
            return StringUtils.hasText(userName) ? umsAdminService.getAdminByUsername(userName) : null;
        } catch (Exception e) {
            return null;
        }
    }

    /**
     * 解析小程序客户身份；会话过期时返回 null，但审计日志仍按来源记录。
     */
    private Long resolveCustomerId(String token) {
        if (!StringUtils.hasText(token)) {
            return null;
        }
        try {
            SessionService sessionService = SpringUtil.getBean(SessionService.class);
            return sessionService.getCustomerId(token);
        } catch (Exception e) {
            return null;
        }
    }

    private static Map<String, Object> buildParamMap(JoinPoint point) {
        String[] parameterNames = ((MethodSignature) point.getSignature()).getParameterNames();
        Object[] args = point.getArgs();
        Map<String, Object> paramMap = new HashMap<>(8);
        int len = parameterNames.length;
        for (int i = 0; i < len; i++) {
            Object arg = args[i];
            // 参数为文件，则跳过
            if (arg instanceof MultipartFile) {
                continue;
            }
            String name = parameterNames[i];
            paramMap.put(name, arg);
        }
        return paramMap;
    }

    // ========== 处理补充日志 ==========

    private static final ThreadLocal<ControllerLog> LOG_HOLDER = new ThreadLocal<>();

    @AfterReturning(pointcut = "@annotation(fullLog)", returning = "result")
    public void afterReturning(FullLog fullLog, Object result) {
        ControllerLog log = LOG_HOLDER.get();

        if (log != null && result instanceof CommonResult<?>) {
            try {
                CommonResult commonResult = (CommonResult) result;
                enrichLogFromResult(commonResult, fullLog, log);
            } finally {
                LOG_HOLDER.remove();
            }
        }
    }

    @AfterThrowing(pointcut = "@annotation(fullLog)", throwing = "ex")
    public void afterThrowing(FullLog fullLog, Throwable ex) {
        ControllerLog log = LOG_HOLDER.get();
        if (log != null) {
            LOG_HOLDER.remove();
        }
    }

    private void enrichLogFromResult(CommonResult result, FullLog fullLog, ControllerLog controllerLog) {
        if (result.getCode() != 200 || !(result.getData() instanceof Map<?, ?>)) {
            return;
        }

        Map<?, ?> dataMap = (Map<?, ?>) result.getData();
        Object saveContent = dataMap.get(fullLog.saveLogField());

        if (saveContent == null) {
            result.setData(dataMap.get(fullLog.returnField()));
            return;
        }

        try {
            //原有记录
            String paramStr = controllerLog.getParams();
            JSONObject jsonObject = JSONObject.parseObject(paramStr);
            //追加记录
            jsonObject.put(fullLog.saveLogField(), saveContent);
            controllerLog.setParams(jsonObject.toJSONString());
            controllerLogService.updateById(controllerLog);

            result.setData(dataMap.get(fullLog.returnField()));
        } catch (Exception e) {
            log.error("FullLog 切面处理失败: ", e);
        }
    }

    @After("@annotation(fullLog)")
    public void afterFinally(FullLog fullLog) {
        LOG_HOLDER.remove(); // 保底释放
    }

}
