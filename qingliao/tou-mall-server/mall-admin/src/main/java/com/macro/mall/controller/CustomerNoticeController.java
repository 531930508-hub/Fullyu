package com.macro.mall.controller;

import com.macro.mall.common.api.CommonResult;
import com.macro.mall.config.ContextMixin;
import com.macro.mall.service.CustomerNoticeService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;
import java.util.Map;

@RestController
@RequestMapping("/customerNotice")
public class CustomerNoticeController implements ContextMixin {
    @Autowired CustomerNoticeService service;
    @GetMapping("/config")
    public CommonResult config() { return CommonResult.success(service.config()); }
    @GetMapping("/page")
    public CommonResult page(@RequestParam(defaultValue="1") int page,@RequestParam(defaultValue="10") int size) {
        return CommonResult.success(service.page(curCustomerId(),page,size));
    }
    @GetMapping("/unread")
    public CommonResult unread() { return CommonResult.success(service.unread(curCustomerId())); }
    @PostMapping("/{id}/read")
    public CommonResult read(@PathVariable Long id) {
        service.read(curCustomerId(),id); return CommonResult.success(null);
    }
    @PostMapping("/readAll")
    public CommonResult readAll() { service.readAll(curCustomerId()); return CommonResult.success(null); }
    @PostMapping("/consent")
    public CommonResult consent(@RequestBody Map<String,String> receipt) {
        service.consent(curCustomerId(),receipt.get("templateId"),receipt.get("decision"),receipt.get("requestId"));
        return CommonResult.success(null);
    }
}
