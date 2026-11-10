package com.macro.mall.controller;

import com.macro.mall.common.api.CommonResult;
import com.macro.mall.config.ContextMixin;
import com.macro.mall.entity.GiveGift;
import com.macro.mall.service.GiveGiftService;
import io.swagger.annotations.Api;
import io.swagger.annotations.ApiOperation;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * 赠送礼物
 *
 * @author ST
 * @date 2025/06/03
 */
@RestController
@RequestMapping("/giveGift")
@Api(tags = "赠送礼物")
public class GiveGiftController implements ContextMixin {
    @Autowired
    GiveGiftService service;

    @GetMapping("/page")
    @ApiOperation("分页查询")
    public CommonResult page(@RequestParam Map<String, Object> params) {
        return CommonResult.success(service.pageInfo(params));
    }

    @GetMapping("/{id}")
    @ApiOperation("查看券包")
    public CommonResult info(@PathVariable Long id) {
        return CommonResult.success(service.getGiftInfo(id));
    }

    @PostMapping("/give/coupon")
    @ApiOperation("赠送的客户券")
    public CommonResult createGift(@RequestBody List<Long> customerCouponIdList) {
        service.createGift(customerCouponIdList, curCustomerId());
        return CommonResult.success();
    }

    @PutMapping("/get/give/coupon")
    @ApiOperation("领取赠送的券包")
    public CommonResult getGiveGiftList(@RequestParam Long id,
                                        @RequestParam(required = false) String shareCode) {
        Long customerId = curCustomerId();
        service.getGiveGiftList(id, customerId, shareCode);
        return CommonResult.success();
    }

    @PostMapping("/send")
    @ApiOperation("赠送的券包")
    public CommonResult sendGiveGift(@RequestBody GiveGift form) {
        Long customerId = curCustomerId();
        form.setCustomerId(customerId);
        service.sendGift(form);
        return CommonResult.success(form.getShareCode());
    }

    @PutMapping("/revocation")
    @ApiOperation("撤回")
    public CommonResult revocation(Long id) {
        service.revocation(id);
        return CommonResult.success();
    }

    @GetMapping("/shareCode")
    public CommonResult getShareCode(Long id) {
        String shareCode = service.genShareCode(id, curCustomerId());
        return CommonResult.success(shareCode);
    }

    @GetMapping("/get/page")
    @ApiOperation("分页查询")
    public CommonResult getPage(@RequestParam Map<String, Object> params) {
        params.put("customerId", curCustomerId());
        return CommonResult.success(service.pageInfo(params));
    }

    @GetMapping("/info")
    @ApiOperation("查看券包")
    public CommonResult getGiftInfo(@RequestParam Long id) {
        return CommonResult.success(service.getGiftInfo(id));
    }

    @GetMapping("/infoNew")
    @ApiOperation("查看券包")
    public CommonResult getGiftInfoNew(@RequestParam Long id) {
        return CommonResult.success(service.getGiftInfoNew(id));
    }
}
