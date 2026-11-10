package com.macro.mall.controller;

import com.macro.mall.common.api.CommonResult;
import com.macro.mall.entity.Coupon;
import com.macro.mall.entity.Product;
import com.macro.mall.service.CouponService;
import io.swagger.annotations.Api;
import io.swagger.annotations.ApiOperation;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.io.Serializable;
import java.util.Map;

/**
 * 券
 *
 * @author ST
 * @date 2025/06/03
 */
@RestController
@RequestMapping("/coupon")
@Api(tags = "券")
public class CouponController {
    @Autowired
    CouponService service;

    @DeleteMapping("/{id}")
    @ApiOperation("删除")
    public CommonResult remove(@PathVariable Serializable id) {
        service.invalid(id);
        return CommonResult.success();
    }

    @PostMapping("/saveOrUpd")
    @ApiOperation("修改")
    public CommonResult update(@RequestBody Coupon coupon) {
        service.verify(coupon);
        service.saveOrUpdate(coupon);
        return CommonResult.success(coupon);
    }

    @GetMapping("/{id}")
    @ApiOperation("详情")
    public CommonResult info(@PathVariable Serializable id) {
        return CommonResult.success(service.getById(id));
    }

    @GetMapping("/page")
    @ApiOperation("分页查询")
    public CommonResult page(@RequestParam Map<String, Object> params) {
        return CommonResult.success(service.page(params));
    }

    @GetMapping("/list")
    @ApiOperation("根据条件查询list")
    public CommonResult list(@RequestParam Map<String, Object> params) {
        return CommonResult.success(service.listNoPage(params));
    }

}
