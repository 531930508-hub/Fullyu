package com.macro.mall.aspect;

import com.alibaba.fastjson2.JSON;
import com.macro.mall.annotation.ExportLog;
import com.macro.mall.bo.AdminUserDetails;
import com.macro.mall.entity.ExportRecord;
import com.macro.mall.model.UmsAdmin;
import com.macro.mall.security.util.JwtTokenUtil;
import com.macro.mall.service.ExportRecordService;
import com.macro.mall.service.UmsAdminService;
import lombok.extern.slf4j.Slf4j;
import org.aspectj.lang.annotation.AfterReturning;
import org.aspectj.lang.annotation.Aspect;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.annotation.Order;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import java.io.UnsupportedEncodingException;
import java.net.URLDecoder;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 导出成功后自动落台账：操作人、时间、筛选条件、实际文件名。
 *
 * <p>审计写入失败只能记日志，绝不能反向影响已经成功的导出。</p>
 */
@Slf4j
@Component
@Aspect
@Order(2)
public class ExportLogAspect {

    private static final Set<String> IGNORED_PARAMS = new HashSet<>(Arrays.asList(
            "page", "size", "current", "pagenum", "pagesize",
            "token", "access_token", "authorization", "_t"
    ));
    private static final int MAX_FILTER_LENGTH = 60000;
    private static final DateTimeFormatter FALLBACK_TIME = DateTimeFormatter.ofPattern("yyyyMMddHHmmss");
    private static final Pattern UTF8_STAR_FILE_NAME =
            Pattern.compile("filename\\*\\s*=\\s*(?:UTF-8|utf-8)''([^;]+)", Pattern.CASE_INSENSITIVE);
    private static final Pattern PLAIN_FILE_NAME =
            Pattern.compile("filename\\s*=\\s*(\"[^\"]*\"|[^;]+)", Pattern.CASE_INSENSITIVE);

    @Autowired
    private ExportRecordService exportRecordService;

    @Autowired(required = false)
    private JwtTokenUtil jwtTokenUtil;

    @Autowired(required = false)
    private UmsAdminService umsAdminService;

    @AfterReturning(pointcut = "@annotation(exportLog)")
    public void afterReturning(ExportLog exportLog) {
        try {
            ServletRequestAttributes attributes =
                    (ServletRequestAttributes) RequestContextHolder.getRequestAttributes();
            if (attributes == null) {
                return;
            }
            HttpServletRequest request = attributes.getRequest();
            HttpServletResponse response = attributes.getResponse();
            if (response == null) {
                return;
            }

            ExportRecord record = new ExportRecord();
            record.setModule(exportLog.module());
            record.setModuleName(exportLog.value());
            record.setExportTime(LocalDateTime.now());
            record.setFilterCondition(buildFilterCondition(request));
            record.setFileName(resolveFileName(response, exportLog));
            fillOperator(record, request);
            exportRecordService.save(record);
        } catch (Exception e) {
            log.error("保存导出台账失败，module={}", exportLog == null ? null : exportLog.module(), e);
        }
    }

    private void fillOperator(ExportRecord record, HttpServletRequest request) {
        UmsAdmin admin = resolveOperatorFromSecurity();
        if (admin == null) {
            admin = resolveOperatorFromToken(request.getHeader("Authorization"));
        }
        if (admin == null) {
            record.setOperatorName("未识别");
            return;
        }
        record.setOperatorId(admin.getId());
        record.setOperatorName(StringUtils.hasText(admin.getNickName())
                ? admin.getNickName() : admin.getUsername());
        record.setOperatorAccount(admin.getUsername());
    }

    private static UmsAdmin resolveOperatorFromSecurity() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null || !(authentication.getPrincipal() instanceof AdminUserDetails)) {
            return null;
        }
        return ((AdminUserDetails) authentication.getPrincipal()).getUmsAdmin();
    }

    private UmsAdmin resolveOperatorFromToken(String authorization) {
        if (!StringUtils.hasText(authorization) || jwtTokenUtil == null || umsAdminService == null) {
            return null;
        }
        String token = authorization.startsWith("Bearer ") ? authorization.substring(7) : authorization;
        try {
            String username = jwtTokenUtil.getUserNameFromToken(token);
            return StringUtils.hasText(username) ? umsAdminService.getAdminByUsername(username) : null;
        } catch (Exception e) {
            return null;
        }
    }

    private static String buildFilterCondition(HttpServletRequest request) {
        Map<String, String[]> parameterMap = request.getParameterMap();
        if (parameterMap == null || parameterMap.isEmpty()) {
            return null;
        }
        TreeMap<String, String> filters = new TreeMap<>();
        for (Map.Entry<String, String[]> entry : parameterMap.entrySet()) {
            String key = entry.getKey();
            if (!StringUtils.hasText(key) || IGNORED_PARAMS.contains(key.toLowerCase())) {
                continue;
            }
            String[] values = entry.getValue();
            if (values == null || values.length == 0) {
                continue;
            }
            String value = String.join(",", values).trim();
            if (StringUtils.hasText(value)) {
                filters.put(key, value.length() > 1000 ? value.substring(0, 1000) : value);
            }
        }
        if (filters.isEmpty()) {
            return null;
        }
        String json = JSON.toJSONString(filters);
        return json.length() <= MAX_FILTER_LENGTH ? json : "{\"_truncated\":true}";
    }

    private static String resolveFileName(HttpServletResponse response, ExportLog exportLog) {
        String fileName = extractFileName(response.getHeader("Content-Disposition"));
        if (StringUtils.hasText(fileName)) {
            return fileName;
        }
        String extension = response.getContentType() != null
                && response.getContentType().toLowerCase().contains("csv") ? ".csv" : ".xlsx";
        String base = exportLog == null || !StringUtils.hasText(exportLog.value())
                ? "导出文件" : exportLog.value();
        return base + "-" + LocalDateTime.now().format(FALLBACK_TIME) + extension;
    }

    static String extractFileName(String contentDisposition) {
        if (!StringUtils.hasText(contentDisposition)) {
            return null;
        }
        Matcher utf8Matcher = UTF8_STAR_FILE_NAME.matcher(contentDisposition);
        String encoded = null;
        if (utf8Matcher.find()) {
            encoded = utf8Matcher.group(1);
        } else {
            Matcher plainMatcher = PLAIN_FILE_NAME.matcher(contentDisposition);
            if (plainMatcher.find()) {
                encoded = plainMatcher.group(1);
            }
        }
        if (!StringUtils.hasText(encoded)) {
            return null;
        }
        encoded = encoded.trim();
        if (encoded.startsWith("\"") && encoded.endsWith("\"") && encoded.length() >= 2) {
            encoded = encoded.substring(1, encoded.length() - 1);
        }
        String decoded = encoded;
        try {
            decoded = URLDecoder.decode(encoded, "UTF-8");
        } catch (IllegalArgumentException | UnsupportedEncodingException ignored) {
            // 非 URL 编码的原始文件名直接使用
        }
        decoded = decoded.replace("\r", "").replace("\n", "").trim();
        return decoded.length() <= 255 ? decoded : decoded.substring(0, 255);
    }
}