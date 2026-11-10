package com.macro.mall.controller;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.github.pagehelper.PageInfo;
import com.macro.mall.bo.AdminUserDetails;
import com.macro.mall.common.api.CommonResult;
import com.macro.mall.common.exception.BusinessException;
import com.macro.mall.entity.Massagist;
import com.macro.mall.model.UmsAdmin;
import com.macro.mall.model.UmsRole;
import com.macro.mall.service.MassagistService;
import com.macro.mall.service.UmsAdminService;
import com.macro.mall.service.SalaryRecordService;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;

import java.time.YearMonth;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import com.macro.mall.utils.DateUtil;
import io.swagger.annotations.Api;
import io.swagger.annotations.ApiOperation;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

/**
 * @author
 * @date 2025/09/23
 */
@RestController
@RequestMapping("/salaryRecord")
@Api(tags = "")
public class SalaryRecordController {
    @Autowired
    SalaryRecordService salaryRecordService;
    @Autowired
    UmsAdminService adminService;
    @Autowired
    MassagistService massagistService;

    // 与现有结算详情管理角色保持一致，不复用范围更宽的接单奖励角色配置。
    private static final List<String> MANAGER_ROLES = Arrays.asList("超级管理员", "总助", "财务");

    private UmsAdmin currentAdmin() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null || !authentication.isAuthenticated()
                || !(authentication.getPrincipal() instanceof AdminUserDetails)) {
            throw new BusinessException("登录状态已失效，请重新登录");
        }
        UmsAdmin snapshot = ((AdminUserDetails) authentication.getPrincipal()).getUmsAdmin();
        if (snapshot == null || snapshot.getId() == null) {
            throw new BusinessException("登录状态已失效，请重新登录");
        }
        // 停用、删除或重新绑定后，旧登录令牌不能继续读取原账号范围。
        UmsAdmin admin = adminService.getItem(snapshot.getId());
        if (admin == null || !snapshot.getId().equals(admin.getId()) || !Integer.valueOf(1).equals(admin.getStatus())) {
            throw new BusinessException("当前账号已停用或不存在");
        }
        return admin;
    }

    private boolean isManager(UmsAdmin admin) {
        List<UmsRole> roles = adminService.getRoleList(admin.getId());
        if (roles == null) return false;
        for (UmsRole role : roles) {
            if (role != null && Integer.valueOf(1).equals(role.getStatus()) && MANAGER_ROLES.contains(role.getName())) return true;
        }
        return false;
    }

    private void requireManager() {
        if (!isManager(currentAdmin())) throw new BusinessException("仅结算管理角色可执行此操作");
    }

    private void requirePersonId(Long massagistId) {
        if (massagistId == null || massagistId <= 0) throw new BusinessException("请选择有效的疗愈师");
    }

    private void requireRead(Long massagistId) {
        UmsAdmin admin = currentAdmin();
        requirePersonId(massagistId);
        if (isManager(admin)) return;
        Massagist linked;
        if (admin.getMassagistId() != null) {
            if (!massagistId.equals(admin.getMassagistId())) throw new BusinessException("仅可查看本人的结算记录");
            linked = massagistService.getById(admin.getMassagistId());
        } else {
            linked = massagistService.getOne(new LambdaQueryWrapper<Massagist>()
                    .eq(Massagist::getUmsAdminId, admin.getId()), false);
        }
        if (linked == null || !massagistId.equals(linked.getId())
                || (linked.getUmsAdminId() != null && !admin.getId().equals(linked.getUmsAdminId()))) {
            throw new BusinessException("当前账号未关联该疗愈师，无法查看结算记录");
        }
    }

    private void requireMonth(String monthCode) {
        if (monthCode == null || !monthCode.matches("\\d{4}-\\d{2}")) throw new BusinessException("结算月份格式应为年-月");
        try { YearMonth.parse(monthCode); }
        catch (DateTimeParseException e) { throw new BusinessException("结算月份无效"); }
    }

    @GetMapping("/people")
    @ApiOperation("结算详情疗愈师分页选择，仅返回必要字段")
    public CommonResult people(@RequestParam(defaultValue = "1") Integer status,
                               @RequestParam(defaultValue = "1") int page,
                               @RequestParam(defaultValue = "20") int size,
                               @RequestParam(required = false) String name) {
        requireManager();
        if (page < 1 || page > 100000 || size < 1 || size > 100) throw new BusinessException("分页参数超出范围");
        int selectedStatus = status == null ? 1 : status;
        if (selectedStatus < -1 || selectedStatus > 2) throw new BusinessException("合作状态无效");
        String keyword = name == null ? "" : name.trim();
        if (keyword.length() > 100) throw new BusinessException("姓名筛选最多100个字符");
        Map<String, Object> params = new LinkedHashMap<>();
        params.put("page", page); params.put("size", size); params.put("order", "name,id");
        if (selectedStatus >= 0) params.put("status", selectedStatus);
        if (!keyword.isEmpty()) params.put("name", keyword);
        // 复用既有数据库 PageHelper 分页；不加载全员、不接受任意排序或门店参数。
        PageInfo<Massagist> result = massagistService.pageInfo(params);
        List<Map<String, Object>> rows = new ArrayList<>();
        for (Massagist person : result.getList()) {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("id", person.getId()); row.put("name", person.getName()); row.put("status", person.getStatus());
            rows.add(row);
        }
        Map<String, Object> response = new LinkedHashMap<>();
        response.put("list", rows); response.put("total", result.getTotal());
        response.put("pageNum", page); response.put("pageSize", size);
        return CommonResult.success(response);
    }

    @GetMapping("/info")
    @ApiOperation("获取疗愈师结算记录")
    public CommonResult info(@RequestParam Long massagistId, @RequestParam String monthCode) {
        requireRead(massagistId);
        requireMonth(monthCode);
        return CommonResult.success(salaryRecordService.findMassagistSalaryRecordDetail(massagistId, monthCode));
    }

    @PostMapping("/reset")
    @ApiOperation("重新结算疗愈师指定月份及之后的记录")
    public CommonResult reset(@RequestParam Long massagistId, @RequestParam String monthCode) {
        requireManager();
        requirePersonId(massagistId);
        requireMonth(monthCode);
        salaryRecordService.resetMassagistSalaryRecords(massagistId, monthCode);
        return CommonResult.success();
    }

    @GetMapping("/findMassagistAllMonthCode")
    @ApiOperation("获取疗愈师结算月份")
    public CommonResult findMassagistAllMonthCode(@RequestParam Long massagistId) {
        requireRead(massagistId);
        return CommonResult.success(salaryRecordService.findMassagistAllMonthCode(massagistId));
    }

    @GetMapping("/resetRecordNew")
    @ApiOperation("手动重新计算所有疗愈师的结算记录")
    public CommonResult resetRecordNew() {
        requireManager();
        String lastMonthCode = DateUtil.getLastMonthCode();
        salaryRecordService.calcSalaryRecordByMonthCode(lastMonthCode);
        return CommonResult.success();
    }
}
