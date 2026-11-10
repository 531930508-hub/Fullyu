package com.macro.mall.controller;

import com.macro.mall.bo.AdminUserDetails;
import com.macro.mall.common.api.CommonResult;
import com.macro.mall.common.exception.BusinessException;
import com.macro.mall.model.UmsAdmin;
import com.macro.mall.service.HomeConfigService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * 首页角色区块配置：mine 供首页渲染，list/save/reset 仅超级管理员（服务层校验）。
 */
@RestController
@RequestMapping("/homeConfig")
public class HomeConfigController {

    @Autowired
    private HomeConfigService homeConfigService;

    private Long currentAdmin() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || !auth.isAuthenticated() || !(auth.getPrincipal() instanceof AdminUserDetails)) {
            throw new BusinessException("请先登录后台");
        }
        UmsAdmin admin = ((AdminUserDetails) auth.getPrincipal()).getUmsAdmin();
        if (admin == null || admin.getId() == null || !Integer.valueOf(1).equals(admin.getStatus())) {
            throw new BusinessException("后台账号不可用");
        }
        return admin.getId();
    }

    @GetMapping("/mine")
    public CommonResult mine() {
        return CommonResult.success(homeConfigService.mine(currentAdmin()));
    }

    @GetMapping("/list")
    public CommonResult list() {
        return CommonResult.success(homeConfigService.list(currentAdmin()));
    }

    @PostMapping("/save")
    public CommonResult save(@RequestBody Map<String, Object> body) {
        homeConfigService.save(currentAdmin(), roleId(body), stringList(body.get("blocks")), stringList(body.get("links")));
        return CommonResult.success();
    }

    @PostMapping("/reset")
    public CommonResult reset(@RequestBody Map<String, Object> body) {
        homeConfigService.reset(currentAdmin(), roleId(body));
        return CommonResult.success();
    }

    private Long roleId(Map<String, Object> body) {
        Object raw = body == null ? null : body.get("roleId");
        if (raw == null) {
            return null;
        }
        try {
            return Long.valueOf(raw.toString());
        } catch (NumberFormatException e) {
            throw new BusinessException("角色参数不合法");
        }
    }

    private List<String> stringList(Object raw) {
        if (!(raw instanceof List)) {
            return null;
        }
        List<String> result = new ArrayList<>();
        for (Object item : (List<?>) raw) {
            result.add(item == null ? null : item.toString());
        }
        return result;
    }
}