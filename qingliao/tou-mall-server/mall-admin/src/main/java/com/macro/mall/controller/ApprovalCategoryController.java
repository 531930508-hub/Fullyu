package com.macro.mall.controller;

import com.macro.mall.bo.AdminUserDetails;
import com.macro.mall.common.api.CommonResult;
import com.macro.mall.common.exception.BusinessException;
import com.macro.mall.entity.ApprovalCategory;
import com.macro.mall.service.ApprovalCategoryService;
import io.swagger.annotations.Api;
import io.swagger.annotations.ApiOperation;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * 审批类型
 *
 * @author zkl
 * @date 2025/06/10
 */
@RestController
@RequestMapping("/approvalCategory")
@Api(tags = "审批类型")
public class ApprovalCategoryController {
    @Autowired
    ApprovalCategoryService approvalCategoryService;

    @GetMapping("/list")
    @ApiOperation("列表")
    public CommonResult list(@RequestParam Map<String, Object> params) {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        AdminUserDetails user = (AdminUserDetails) authentication.getPrincipal();
        return CommonResult.success(approvalCategoryService.listNoPageNew(params,user.getUmsAdmin().getShopIdArr()));
    }

    @PostMapping("/update")
    @ApiOperation("配置审批")
    public CommonResult update(@RequestBody ApprovalCategory approvalCategory) {
        approvalCategoryService.update(approvalCategory);
        return CommonResult.success();
    }

    @PostMapping("/add")
    @ApiOperation("添加审批")
    public CommonResult add(@RequestBody ApprovalCategory approvalCategory) {
        approvalCategoryService.add(approvalCategory);
       /* if ("refund".equals(approvalCategory.getCode())) {
            approvalCategory.setBeanId("refundApplyService");
            approvalCategoryService.add(approvalCategory);
        } else {
            throw new BusinessException("审批验证错误");
        }*/
        return CommonResult.success();
    }

    @GetMapping("/listByShopId")
    @ApiOperation("根据shopid获取列表")
    public CommonResult listByShopId(@RequestParam Map<String, Object> params) {
        return CommonResult.success(approvalCategoryService.listNoPage(params));
    }
}
