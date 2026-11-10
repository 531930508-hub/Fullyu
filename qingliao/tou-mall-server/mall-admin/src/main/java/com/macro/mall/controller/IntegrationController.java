package com.macro.mall.controller;

import com.macro.mall.common.api.CommonResult;
import com.macro.mall.common.exception.BusinessException;
import com.macro.mall.incentive.service.IncentiveAccessService;
import com.macro.mall.model.UmsAdmin;
import com.macro.mall.model.UmsRole;
import com.macro.mall.service.IntegrationOperationService;
import com.macro.mall.service.IntegrationService;
import com.macro.mall.service.UmsAdminService;
import com.macro.mall.config.ContextMixin;
import io.swagger.annotations.Api;
import io.swagger.annotations.ApiOperation;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.*;

/**
 * 积分
 *
 * @author ST
 * @date 2025/06/04
 */
@RestController
@RequestMapping("/integration")
@Api(tags = "积分")
public class IntegrationController implements ContextMixin {
    @Autowired
    IntegrationService integrationService;
    @Autowired
    IntegrationOperationService integrationOperationService;
    @Autowired
    IncentiveAccessService accessService;
    @Autowired
    UmsAdminService adminService;

    /** 与「积分管理」菜单授权一致：超级管理员、合伙人、店长、总助 */
    @Value("${integration.manage-roles:超级管理员,合伙人,店长,总助,admin}")
    private String manageRoles;

    @GetMapping("/page")
    @ApiOperation("分页查询")
    public CommonResult page(@RequestParam Map<String, Object> params) {
        return CommonResult.success(integrationService.page(params));
    }

    @PostMapping("/prizeDraw")
    @ApiOperation("抽奖")
    public CommonResult prizeDraw(@RequestParam Long orderId) {
        return CommonResult.success(integrationService.prizeDraw(orderId));
    }

    @PostMapping("/import/add")
    @ApiOperation("导入：逐行记录操作人与结果，扣减不足的行明确失败、不做部分扣减")
    public CommonResult importAdd(@RequestPart("file") MultipartFile file) {
        return CommonResult.success(integrationOperationService.importFile(file, requireManager()));
    }

    @PostMapping("/adjust")
    @ApiOperation("单人积分调整（正数增加、负数扣减）")
    public CommonResult adjust(@RequestBody Map<String, Object> body) {
        Object phone = body.get("phone");
        Object score = body.get("score");
        Long value;
        try {
            value = score == null || score.toString().trim().isEmpty() ? null : Long.valueOf(score.toString().trim());
        } catch (NumberFormatException e) {
            throw new BusinessException("变动积分数格式错误");
        }
        return CommonResult.success(integrationOperationService.adjust(
                phone == null ? null : phone.toString().trim(), value,
                body.get("reason") == null ? null : body.get("reason").toString(), requireManager()));
    }

    @GetMapping("/operation/page")
    @ApiOperation("积分调整/导入操作记录")
    public CommonResult operationPage(@RequestParam Map<String, Object> params) {
        requireManager();
        params.put("order", "-create_time,-id");
        return CommonResult.success(integrationOperationService.page(params));
    }

    private UmsAdmin requireManager() {
        UmsAdmin admin = accessService.currentAdmin();
        Set<String> allowed = new HashSet<>();
        for (String r : manageRoles.split(",")) if (!r.trim().isEmpty()) allowed.add(r.trim());
        List<UmsRole> roles = adminService.getRoleList(admin.getId());
        if (roles != null) for (UmsRole role : roles) {
            if (role.getName() != null && allowed.contains(role.getName().trim())) return admin;
        }
        throw new BusinessException("当前账号无积分管理权限", 403);
    }

    @GetMapping("/getIntegrationRecord")
    @ApiOperation("小程序获取积分列表")
    public CommonResult getIntegrationRecord(@RequestParam Map<String, Object> params) {
        params.put("customerId", curCustomerId());
        return CommonResult.success(integrationService.page(params));
    }


}
