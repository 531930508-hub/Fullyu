package com.macro.mall.controller;

import com.macro.mall.common.api.CommonResult;
import com.macro.mall.entity.ProductTag;
import com.macro.mall.service.ProductTagService;
import io.swagger.annotations.Api;
import io.swagger.annotations.ApiOperation;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * 商品标签
 *
 * @author
 * @date 2025/07/14
 */
@RestController
@RequestMapping("/productTag")
@Api(tags = "商品标签")
public class ProductTagController {
    @Autowired
    ProductTagService service;

    @GetMapping("/list")
    @ApiOperation("根据条件查询list")
    public CommonResult list(@RequestParam Map<String, Object> params) {
        return CommonResult.success(service.listNoPage(params));
    }

    @PostMapping
    @ApiOperation("添加商品标签")
    public CommonResult create(@RequestBody ProductTag entity) {
        service.checkAndSave(entity);
        return CommonResult.success(entity);
    }

    @DeleteMapping("/{id}")
    @ApiOperation("删除商品标签")
    public CommonResult remove(@PathVariable Long id) {
        return CommonResult.success(service.removeById(id));
    }
}
