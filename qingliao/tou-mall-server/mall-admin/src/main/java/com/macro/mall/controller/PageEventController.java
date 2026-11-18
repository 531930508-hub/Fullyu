package com.macro.mall.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.macro.mall.aspect.IgnoreLog;
import com.macro.mall.common.api.CommonResult;
import com.macro.mall.config.ContextMixin;
import com.macro.mall.dto.PageEventDTO;
import com.macro.mall.service.PageEventService;
import io.swagger.annotations.Api;
import io.swagger.annotations.ApiOperation;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.ArrayList;
import java.util.List;

/**
 * 小程序页面埋点上报。
 *
 * <p>接口在白名单中放行（未登录也要埋点），登录时按 token 反查 customerId。
 * 埋点失败一律吞掉，返回 success，避免影响小程序主流程。</p>
 */
@RestController
@RequestMapping("/customer/page-event")
@Api(tags = "小程序埋点")
public class PageEventController implements ContextMixin {

    private static final Logger LOGGER = LoggerFactory.getLogger(PageEventController.class);

    @Autowired
    private PageEventService pageEventService;

    @Autowired
    private ObjectMapper objectMapper;

    @PostMapping("/createList")
    @IgnoreLog
    @ApiOperation("上报页面停留明细，支持单条或数组")
    public CommonResult createList(@RequestBody JsonNode body) {
        int saved = 0;
        try {
            List<PageEventDTO> list = parse(body);
            saved = pageEventService.record(list, curCustomerId());
        } catch (Exception e) {
            // 埋点是旁路，不能把异常抛回小程序
            LOGGER.warn("page-event 上报失败: {}", e.getMessage());
        }
        return CommonResult.success(saved);
    }

    private List<PageEventDTO> parse(JsonNode body) {
        List<PageEventDTO> list = new ArrayList<>();
        if (body == null || body.isNull()) {
            return list;
        }
        if (body.isArray()) {
            for (JsonNode node : body) {
                if (list.size() >= PageEventService.MAX_BATCH) {
                    break;
                }
                addNode(list, node);
            }
        } else if (body.isObject()) {
            addNode(list, body);
        }
        return list;
    }

    private void addNode(List<PageEventDTO> list, JsonNode node) {
        if (node == null || !node.isObject()) {
            return;
        }
        try {
            list.add(objectMapper.convertValue(node, PageEventDTO.class));
        } catch (Exception ignored) {
            // 单条结构不合法就跳过，不影响同批其它记录
        }
    }
}
