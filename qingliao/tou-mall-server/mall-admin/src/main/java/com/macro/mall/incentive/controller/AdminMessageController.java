package com.macro.mall.incentive.controller;

import com.macro.mall.common.api.CommonResult;
import com.macro.mall.incentive.service.AdminMessageService;
import io.swagger.annotations.Api;
import io.swagger.annotations.ApiOperation;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * 后台站内消息收件箱。
 */
@Api(tags = "AdminMessageController")
@RestController
@RequestMapping("/adminMessage")
public class AdminMessageController {

    @Autowired
    private AdminMessageService messageService;

    @ApiOperation("未读消息数")
    @GetMapping("/unread-count")
    public CommonResult<Long> unreadCount() {
        return CommonResult.success(messageService.unreadCount());
    }

    @ApiOperation("消息列表")
    @GetMapping("/page")
    public CommonResult<Map<String, Object>> page(@RequestParam(required = false) Integer page,
                                                  @RequestParam(required = false) Integer size,
                                                  @RequestParam(required = false) Boolean unreadOnly) {
        return CommonResult.success(messageService.page(page, size, unreadOnly));
    }

    @ApiOperation("标记单条已读")
    @PostMapping("/{id}/read")
    public CommonResult<Boolean> markRead(@PathVariable Long id) {
        return CommonResult.success(messageService.markRead(id));
    }

    @ApiOperation("全部已读")
    @PostMapping("/read-all")
    public CommonResult<Integer> markAllRead() {
        return CommonResult.success(messageService.markAllRead());
    }
}