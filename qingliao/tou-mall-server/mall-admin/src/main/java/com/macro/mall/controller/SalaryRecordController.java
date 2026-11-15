package com.macro.mall.controller;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.github.pagehelper.PageInfo;
import com.macro.mall.bo.AdminUserDetails;
import com.macro.mall.common.api.CommonResult;
import com.macro.mall.common.exception.BusinessException;
import com.macro.mall.entity.Massagist;
import com.macro.mall.enums.MassagistIdentityCode;
import com.macro.mall.model.UmsAdmin;
import com.macro.mall.model.UmsRole;
import com.macro.mall.service.MassagistIdentityService;
import com.macro.mall.service.MassagistService;
import com.macro.mall.service.UmsAdminService;
import com.macro.mall.service.SalaryRecordService;
import com.macro.mall.service.base.ShopScopeService;
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
    @Autowired
    ShopScopeService shopScopeService;
    @Autowired
    MassagistIdentityService massagistIdentityService;

    // 与现有结算详情管理角色保持一致，不复用范围更宽的接单奖励角色配置。
    private static final List<String> MANAGER_ROLES = Arrays.asList("超级管理员", "总助", "财务");
    private static final String SHOP_MANAGER_ROLE = "店长";

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

    /**
     * 当前账号关联的疗愈师档案（本人），非技师账号返回 null。
     * 账号已绑定档案但档案被删除或已被其他账号接管时直接失败关闭，
     * 不能当作"未关联档案的管理账号"回落到门店作用域。
     */
    private Massagist linkedMassagist(UmsAdmin admin) {
        if (admin.getMassagistId() != null) {
            Massagist byId = massagistService.getById(admin.getMassagistId());
            if (byId == null) throw new BusinessException("疗愈师档案不存在或已删除");
            if (byId.getUmsAdminId() != null && !admin.getId().equals(byId.getUmsAdminId())) {
                // 关联已被其他账号接管，旧绑定失效
                throw new BusinessException("疗愈师档案已绑定其他账号");
            }
            return byId;
        }
        return massagistService.getOne(new LambdaQueryWrapper<Massagist>()
                .eq(Massagist::getUmsAdminId, admin.getId()), false);
    }

    private boolean hasRole(UmsAdmin admin, String roleName) {
        List<UmsRole> roles = adminService.getRoleList(admin.getId());
        if (roles == null) return false;
        for (UmsRole role : roles) {
            if (role != null && Integer.valueOf(1).equals(role.getStatus()) && roleName.equals(role.getName())) return true;
        }
        return false;
    }

    private boolean isShopManager(Massagist massagist) {
        if (massagist == null) return false;
        if (Boolean.TRUE.equals(massagist.getShopManager())) return true;
        try {
            return massagistIdentityService.hasCode(massagist.getId(), MassagistIdentityCode.SHOP_MANAGER);
        } catch (Exception e) {
            // 身份表未迁移时按非店长处理，权限只会更严
            return false;
        }
    }

    /** 内训师可查看名下辅导对象的劳务服务费，与内训考核的选人范围保持一致 */
    private boolean isTrainer(Massagist massagist) {
        return massagist != null && Integer.valueOf(1).equals(massagist.getIsTrainer());
    }

    /** 目标疗愈师必须落在当前账号授权门店内 */
    private void requireMassagistInScope(Long massagistId) {
        Massagist target = massagistService.getById(massagistId);
        if (target == null) throw new BusinessException("疗愈师档案不存在");
        List<Long> shopIds = shopScopeService.authorizedShopIds();
        if (shopIds == null) return;
        if (shopIds.isEmpty()) throw new BusinessException("当前账号尚未配置可查看门店");
        if (target.getShopId() == null || !shopIds.contains(target.getShopId())) {
            throw new BusinessException("无权查看该门店");
        }
    }

    /**
     * 读取权限：结算管理角色看全部；疗愈师本人只看本人；内训师可查看辅导对象；
     * 店长及未关联档案的管理账号（如运营/前台）按授权门店范围查看。
     */
    private void requireRead(Long massagistId) {
        UmsAdmin admin = currentAdmin();
        requirePersonId(massagistId);
        if (isManager(admin)) return;
        Massagist linked = linkedMassagist(admin);
        if (isTrainer(linked)) return;
        if (linked == null || isShopManager(linked) || hasRole(admin, SHOP_MANAGER_ROLE)) {
            requireMassagistInScope(massagistId);
            return;
        }
        if (!massagistId.equals(linked.getId())) throw new BusinessException("仅可查看本人的结算记录");
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
        UmsAdmin admin = currentAdmin();
        Massagist linked = isManager(admin) ? null : linkedMassagist(admin);
        boolean trainerViewer = isTrainer(linked);
        // 店长/内训师/未关联档案的管理账号（如运营/前台）都可以选人；
        // 纯疗愈师账号不参与检索，直接拒绝，避免借选择器窥探同事收入。
        if (linked != null && !trainerViewer && !hasRole(admin, SHOP_MANAGER_ROLE) && !isShopManager(linked)) {
            throw new BusinessException("仅结算管理角色可选择疗愈师");
        }
        if (page < 1 || page > 100000 || size < 1 || size > 100) throw new BusinessException("分页参数超出范围");
        int selectedStatus = status == null ? 1 : status;
        if (selectedStatus < -1 || selectedStatus > 2) throw new BusinessException("合作状态无效");
        String keyword = name == null ? "" : name.trim();
        if (keyword.length() > 100) throw new BusinessException("姓名筛选最多100个字符");
        Map<String, Object> params = new LinkedHashMap<>();
        params.put("page", page); params.put("size", size); params.put("order", "name,id");
        if (trainerViewer) {
            // 内训师辅导范围跨店，与内训考核选人一致：按姓名/状态检索，不再叠加门店作用域
            params.put("ignoreShopScope", true);
        }
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

    @GetMapping("/monthCodes")
    @ApiOperation("获取全部已生成结算记录的月份")
    public CommonResult monthCodes() {
        requireManager();
        return CommonResult.success(salaryRecordService.findAllMonthCodes());
    }

    @GetMapping("/monthSummary")
    @ApiOperation("按月份汇总劳务服务费")
    public CommonResult monthSummary(@RequestParam String monthCode,
                                     @RequestParam(defaultValue = "-1") Integer status,
                                     @RequestParam(required = false) String name) {
        requireManager();
        requireMonth(monthCode);
        int selectedStatus = status == null ? -1 : status;
        if (selectedStatus < -1 || selectedStatus > 2) throw new BusinessException("合作状态无效");
        String keyword = name == null ? "" : name.trim();
        if (keyword.length() > 100) throw new BusinessException("姓名筛选最多100个字符");
        return CommonResult.success(salaryRecordService.summarizeMonth(monthCode, selectedStatus, keyword));
    }

    @GetMapping("/monthRows")
    @ApiOperation("按月份查询全员劳务服务费明细，供管理端不分页表格使用")
    public CommonResult monthRows(@RequestParam String monthCode,
                                  @RequestParam(defaultValue = "-1") Integer status,
                                  @RequestParam(required = false) String name) {
        requireManager();
        requireMonth(monthCode);
        int selectedStatus = status == null ? -1 : status;
        if (selectedStatus < -1 || selectedStatus > 2) throw new BusinessException("合作状态无效");
        String keyword = name == null ? "" : name.trim();
        if (keyword.length() > 100) throw new BusinessException("姓名筛选最多100个字符");
        return CommonResult.success(salaryRecordService.listMonthRows(monthCode, selectedStatus, keyword));
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
