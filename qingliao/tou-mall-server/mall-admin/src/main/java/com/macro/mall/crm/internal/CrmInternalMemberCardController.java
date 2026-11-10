package com.macro.mall.crm.internal;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.macro.mall.common.exception.BusinessException;
import com.macro.mall.service.BrandCardPaymentService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import javax.servlet.http.HttpServletRequest;
import java.io.IOException;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.function.Supplier;

/**
 * CRM 后台调用的内部支付接口（查询开卡单、规则/协商退款、补偿重试、解锁购买）。
 *
 * <p>仅供 CRM 服务端调用：HMAC 签名 + 时间窗 + nonce 防重放，<b>不接受</b>浏览器或小程序直接访问。
 * 开启方式：配置 {@code crm-internal.key-id} 与 {@code crm-internal.secret}（或显式 enabled）。
 * 未开启时统一返回 404，不暴露接口是否存在。</p>
 *
 * <p>返回值直接是业务 JSON；错误按真实 HTTP 状态码返回 {@code {error, message}}，
 * 便于 CRM 区分“不存在 / 冲突 / 服务不可用”。</p>
 */
@RestController
@RequestMapping("/crm-internal/member-card")
@Slf4j
public class CrmInternalMemberCardController {

    @Autowired
    private CrmInternalAuth auth;
    @Autowired
    private BrandCardPaymentService paymentService;

    private final ObjectMapper objectMapper = new ObjectMapper();

    @GetMapping("/order")
    public ResponseEntity<Map<String, Object>> order(@RequestParam(required = false) String orderSn,
                                                     HttpServletRequest request) {
        return handle(request, "", () -> paymentService.crmOrder(requireText(orderSn, "缺少订单号")));
    }

    @PostMapping("/refund")
    public ResponseEntity<Map<String, Object>> refund(@RequestBody(required = false) String body,
                                                      HttpServletRequest request) {
        return handle(request, body, () -> {
            JsonNode node = parse(body);
            return paymentService.crmRefund(text(node, "orderSn"), intOrNull(node, "refundCents"),
                    text(node, "refundType"), text(node, "reason"), text(node, "operatorName"));
        });
    }

    @PostMapping("/retry")
    public ResponseEntity<Map<String, Object>> retry(@RequestBody(required = false) String body,
                                                     HttpServletRequest request) {
        return handle(request, body, () -> {
            JsonNode node = parse(body);
            return paymentService.crmRetry(text(node, "orderSn"), text(node, "kind"));
        });
    }

    @PostMapping("/unlock")
    public ResponseEntity<Map<String, Object>> unlock(@RequestBody(required = false) String body,
                                                      HttpServletRequest request) {
        return handle(request, body, () -> {
            JsonNode node = parse(body);
            return paymentService.crmUnlockByPhone(text(node, "phone"));
        });
    }

    private ResponseEntity<Map<String, Object>> handle(HttpServletRequest request, String body,
                                                       Supplier<Map<String, Object>> action) {
        try {
            auth.verify(request, body == null ? "" : body);
        } catch (BusinessException e) {
            // 未启用返回 404，其余校验失败一律 401；不回显具体原因
            int status = e.getStatus() == 404 ? 404 : 401;
            return error(status, status == 404 ? "NOT_ENABLED" : "UNAUTHORIZED",
                    status == 404 ? "接口未启用" : "签名校验失败");
        }
        try {
            return ResponseEntity.ok(action.get());
        } catch (BusinessException e) {
            int status = e.getStatus() >= 400 && e.getStatus() < 600 ? e.getStatus() : 500;
            String code = status == 404 ? "NOT_FOUND" : status == 409 ? "CONFLICT"
                    : status == 400 ? "BAD_REQUEST" : status == 503 ? "UNAVAILABLE" : "FAILED";
            return error(status, code, e.getMessage());
        } catch (RuntimeException e) {
            log.error("CRM 内部接口执行失败, path={}, error={}", request.getRequestURI(),
                    e.getClass().getSimpleName());
            return error(500, "FAILED", "系统繁忙，请稍后重试");
        }
    }

    private ResponseEntity<Map<String, Object>> error(int status, String code, String message) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("error", code);
        body.put("message", message == null ? "请求失败" : message);
        return ResponseEntity.status(HttpStatus.valueOf(status)).body(body);
    }

    private JsonNode parse(String body) {
        if (body == null || body.trim().isEmpty()) {
            throw new BusinessException("请求体为空", 400);
        }
        try {
            return objectMapper.readTree(body);
        } catch (IOException e) {
            throw new BusinessException("请求体格式错误", 400);
        }
    }

    private static String text(JsonNode node, String field) {
        JsonNode value = node.path(field);
        if (value.isMissingNode() || value.isNull()) {
            return null;
        }
        String text = value.asText("").trim();
        return text.isEmpty() ? null : text;
    }

    private static Integer intOrNull(JsonNode node, String field) {
        JsonNode value = node.path(field);
        if (value.isMissingNode() || value.isNull()) {
            return null;
        }
        if (value.isIntegralNumber()) {
            return value.asInt();
        }
        String text = value.asText("").trim();
        if (text.isEmpty()) {
            return null;
        }
        try {
            return Integer.parseInt(text);
        } catch (NumberFormatException e) {
            throw new BusinessException(field + " 必须是整数", 400);
        }
    }

    private static String requireText(String value, String message) {
        String text = value == null ? null : value.trim();
        if (text == null || text.isEmpty()) {
            throw new BusinessException(message, 400);
        }
        return text;
    }
}
