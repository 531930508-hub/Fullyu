package com.macro.mall.controller;

import com.macro.mall.aspect.IgnoreLog;
import com.macro.mall.common.api.CommonResult;
import com.macro.mall.config.ContextMixin;
import com.macro.mall.entity.Customer;
import com.macro.mall.service.CustomerService;
import io.swagger.annotations.Api;
import io.swagger.annotations.ApiOperation;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.util.Map;

/**
 * 客户
 *
 * @author ST
 * @date 2025/06/04
 */
@RestController
@RequestMapping("/customer")
@Api(tags = "客户")
public class CustomerController implements ContextMixin {
    @Autowired
    CustomerService customerService;

    @ApiOperation(value = "登录以后返回token")
    @PostMapping("/login")
    @IgnoreLog
    public CommonResult login(@RequestBody Map<String, String> params) {
        return CommonResult.success(customerService.login(params));
    }

    @GetMapping("/page")
    @ApiOperation("分页查询")
    public CommonResult page(@RequestParam Map<String, Object> params) {
        return CommonResult.success(customerService.pageInfo(params));
    }

    @GetMapping("/list")
    @ApiOperation("根据条件查询list")
    public CommonResult list(@RequestParam Map<String, Object> params) {
        return CommonResult.success(customerService.listNoPage(params));
    }

    @PutMapping("/update/avatar")
    @ApiOperation("修改头像")
    public CommonResult updateAvatar(@RequestParam String avatar) {
        return CommonResult.success(customerService.updateAvatar(curCustomerId(), avatar));
    }

    @PutMapping("/update/nickname")
    @ApiOperation("修改昵称")
    public CommonResult updateNickname(@RequestParam String nickname) {
        return CommonResult.success(customerService.updateNickname(curCustomerId(), nickname));
    }

    @PutMapping
    @ApiOperation("修改")
    public CommonResult update(@RequestBody Customer customer) {
        customer.setUpdateTime(LocalDateTime.now());
        customerService.updateById(customer);
        return CommonResult.success(customer);
    }

    @GetMapping("/info")
    public CommonResult info(@RequestParam Long id) {
        return CommonResult.success(customerService.getById(id));
    }

    @GetMapping("/getIntegration")
    @ApiOperation("获取客户积分")
    public CommonResult getIntegration() {
        return CommonResult.success(customerService.getIntegration(curCustomerId()));
    }

    @GetMapping("/getInvalidIntegration")
    @ApiOperation("获取客户今年即将失效的积分")
    public CommonResult getInvalidIntegration() {
        return CommonResult.success(customerService.getInvalidIntegration(curCustomerId()));
    }

    @GetMapping("/invitationQrImage")
    @ApiOperation("获取客户的小程序邀请码图片地址")
    public CommonResult findInvitationQrImage() {
        Long customerId = curCustomerId();
        return CommonResult.success(customerService.findInvitationQrImage(customerId));
    }

    @ApiOperation("活动进入添加客户标签")
    @PostMapping("/saveCustomerTagByActivityCode")
    public CommonResult saveCustomerTagByActivityCode(@RequestParam String activityCode) {
        customerService.saveCustomerTagByActivityCode(activityCode, curCustomerId());
        return CommonResult.success();
    }

    @GetMapping("/getCustomerVipLevel")
    @ApiOperation("获取客户vip等级")
    public CommonResult getCustomerVipLevel() {
        return CommonResult.success(customerService.getCustomerVipLevel(curCustomerId()));
    }

    @GetMapping("/export")
    @ApiOperation("导出")
    public void exportCustomer(@RequestParam Map<String, Object> params) {
        customerService.exportCustomer(params);
    }

}
