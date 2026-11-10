package com.macro.mall.controller;

import com.macro.mall.bo.AdminUserDetails;
import com.macro.mall.common.api.CommonResult;
import com.macro.mall.common.exception.BusinessException;
import com.macro.mall.config.ContextMixin;
import com.macro.mall.entity.Customer;
import com.macro.mall.entity.CustomerMassagistBlock;
import com.macro.mall.model.UmsAdmin;
import com.macro.mall.service.CustomerMassagistBlockService;
import com.macro.mall.service.CustomerService;
import io.swagger.annotations.Api;
import io.swagger.annotations.ApiOperation;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.*;

import java.io.Serializable;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * 客户暂别的疗愈师。
 *
 * <p>对外统一文案为「收藏 / 暂别」，此处 block 仅为技术语义，不出现在任何界面。</p>
 *
 * @date 2026/11/07
 */
@RestController
@RequestMapping("/customerMassagistBlock")
@Api(tags = "客户疗愈师偏好-暂别")
public class CustomerMassagistBlockController implements ContextMixin {

    @Autowired
    private CustomerMassagistBlockService service;

    @Autowired
    private CustomerService customerService;

    // ---------------------------------------------------------------------
    // 小程序端（客户身份）
    // ---------------------------------------------------------------------

    @PostMapping("/create/relation")
    @ApiOperation("设为暂别（同时解除同一位疗愈师的收藏）")
    public CommonResult createRelation(@RequestParam Long massagistId) {
        Long customerId = curCustomerId();
        if (customerId == null) {
            throw new BusinessException("请先登录");
        }
        return CommonResult.success(service.createBlock(customerId, massagistId,
                CustomerMassagistBlockService.SOURCE_CUSTOMER, null));
    }

    @GetMapping("/get/page")
    @ApiOperation("我的暂别列表")
    public CommonResult getPage(@RequestParam Map<String, Object> params) {
        params.put("customerId", curCustomerId());
        return CommonResult.success(service.pageInfo(params));
    }

    @GetMapping("/get/ids")
    @ApiOperation("我的暂别疗愈师id数组")
    public CommonResult getIds() {
        return CommonResult.success(service.blockedMassagistIds(curCustomerId()));
    }

    // ---------------------------------------------------------------------
    // 后台端（管理员身份）
    // ---------------------------------------------------------------------

    @GetMapping("/page")
    @ApiOperation("按客户分页查询暂别")
    public CommonResult page(@RequestParam Map<String, Object> params) {
        return CommonResult.success(service.pageInfo(params));
    }

    @GetMapping("/byPhone")
    @ApiOperation("按手机号查询该客户暂别的疗愈师（建单抽屉轻量查询）")
    public CommonResult byPhone(@RequestParam String phone) {
        if (!StringUtils.hasText(phone)) {
            return CommonResult.success(new ArrayList<>());
        }
        Customer customer = customerService.getByPhone(phone.trim());
        if (customer == null) {
            return CommonResult.success(new ArrayList<>());
        }
        List<CustomerMassagistBlock> list = service.listByCustomerId(customer.getId());
        list.forEach(item -> item.setCustomerNickname(customer.getNickname()));
        return CommonResult.success(list);
    }

    @PostMapping
    @ApiOperation("后台代客户设为暂别")
    public CommonResult create(@RequestBody CustomerMassagistBlock block) {
        if (block.getCustomerId() == null || block.getMassagistId() == null) {
            throw new BusinessException("客户和疗愈师不能为空");
        }
        return CommonResult.success(service.createBlock(block.getCustomerId(), block.getMassagistId(),
                CustomerMassagistBlockService.SOURCE_ADMIN, currentAdminUsername()));
    }

    @DeleteMapping("/{id}")
    @ApiOperation("解除暂别（小程序与后台共用）")
    public CommonResult remove(@PathVariable Serializable id) {
        CustomerMassagistBlock block = service.getById(id);
        if (block == null) {
            return CommonResult.success();
        }
        // 小程序端校验归属；后台管理员身份不做归属校验。
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        boolean adminRequest = authentication != null && authentication.getPrincipal() instanceof AdminUserDetails;
        if (!adminRequest) {
            Long customerId = curCustomerId();
            if (customerId != null && !customerId.equals(block.getCustomerId())) {
                throw new BusinessException("无权操作该记录");
            }
        }
        service.removeById(id);
        return CommonResult.success();
    }

    @GetMapping("/count")
    @ApiOperation("批量统计客户的收藏与暂别数量")
    public CommonResult count(@RequestParam(required = false) String customerIds) {
        if (!StringUtils.hasText(customerIds)) {
            return CommonResult.success(new ArrayList<>());
        }
        List<Long> idList = Arrays.stream(customerIds.split(","))
                .map(String::trim)
                .filter(StringUtils::hasText)
                .map(Long::valueOf)
                .collect(Collectors.toList());
        return CommonResult.success(service.countByCustomerIds(idList));
    }

    /**
     * 当前管理员账号；客户身份访问时返回 null。
     */
    private String currentAdminUsername() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null || !(authentication.getPrincipal() instanceof AdminUserDetails)) {
            return null;
        }
        UmsAdmin admin = ((AdminUserDetails) authentication.getPrincipal()).getUmsAdmin();
        return admin == null ? null : admin.getUsername();
    }
}
