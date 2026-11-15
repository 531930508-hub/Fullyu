package com.macro.mall.controller;

import com.macro.mall.bo.AdminUserDetails;
import com.macro.mall.common.api.CommonResult;
import com.macro.mall.model.UmsAdmin;
import com.macro.mall.service.ApprovalDetailService;
import io.swagger.annotations.Api;
import io.swagger.annotations.ApiOperation;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * 审批详情
 *
 * @author zkl
 * @date 2025/06/10
 */
@RestController
@RequestMapping("/approvalDetail")
@Api(tags = "审批详情")
public class ApprovalDetailController {
    @Autowired
    ApprovalDetailService detailService;

    @GetMapping("/page")
    @ApiOperation("分页查询")
    public CommonResult page(@RequestParam Map<String, Object> params) {
        return CommonResult.success(detailService.pageInfo(params));
    }

    @GetMapping("/pageLeave")
    @ApiOperation("获取请假列表")
    public CommonResult pageLeave(@RequestParam Map<String, Object> params) {
        return CommonResult.success(detailService.pageLeave(params));
    }

    @GetMapping("/list")
    @ApiOperation("查询列表")
    public CommonResult list(@RequestParam Map<String, Object> params) {
        return CommonResult.success(detailService.listNoPage(params));
    }

    @GetMapping("/todoCount")
    @ApiOperation("当前审批人的待办数量（到人级别，不区分门店）")
    public CommonResult todoCount() {
        UmsAdmin admin = currentAdmin();
        return CommonResult.success(detailService.countTodo(admin == null ? null : admin.getId()));
    }

    @GetMapping("/tabCounts")
    @ApiOperation("待办中心各页签数量：我的待办 / 我的已办 / 我提交的 / 抄送我的")
    public CommonResult tabCounts() {
        UmsAdmin admin = currentAdmin();
        return CommonResult.success(detailService.tabCounts(admin == null ? null : admin.getId()));
    }

    @GetMapping("/pageSubmitted")
    @ApiOperation("我提交的审批（按发起人查询，任意状态）")
    public CommonResult pageSubmitted(@RequestParam Map<String, Object> params) {
        UmsAdmin admin = currentAdmin();
        return CommonResult.success(detailService.pageSubmitted(admin == null ? null : admin.getId(), params));
    }

    private UmsAdmin currentAdmin() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication != null && authentication.getPrincipal() instanceof AdminUserDetails) {
            return ((AdminUserDetails) authentication.getPrincipal()).getUmsAdmin();
        }
        return null;
    }

    /**
     * 通过审批
     *
     * @param id
     * @return
     */
    @PutMapping("/pass/{id}")
    @ApiOperation("通过审批")
    public CommonResult pass(@PathVariable("id") Long id) {
        detailService.pass(id);
        return CommonResult.success();
    }

    @GetMapping("/detail")
    @ApiOperation("审批关联的业务详情")
    public CommonResult businessDetail(@RequestParam Long approvalId) {
        return CommonResult.success(detailService.detail(approvalId));
    }

    @GetMapping("/flow")
    @ApiOperation("只读查看完整审批流程（订单/消费记录/排班日志回溯）")
    public CommonResult flow(@RequestParam Long approvalId) {
        return CommonResult.success(detailService.flow(approvalId));
    }

    @GetMapping("/byOrder")
    @ApiOperation("按订单查询关联审批")
    public CommonResult byOrder(@RequestParam Long orderId) {
        return CommonResult.success(detailService.listByOrderId(orderId));
    }

    @ApiOperation("拒绝审批")
    @PostMapping("/reject/{id}")
    public CommonResult reject(@PathVariable("id") Long id, @RequestParam String rejectReason) {
        detailService.reject(id, rejectReason);
        return CommonResult.success();
    }
    @PutMapping("/resubmit/{id}")
    @ApiOperation("重提交审批")
    public CommonResult resubmit(@PathVariable("id") Long id) {
        detailService.reSubmit(id);
        return CommonResult.success();
    }
}
