package com.macro.mall.controller;

import com.macro.mall.bo.AdminUserDetails;
import com.macro.mall.common.api.CommonResult;
import com.macro.mall.common.exception.BusinessException;
import com.macro.mall.entity.AdminTodo;
import com.macro.mall.model.UmsAdmin;
import com.macro.mall.service.AdminTodoService;
import io.swagger.annotations.Api;
import io.swagger.annotations.ApiOperation;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * 门店待办（后台首页悬浮卡）。
 *
 * @date 2026/11/07
 */
@RestController
@RequestMapping("/adminTodo")
@Api(tags = "门店待办")
public class AdminTodoController {

    @Autowired
    private AdminTodoService service;

    @GetMapping("/panel")
    @ApiOperation("首页待办面板")
    public CommonResult panel(@RequestParam Long shopId) {
        return CommonResult.success(service.panel(shopId));
    }

    @GetMapping("/records")
    @ApiOperation("待办记录")
    public CommonResult records(@RequestParam Map<String, Object> params) {
        return CommonResult.success(service.records(params));
    }

    @GetMapping("/count")
    @ApiOperation("待完成数量")
    public CommonResult count(@RequestParam Long shopId) {
        return CommonResult.success(service.pendingCount(shopId));
    }

    @PostMapping("/add")
    @ApiOperation("新增待办")
    public CommonResult add(@RequestBody Map<String, Object> params) {
        UmsAdmin admin = currentAdmin();
        return CommonResult.success(service.add(params, admin == null ? null : admin.getId(), adminName(admin)));
    }

    @PostMapping("/complete")
    @ApiOperation("完成待办")
    public CommonResult complete(@RequestBody Map<String, Object> params) {
        Object id = params.get("id");
        if (id == null || id.toString().trim().isEmpty()) {
            throw new BusinessException("请选择待办");
        }
        UmsAdmin admin = currentAdmin();
        return CommonResult.success(service.complete(Long.valueOf(id.toString()),
                admin == null ? null : admin.getId(), adminName(admin)));
    }

    @PostMapping("/reopen")
    @ApiOperation("撤销完成")
    public CommonResult reopen(@RequestBody Map<String, Object> params) {
        Object id = params.get("id");
        if (id == null || id.toString().trim().isEmpty()) {
            throw new BusinessException("请选择待办");
        }
        return CommonResult.success(service.reopen(Long.valueOf(id.toString())));
    }

    private UmsAdmin currentAdmin() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication != null && authentication.getPrincipal() instanceof AdminUserDetails) {
            return ((AdminUserDetails) authentication.getPrincipal()).getUmsAdmin();
        }
        return null;
    }

    private String adminName(UmsAdmin admin) {
        if (admin == null) {
            return "系统";
        }
        if (admin.getNickName() != null && !admin.getNickName().trim().isEmpty()) {
            return admin.getNickName().trim();
        }
        return admin.getUsername();
    }
}
