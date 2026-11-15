package com.macro.mall.controller;

import com.github.pagehelper.PageInfo;
import com.macro.mall.bo.AdminUserDetails;
import com.macro.mall.common.api.CommonResult;
import com.macro.mall.common.exception.BusinessException;
import com.macro.mall.entity.ExportRecord;
import com.macro.mall.model.UmsAdmin;
import com.macro.mall.model.UmsRole;
import com.macro.mall.service.ExportRecordService;
import com.macro.mall.service.UmsAdminService;
import io.swagger.annotations.Api;
import io.swagger.annotations.ApiOperation;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/** 后台导出台账查询。写入口见各导出接口上的 {@code @ExportLog}。 */
@Api(tags = "ExportRecordController")
@RestController
@RequestMapping("/exportRecord")
public class ExportRecordController {

    @Autowired
    private ExportRecordService exportRecordService;

    @Autowired
    private UmsAdminService umsAdminService;

    /** 台账含客户手机号等数据的导出轨迹，仅超级管理员可查（与前端菜单授权保持一致） */
    private void requireSuperAdmin() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || !auth.isAuthenticated() || !(auth.getPrincipal() instanceof AdminUserDetails)) {
            throw new BusinessException("请先登录后台");
        }
        UmsAdmin admin = ((AdminUserDetails) auth.getPrincipal()).getUmsAdmin();
        if (admin == null || admin.getId() == null) {
            throw new BusinessException("请先登录后台");
        }
        List<UmsRole> roles = umsAdminService.getRoleList(admin.getId());
        boolean superAdmin = roles != null && roles.stream()
                .anyMatch(role -> role.getName() != null && "超级管理员".equals(role.getName().trim()));
        if (!superAdmin) {
            throw new BusinessException("仅超级管理员可查看导出台账");
        }
    }

    @GetMapping("/page")
    @ApiOperation("分页查询导出台账")
    public CommonResult<PageInfo<ExportRecord>> page(@RequestParam Map<String, Object> params) {
        requireSuperAdmin();
        return CommonResult.success(exportRecordService.pageRecords(params));
    }

    @GetMapping("/modules")
    @ApiOperation("台账已记录的模块清单")
    public CommonResult<List<ExportRecord>> modules() {
        requireSuperAdmin();
        return CommonResult.success(exportRecordService.listModules());
    }

    @GetMapping("/{id}")
    @ApiOperation("导出记录详情")
    public CommonResult<ExportRecord> detail(@PathVariable Long id) {
        requireSuperAdmin();
        return CommonResult.success(exportRecordService.detail(id));
    }
}