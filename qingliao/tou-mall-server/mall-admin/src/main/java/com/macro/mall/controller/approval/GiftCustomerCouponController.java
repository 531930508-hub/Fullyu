package com.macro.mall.controller.approval;

import com.macro.mall.common.api.CommonResult;
import com.macro.mall.common.exception.BusinessException;
import com.macro.mall.bo.AdminUserDetails;
import com.macro.mall.model.UmsAdmin;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import javax.servlet.http.HttpServletResponse;
import java.io.IOException;
import com.macro.mall.entity.GiftCustomerCoupon;
import com.macro.mall.service.approval.GiftCustomerCouponService;
import io.swagger.annotations.ApiOperation;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;
import io.swagger.annotations.Api;
import org.springframework.web.multipart.MultipartFile;

/**
 * @author zkl
 * @date 2025/06/20
 */
@RestController
@RequestMapping("/giftCustomerCoupon")
@Api(tags = "")
public class GiftCustomerCouponController {
    @Autowired
    GiftCustomerCouponService giftCustomerCouponService;

    @PostMapping("/add")
    @ApiOperation("添加")
    public CommonResult add(@RequestBody GiftCustomerCoupon giftCustomerCoupon) {
        Long adminId = currentAdminId();
        if (giftCustomerCoupon == null) throw new BusinessException("赠券申请不能为空");
        giftCustomerCoupon.setCreateUser(adminId);
        giftCustomerCouponService.add(giftCustomerCoupon);
        return CommonResult.success();
    }

    @PostMapping("/import/add")
    @ApiOperation("批量提交赠券申请")
    public CommonResult importAdd(@RequestPart("file") MultipartFile file, @RequestParam Long shopId,
                                 @RequestParam(required = false) Long createUser) {
        giftCustomerCouponService.importAdd(file, shopId, currentAdminId());
        return CommonResult.success();
    }

    @GetMapping("/import/template")
    @ApiOperation("下载批量赠券模板")
    public void template(HttpServletResponse response) throws IOException {
        currentAdminId();
        giftCustomerCouponService.template(response);
    }

    private Long currentAdminId() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || !auth.isAuthenticated() || !(auth.getPrincipal() instanceof AdminUserDetails))
            throw new BusinessException("请先登录后台");
        UmsAdmin admin = ((AdminUserDetails) auth.getPrincipal()).getUmsAdmin();
        if (admin == null || admin.getId() == null || !Integer.valueOf(1).equals(admin.getStatus()))
            throw new BusinessException("后台账号不可用");
        return admin.getId();
    }
}
