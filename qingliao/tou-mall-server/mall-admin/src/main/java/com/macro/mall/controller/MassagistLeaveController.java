package com.macro.mall.controller;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.macro.mall.bo.AdminUserDetails;
import com.macro.mall.common.api.CommonResult;
import com.macro.mall.common.exception.BusinessException;
import com.macro.mall.entity.Massagist;
import com.macro.mall.entity.MassagistLeave;
import com.macro.mall.model.UmsAdmin;
import com.macro.mall.service.MassagistLeaveService;
import com.macro.mall.service.MassagistService;
import com.macro.mall.service.UmsAdminService;
import io.swagger.annotations.Api;
import io.swagger.annotations.ApiOperation;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

import java.util.Objects;

/**
 * @author: luxin新增
 * @description: 疗愈师休息申请
 * @date: 2021/8/19 16:51
 */
@RestController
@RequestMapping("/massagistLeave")
@Api(tags = "疗愈师休息申请", description = "")
public class MassagistLeaveController {

    @Autowired
    MassagistLeaveService massagistLeaveService;
    @Autowired
    UmsAdminService adminService;
    @Autowired
    MassagistService massagistService;

    /** 每次写入都重新读取账号，停用或换绑后旧令牌不能继续代人提交。 */
    private UmsAdmin currentAdmin() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null || !authentication.isAuthenticated()
                || !(authentication.getPrincipal() instanceof AdminUserDetails)) {
            throw new BusinessException("登录状态已失效，请重新登录");
        }
        UmsAdmin snapshot = ((AdminUserDetails) authentication.getPrincipal()).getUmsAdmin();
        if (snapshot == null || snapshot.getId() == null) throw new BusinessException("登录状态已失效，请重新登录");
        UmsAdmin admin = adminService.getItem(snapshot.getId());
        if (admin == null || !snapshot.getId().equals(admin.getId()) || !Integer.valueOf(1).equals(admin.getStatus())) {
            throw new BusinessException("当前账号已停用或不存在");
        }
        return admin;
    }

    private Massagist linkedPerson(UmsAdmin admin) {
        Massagist linked = admin.getMassagistId() != null
                ? massagistService.getById(admin.getMassagistId())
                : massagistService.getOne(new LambdaQueryWrapper<Massagist>().eq(Massagist::getUmsAdminId, admin.getId()), false);
        if (linked == null || linked.getId() == null
                || (linked.getUmsAdminId() != null && !admin.getId().equals(linked.getUmsAdminId()))) {
            throw new BusinessException("当前账号未关联疗愈师，无法申请休息");
        }
        return linked;
    }

    @PostMapping("/add")
    @ApiOperation("新增/修改休息申请（仅本人）")
    public CommonResult add(@RequestBody MassagistLeave massagistLeave){
        if (massagistLeave == null) throw new BusinessException("休息申请不能为空");
        UmsAdmin admin = currentAdmin();
        Massagist person = linkedPerson(admin);
        if (massagistLeave.getMassagistId() > 0 && massagistLeave.getMassagistId() != person.getId()) {
            throw new BusinessException("仅可为本人申请休息");
        }
        massagistLeave.setMassagistId(person.getId());
        massagistLeave.setCreateUser(admin.getId());
        return CommonResult.success(massagistLeaveService.add(massagistLeave));
    }

    @GetMapping("/findMassagistLeaveDetailByApprovalId")
    @ApiOperation("根据审批id查询休息申请详情")
    public CommonResult findMassagistLeaveDetailByApprovalId(@RequestParam long approvalId) {
        return CommonResult.success(massagistLeaveService.findMassagistLeaveDetailByApprovalId(approvalId));
    }
    @GetMapping("/getMessagistShopId")
    @ApiOperation("获取疗愈师真正的店铺Id")
    public CommonResult getMessagistShopId(@RequestParam long massagistId) {
        return CommonResult.success(massagistLeaveService.getMessagistShopId(massagistId));
    }
    @GetMapping("/cancelLeave")
    @ApiOperation("疗愈师撤销休息申请（仅本人）")
    public CommonResult cancelLeave(@RequestParam long approvalId) {
        UmsAdmin admin = currentAdmin();
        Object found = massagistLeaveService.findMassagistLeaveDetailByApprovalId(approvalId);
        if (!(found instanceof MassagistLeave)) throw new BusinessException("休息申请不存在");
        MassagistLeave leave = (MassagistLeave) found;
        boolean owner = Objects.equals(leave.getCreateUser(), admin.getId());
        if (!owner) {
            Massagist person = linkedPerson(admin);
            owner = person.getId() != null && leave.getMassagistId() == person.getId();
        }
        if (!owner) throw new BusinessException("仅可撤销本人的休息申请");
        return CommonResult.success(massagistLeaveService.cancelLeave(approvalId));
    }

}
