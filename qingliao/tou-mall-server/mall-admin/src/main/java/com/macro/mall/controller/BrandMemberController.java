package com.macro.mall.controller;

import com.macro.mall.common.api.CommonResult;
import com.macro.mall.common.exception.BusinessException;
import com.macro.mall.config.ContextMixin;
import com.macro.mall.crm.brand.BrandMemberClient;
import com.macro.mall.service.BrandCardPaymentService;
import io.swagger.annotations.Api;
import io.swagger.annotations.ApiOperation;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * 品牌会员（Full愈年卡）轻疗端接口。
 *
 * <p>品牌卡期、积分与愈行之旅以 CRM 为唯一账本；本端只做登录身份代理，
 * 不接收前端传入的会员号或金额，也不提供绕过支付的直接开卡入口。</p>
 *
 * <p>在线开通走“CRM 报价 → 汇付小程序支付 → 验签回调 → CRM issue”链路，
 * 价格与卡期均以 CRM 返回为准。测试环境可用 {@code /purchase/mock} 模拟支付。</p>
 */
@RestController
@RequestMapping("/brandMember")
@Api(tags = "品牌会员")
public class BrandMemberController implements ContextMixin {
    private final BrandMemberClient client;
    private final BrandCardPaymentService paymentService;

    public BrandMemberController(BrandMemberClient client, BrandCardPaymentService paymentService) {
        this.client = client;
        this.paymentService = paymentService;
    }

    @GetMapping("/me")
    @ApiOperation("品牌会员身份、积分与愈行之旅状态")
    public CommonResult me() {
        return CommonResult.success(client.me(String.valueOf(requireCustomer())));
    }

    @GetMapping("/products")
    @ApiOperation("品牌会员卡商品目录（CRM 定价）")
    public CommonResult products() {
        return CommonResult.success(client.products());
    }

    @PostMapping("/game/ticket")
    @ApiOperation("换取愈行之旅一次性入口票据")
    public CommonResult gameTicket() {
        return CommonResult.success(client.gameTicket(String.valueOf(requireCustomer())));
    }

    @PostMapping("/purchase")
    @ApiOperation("在线开通品牌会员卡（汇付小程序支付）")
    public CommonResult purchase(@RequestBody(required = false) Map<String, Object> params) {
        return CommonResult.success(paymentService.createOrder(requireCustomer(), params));
    }

    @PostMapping("/purchase/mock")
    @ApiOperation("测试环境模拟支付（仅 -Dfullyu.test-mode=true 可用）")
    public CommonResult mockPay(@RequestBody(required = false) Map<String, Object> params) {
        String orderSn = params == null ? null : stringValue(params.get("orderSn"));
        if (orderSn == null) {
            throw new BusinessException("缺少开卡订单号");
        }
        return CommonResult.success(paymentService.mockPay(requireCustomer(), orderSn));
    }

    @GetMapping("/order")
    @ApiOperation("开卡订单支付/开卡状态")
    public CommonResult order(@RequestParam String orderSn) {
        return CommonResult.success(paymentService.orderStatus(requireCustomer(), orderSn));
    }

    @GetMapping("/orders")
    @ApiOperation("我的品牌卡支付单、退款资格与锁定状态")
    public CommonResult orders() {
        return CommonResult.success(paymentService.customerOrders(requireCustomer()));
    }

    @GetMapping("/refund/preview")
    @ApiOperation("退卡试算（以会员中心 CRM 规则为准）")
    public CommonResult refundPreview(@RequestParam String orderSn) {
        return CommonResult.success(paymentService.refundPreview(requireCustomer(), orderSn));
    }

    @PostMapping("/refund")
    @ApiOperation("客户自助退卡（可退金额 ≤0 或赠送资格不可退）")
    public CommonResult refund(@RequestBody Map<String, Object> params) {
        String orderSn = stringValue(params.get("orderSn"));
        if (orderSn == null) {
            throw new BusinessException("缺少开卡订单号");
        }
        return CommonResult.success(paymentService.refund(requireCustomer(), orderSn,
                stringValue(params.get("reason")), false, null));
    }

    @PostMapping("/gift/claim")
    @ApiOperation("兑换赠送会员码")
    public CommonResult claimGift(@RequestBody(required = false) Map<String, Object> params) {
        Long customerId = requireCustomer();
        String code = params == null ? null : stringValue(params.get("code"));
        if (code == null) {
            throw new BusinessException("请输入会员码", 400);
        }
        String normalized = code.toUpperCase().replaceAll("\\s+", "");
        if (!normalized.matches("^[A-Z0-9]{4,16}$")) {
            throw new BusinessException("会员码不存在，请核对后再试", 404);
        }
        return CommonResult.success(client.claimGift(String.valueOf(customerId), normalized));
    }

    @PostMapping("/feedback")
    @ApiOperation("会员意见反馈")
    public CommonResult feedback(@RequestBody(required = false) Map<String, Object> params) {
        Long customerId = requireCustomer();
        String content = params == null ? null : stringValue(params.get("content"));
        if (content == null || content.length() < 5) {
            throw new BusinessException("请至少写 5 个字，方便我们理解你的建议", 400);
        }
        // 与 CRM（program.service）和时叙保持同一上限，避免小程序允许输入却被本端拒绝
        if (content.length() > 1000) {
            throw new BusinessException("反馈内容最多 1000 字", 400);
        }
        boolean allowQuote = params != null && Boolean.parseBoolean(String.valueOf(params.get("allowQuote")));
        return CommonResult.success(client.feedback(String.valueOf(customerId), content, allowQuote));
    }

    @GetMapping("/stories")
    @ApiOperation("会员故事（仅有效品牌会员可读）")
    public CommonResult stories() {
        return CommonResult.success(client.stories(String.valueOf(requireCustomer())));
    }

    private Long requireCustomer() {
        Long customerId = curCustomerId();
        if (customerId == null) {
            throw new BusinessException("请先登录", 401);
        }
        return customerId;
    }

    private String stringValue(Object value) {
        if (value == null) {
            return null;
        }
        String text = value.toString().trim();
        return text.isEmpty() ? null : text;
    }
}
