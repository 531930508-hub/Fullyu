package com.macro.mall.controller;

import com.macro.mall.common.api.CommonResult;
import com.macro.mall.entity.OrderDiscount;
import com.macro.mall.service.OrderDiscountService;
import io.swagger.annotations.Api;
import io.swagger.annotations.ApiOperation;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * 订单折扣
 *
 * @author
 * @date 2025/07/23
 */
@RestController
@RequestMapping("/orderDiscount")
@Api(tags = "订单折扣")
public class OrderDiscountController {
    @Autowired
    OrderDiscountService orderDiscountService;

    @GetMapping("/page")
    @ApiOperation("分页查询")
    public CommonResult page(@RequestParam Map<String, Object> params) {
        return CommonResult.success(orderDiscountService.page(params));
    }

    @PostMapping("/saveOrUpd")
    @ApiOperation("添加或者编辑")
    public CommonResult saveOrUpd(@RequestBody OrderDiscount orderDiscount) {
        return CommonResult.success(orderDiscountService.saveOrUpd(orderDiscount));
    }

    @GetMapping("/list")
    @ApiOperation("折扣列表")
    public CommonResult list(@RequestParam Map<String, Object> params) {
        return CommonResult.success(orderDiscountService.listNoPage(params));
    }

    @DeleteMapping("/remove")
    @ApiOperation("删除折扣")
    public CommonResult remove(@RequestParam Long id) {
        orderDiscountService.removeById(id);
        return CommonResult.success();
    }

}
