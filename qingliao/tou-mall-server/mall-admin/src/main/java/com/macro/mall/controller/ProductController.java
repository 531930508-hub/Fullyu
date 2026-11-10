package com.macro.mall.controller;

import com.macro.mall.common.api.CommonResult;
import com.macro.mall.config.ContextMixin;
import com.macro.mall.entity.Product;
import com.macro.mall.service.ProductService;
import io.swagger.annotations.Api;
import io.swagger.annotations.ApiOperation;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.io.Serializable;
import java.util.Map;

/**
 * 产品
 *
 * @author ST
 * @date 2025/06/03
 */
@RestController
@RequestMapping("/product")
@Api(tags = "产品")
public class ProductController implements ContextMixin {
    @Autowired
    ProductService service;

    @PostMapping
    @ApiOperation("添加")
    public CommonResult create(@RequestBody Product product) {
        service.verify(product);
        service.save(product);
        return CommonResult.success(product);
    }

    @DeleteMapping("/{id}")
    @ApiOperation("删除")
    public CommonResult remove(@PathVariable Serializable id) {
        return CommonResult.success(service.removeById(id));
    }

    @PutMapping
    @ApiOperation("修改")
    public CommonResult update(@RequestBody Product product) {
        service.verify(product);
        service.updateById(product);
        return CommonResult.success(product);
    }

    @GetMapping("/{id}")
    @ApiOperation("详情")
    public CommonResult info(@PathVariable Serializable id) {
        return CommonResult.success(service.getById(id));
    }

    @GetMapping("/page")
    @ApiOperation("分页查询")
    public CommonResult page(@RequestParam Map<String, Object> params) {
        return CommonResult.success(service.pageInfo(params));
    }

    @GetMapping("/list")
    @ApiOperation("根据条件查询list")
    public CommonResult list(@RequestParam Map<String, Object> params) {
        return CommonResult.success(service.listInfo(params));
    }

    @GetMapping("/get/list")
    @ApiOperation("根据条件查询list")
    public CommonResult getList(@RequestParam Map<String, Object> params) {
        //未登录正常显示
        try {
            params.put("customerId", curCustomerId());
        } catch (Exception e) {
            e.printStackTrace();
        }
        return CommonResult.success(service.miniListInfo(params));
    }
    @ApiOperation("后台获取卡卷list")
    @RequestMapping(value = "/getListNotParams", method = RequestMethod.GET)
    public CommonResult getListNotParams() {
        return CommonResult.success(service.getListNotParams());
    }

    @GetMapping("/productList")
    @ApiOperation("小程序获取项目对应的产品列表")
    public CommonResult productList() {
        return CommonResult.success(service.productList());
    }

}
