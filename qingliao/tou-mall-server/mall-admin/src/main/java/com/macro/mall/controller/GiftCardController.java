package com.macro.mall.controller;

import com.macro.mall.common.api.CommonResult;
import com.macro.mall.config.ContextMixin;
import com.macro.mall.entity.GiftCard;
import com.macro.mall.service.GiftCardService;
import io.swagger.annotations.Api;
import io.swagger.annotations.ApiOperation;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;
import java.util.Map;

/**
 * 礼品卡表
 *
 * @author zkl
 * @date 2025/07/10
 */
@RestController
@RequestMapping("/giftCard")
@Api(tags = "礼品卡表")
public class GiftCardController implements ContextMixin {
    @Autowired
    GiftCardService giftCardService;

    @GetMapping("/page")
    @ApiOperation("分页查询")
    public CommonResult page(@RequestParam Map<String, Object> params) {
        return CommonResult.success(giftCardService.pageInfo(params));
    }

    @PostMapping("/batch/save")
    @ApiOperation("批量添加")
    public CommonResult batchSave(@RequestBody GiftCard giftCard) {
        giftCardService.batchAdd(giftCard);
        return CommonResult.success();
    }

    @PostMapping("/import/batch/save")
    @ApiOperation("excel批量添加")
    public CommonResult importBatchSave(@RequestPart("file") MultipartFile file, @RequestParam Long shopId, @RequestParam Long createUser) {
        giftCardService.importBatchSave(file, shopId, createUser);
        return CommonResult.success();
    }

    @PostMapping("/distribution")
    @ApiOperation("发放礼品卡")
    public CommonResult distribution(@RequestParam Long id, @RequestParam Long distributionUser) {
        giftCardService.distribution(id, distributionUser);
        return CommonResult.success();
    }

    @PostMapping("/batch/distribution")
    @ApiOperation("批量发放礼品卡")
    public CommonResult batchDistribution(@RequestParam Long distributionUser, @RequestBody List<Long> ids) {
        giftCardService.batchDistribution(ids, distributionUser);
        return CommonResult.success();
    }

    @PostMapping("/failure")
    @ApiOperation("失效礼品卡")
    public CommonResult failure(@RequestParam Long id) {
        giftCardService.failure(id);
        return CommonResult.success();
    }

    @PostMapping("/batch/failure")
    @ApiOperation("失效礼品卡")
    public CommonResult batchFailure(@RequestBody List<Long> ids) {
        giftCardService.batchFailure(ids);
        return CommonResult.success();
    }


    @PostMapping("/receive")
    @ApiOperation("客户通过卡密接收礼品卡")
    public CommonResult receive(@RequestParam String password) {
        Long customerId = curCustomerId();
        return CommonResult.success(giftCardService.receive(customerId, password));
    }

    @GetMapping("/prepaid/page")
    @ApiOperation("礼品卡预收台账")
    public CommonResult prepaidPage(@RequestParam Map<String, Object> params) {
        return CommonResult.success(giftCardService.prepaidPage(params));
    }

    @GetMapping("/export")
    @ApiOperation("导出")
    public void export(@RequestParam Map<String, Object> params) {
        giftCardService.export(params);
    }
}
