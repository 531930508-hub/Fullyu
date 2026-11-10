package com.macro.mall.controller;

import com.macro.mall.common.api.CommonResult;
import com.macro.mall.entity.CustomerTag;
import com.macro.mall.service.CustomerTagService;
import io.swagger.annotations.Api;
import io.swagger.annotations.ApiOperation;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * 客户标签
 *
 * @author ST
 * @date 2025/07/10
 */
@RestController
@RequestMapping("/customerTag")
@Api(tags = "客户标签")
public class CustomerTagController {
    @Autowired
    CustomerTagService service;

    @GetMapping("/list")
    @ApiOperation("根据条件查询list")
    public CommonResult list(@RequestParam Map<String, Object> params) {
        return CommonResult.success(service.listNoPage(params));
    }

    @PostMapping
    @ApiOperation("添加客户标签")
    public CommonResult create(@RequestBody CustomerTag entity) {
        service.checkAndSave(entity);
        return CommonResult.success(entity);
    }

    @DeleteMapping("/{id}")
    @ApiOperation("删除客户标签")
    public CommonResult remove(@PathVariable Long id) {
        return CommonResult.success(service.removeById(id));
    }

}
