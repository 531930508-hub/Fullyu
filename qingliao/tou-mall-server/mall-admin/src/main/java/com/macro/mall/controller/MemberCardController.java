package com.macro.mall.controller;

import com.macro.mall.bo.AdminUserDetails;
import com.macro.mall.common.api.CommonResult;
import com.macro.mall.common.exception.BusinessException;
import com.macro.mall.config.ContextMixin;
import com.macro.mall.entity.MemberCardConfig;
import com.macro.mall.service.BrandCardPaymentService;
import com.macro.mall.service.MemberCardService;
import io.swagger.annotations.Api;
import io.swagger.annotations.ApiOperation;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * Full愈年卡（会员卡）。
 *
 * <p>小程序端：config / info / purchase。
 * 后台管理端：page / detail / issue / refund / expiring / stats / config/update。</p>
 *
 * @date 2026/11/07
 */
@RestController
@RequestMapping("/memberCard")
@Api(tags = "Full愈年卡")
public class MemberCardController implements ContextMixin {

    @Autowired
    private MemberCardService service;
    @Autowired
    private BrandCardPaymentService brandCardPaymentService;

    @GetMapping("/config")
    @ApiOperation("年卡配置与权益说明（无需登录）")
    public CommonResult config() {
        return CommonResult.success(service.configView());
    }

    @GetMapping("/info")
    @ApiOperation("当前客户年卡信息（未登录返回 authorized=false）")
    public CommonResult info() {
        return CommonResult.success(service.info(curCustomerId()));
    }

    @PostMapping("/purchase")
    @ApiOperation("开通 / 续费会员卡（月卡 / 年卡）")
    public CommonResult purchase(@RequestBody(required = false) Map<String, Object> params) {
        Long customerId = curCustomerId();
        if (customerId == null) {
            throw new BusinessException("请先登录");
        }
        Map<String, Object> form = params == null ? new java.util.HashMap<>() : params;
        Object cardType = form.get("cardType");
        return CommonResult.success(service.purchase(customerId,
                cardType == null ? null : cardType.toString(), form));
    }

    @GetMapping("/page")
    @ApiOperation("后台：会员卡分页")
    public CommonResult page(@RequestParam Map<String, Object> params) {
        return CommonResult.success(service.adminPage(params));
    }

    @GetMapping("/detail")
    @ApiOperation("后台：会员卡详情")
    public CommonResult detail(@RequestParam Long id) {
        return CommonResult.success(service.adminDetail(id));
    }

    @PostMapping("/issue")
    @ApiOperation("后台：手工开卡")
    public CommonResult issue(@RequestBody Map<String, Object> params) {
        return CommonResult.success(service.adminIssue(params, currentAdminId()));
    }

    @GetMapping("/expiring")
    @ApiOperation("后台：即将到期列表")
    public CommonResult expiring(@RequestParam(required = false) Integer days) {
        return CommonResult.success(service.expiringList(days));
    }

    @GetMapping("/stats")
    @ApiOperation("后台：年卡指标")
    public CommonResult stats() {
        return CommonResult.success(service.stats());
    }

    @GetMapping("/config/admin")
    @ApiOperation("后台：读取会员卡产品配置")
    public CommonResult adminConfig() {
        return CommonResult.success(service.listActiveConfigs());
    }

    @PostMapping("/config/update")
    @ApiOperation("后台：保存年卡配置")
    public CommonResult updateConfig(@RequestBody MemberCardConfig config) {
        service.updateConfig(config);
        return CommonResult.success(service.configView());
    }

    @GetMapping("/brandOrder/page")
    @ApiOperation("后台：品牌会员卡支付单分页")
    public CommonResult brandOrderPage(@RequestParam Map<String, Object> params) {
        return CommonResult.success(brandCardPaymentService.adminPage(params));
    }

    @GetMapping("/brandOrder/preview")
    @ApiOperation("后台：品牌会员卡退卡试算")
    public CommonResult brandOrderPreview(@RequestParam Long id) {
        return CommonResult.success(brandCardPaymentService.adminPreview(id));
    }

    @PostMapping("/brandOrder/refund")
    @ApiOperation("后台：品牌会员卡退款")
    public CommonResult brandOrderRefund(@RequestBody Map<String, Object> params) {
        Object id = params.get("id");
        if (id == null) {
            throw new BusinessException("缺少支付单 id");
        }
        Object reason = params.get("reason");
        boolean confirmZero = Boolean.parseBoolean(String.valueOf(params.getOrDefault("confirmZero", "false")));
        return CommonResult.success(brandCardPaymentService.adminRefund(Long.valueOf(id.toString()),
                reason == null ? null : reason.toString(), confirmZero, currentAdminId()));
    }

    @PostMapping("/brandOrder/retrySettle")
    @ApiOperation("后台：已支付待开卡订单重试开卡")
    public CommonResult brandOrderRetrySettle(@RequestBody Map<String, Object> params) {
        Object id = params.get("id");
        if (id == null) {
            throw new BusinessException("缺少支付单 id");
        }
        return CommonResult.success(brandCardPaymentService.retrySettle(Long.valueOf(id.toString())));
    }

    @PostMapping("/brandOrder/retry")
    @ApiOperation("后台：重试 CRM 卡权撤销")
    public CommonResult brandOrderRetry(@RequestBody Map<String, Object> params) {
        Object id = params.get("id");
        if (id == null) {
            throw new BusinessException("缺少支付单 id");
        }
        int retried = brandCardPaymentService.retryCrmRefund(Long.valueOf(id.toString()));
        return CommonResult.success(retried);
    }

    @PostMapping("/customer/unlock")
    @ApiOperation("后台：解除客户品牌会员购买锁定")
    public CommonResult unlockCustomer(@RequestBody Map<String, Object> params) {
        Object customerId = params.get("customerId");
        if (customerId == null) {
            throw new BusinessException("缺少客户 id");
        }
        brandCardPaymentService.unlockCustomer(Long.valueOf(customerId.toString()));
        return CommonResult.success(null);
    }

    private Long currentAdminId() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication != null && authentication.getPrincipal() instanceof AdminUserDetails) {
            return ((AdminUserDetails) authentication.getPrincipal()).getUmsAdmin().getId();
        }
        return null;
    }
}
