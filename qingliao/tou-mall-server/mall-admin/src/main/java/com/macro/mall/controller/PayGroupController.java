package com.macro.mall.controller;

import com.macro.mall.common.api.CommonResult;
import com.macro.mall.common.exception.BusinessException;
import com.macro.mall.config.ContextMixin;
import com.macro.mall.service.PayGroupService;
import io.swagger.annotations.Api;
import io.swagger.annotations.ApiOperation;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.Map;

/**
 * 合并支付：预约单 + 会员卡续费一次收款，按台账分单结算。
 *
 * <p>小程序端：create / state / mockPay。后台管理端：admin/page。</p>
 *
 * @date 2026/12/01
 */
@RestController
@RequestMapping("/payGroup")
@Api(tags = "合并支付（预约+会员卡续费）")
public class PayGroupController implements ContextMixin {

    @Autowired
    private PayGroupService payGroupService;

    @PostMapping("/create")
    @ApiOperation("创建合并支付（orderId 必填，renewYear=true 同时续年卡）")
    public CommonResult create(@RequestBody(required = false) Map<String, Object> params) {
        Long customerId = curCustomerId();
        if (customerId == null) {
            throw new BusinessException("请先登录", 401);
        }
        return CommonResult.success(payGroupService.createMergePay(customerId,
                params == null ? new HashMap<>() : params));
    }

    @GetMapping("/state")
    @ApiOperation("合并支付状态（小程序轮询）")
    public CommonResult state(@RequestParam String payNo) {
        Long customerId = curCustomerId();
        if (customerId == null) {
            throw new BusinessException("请先登录", 401);
        }
        return CommonResult.success(payGroupService.state(customerId, payNo));
    }

    @PostMapping("/mockPay")
    @ApiOperation("测试环境模拟合并支付")
    public CommonResult mockPay(@RequestBody Map<String, Object> params) {
        Long customerId = curCustomerId();
        if (customerId == null) {
            throw new BusinessException("请先登录", 401);
        }
        Object payNo = params.get("payNo");
        if (payNo == null) {
            throw new BusinessException("缺少支付单号");
        }
        return CommonResult.success(payGroupService.mockPay(customerId, payNo.toString()));
    }

    @GetMapping("/admin/page")
    @ApiOperation("后台：合并支付台账分页（对账用）")
    public CommonResult adminPage(@RequestParam Map<String, Object> params) {
        return CommonResult.success(payGroupService.adminPage(params));
    }

    @PostMapping("/admin/split/confirm")
    @ApiOperation("后台：手工确认门店分账完成（线下走账 / 分账通道未开通时用）")
    public CommonResult confirmSplit(@RequestBody Map<String, Object> params) {
        Object id = params == null ? null : params.get("id");
        if (id == null) {
            throw new BusinessException("缺少台账 id");
        }
        Object splitPayNo = params.get("splitPayNo");
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        String operator = auth == null || auth.getName() == null ? "admin" : auth.getName();
        payGroupService.confirmSplit(Long.valueOf(id.toString()),
                splitPayNo == null || splitPayNo.toString().trim().isEmpty() ? null : splitPayNo.toString().trim(),
                operator);
        return CommonResult.success(null);
    }
}