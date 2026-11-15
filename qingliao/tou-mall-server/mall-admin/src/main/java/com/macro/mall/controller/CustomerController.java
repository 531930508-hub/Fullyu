package com.macro.mall.controller;

import com.macro.mall.annotation.ExportLog;
import com.macro.mall.aspect.IgnoreLog;
import com.macro.mall.common.api.CommonResult;
import com.macro.mall.common.exception.BusinessException;
import com.macro.mall.config.ContextMixin;
import com.macro.mall.crm.brand.BrandMemberProfileSync;
import com.macro.mall.entity.Customer;
import com.macro.mall.service.CustomerService;
import io.swagger.annotations.Api;
import io.swagger.annotations.ApiOperation;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeParseException;
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
        // 本地照常保存；CRM 同步失败只把原因带回给操作人（资料以 CRM 为唯一归档）
        String syncWarning = customerService.updateWithProfileSync(customer);
        if (syncWarning == null) {
            return CommonResult.success(customer);
        }
        return CommonResult.success(customer, "已保存，但会员资料未同步到会员中心：" + syncWarning);
    }

    @PutMapping("/update/profile")
    @ApiOperation("顾客个人中心修改资料（昵称/头像/性别/生日）")
    public CommonResult updateProfile(@RequestBody Map<String, Object> params) {
        Long customerId = curCustomerId();
        return CommonResult.success(customerService.updateProfile(customerId, customer -> {
            if (params.containsKey("nickname")) {
                Object nickname = params.get("nickname");
                String value = nickname == null ? null : nickname.toString().trim();
                if (value == null || value.isEmpty()
                        || value.codePointCount(0, value.length()) > BrandMemberProfileSync.NICKNAME_MAX) {
                    throw new BusinessException("昵称需在 1-" + BrandMemberProfileSync.NICKNAME_MAX + " 个字之间");
                }
                customer.setNickname(value);
            }
            if (params.containsKey("avatar")) {
                Object avatar = params.get("avatar");
                customer.setAvatar(avatar == null ? null : avatar.toString().trim());
            }
            if (params.containsKey("gender")) {
                customer.setGender(genderValue(params.get("gender")));
            }
            if (params.containsKey("birthday")) {
                customer.setBirthday(birthdayValue(params.get("birthday")));
            }
        }));
    }

    @GetMapping("/profile")
    @ApiOperation("顾客个人中心读取资料（以会员中心为准，不可用时回落本地）")
    public CommonResult profile() {
        return CommonResult.success(customerService.getProfile(curCustomerId()));
    }

    private Integer genderValue(Object raw) {
        if (raw == null || raw.toString().trim().isEmpty()) {
            return null;
        }
        String value = raw.toString().trim();
        if ("1".equals(value)) {
            return 1;
        }
        if ("2".equals(value)) {
            return 2;
        }
        throw new BusinessException("性别只能是 1（男）或 2（女）");
    }

    private LocalDate birthdayValue(Object raw) {
        if (raw == null || raw.toString().trim().isEmpty()) {
            return null;
        }
        try {
            return LocalDate.parse(raw.toString().trim());
        } catch (DateTimeParseException e) {
            throw new BusinessException("生日格式应为 yyyy-MM-dd");
        }
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
    @ExportLog(module = "customer", value = "客户列表")
    public void exportCustomer(@RequestParam Map<String, Object> params) {
        customerService.exportCustomer(params);
    }

}
