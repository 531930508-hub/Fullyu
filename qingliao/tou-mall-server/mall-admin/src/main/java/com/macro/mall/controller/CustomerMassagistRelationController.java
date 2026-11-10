package com.macro.mall.controller;

import com.macro.mall.common.api.CommonResult;
import com.macro.mall.config.ContextMixin;
import com.macro.mall.entity.CustomerMassagistRelation;
import com.macro.mall.service.CustomerMassagistRelationService;
import io.swagger.annotations.Api;
import io.swagger.annotations.ApiOperation;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.io.Serializable;
import java.util.Map;

/**
 * 客户疗愈师关联表
 *
 * @author ST
 * @date 2025/06/12
 */
@RestController
@RequestMapping("/customerMassagistRelation")
@Api(tags = "客户疗愈师")
public class CustomerMassagistRelationController implements ContextMixin {
    @Autowired
    CustomerMassagistRelationService service;

    @GetMapping("/list")
    @ApiOperation("根据条件查询list")
    public CommonResult list(@RequestParam Map<String, Object> params) {
        return CommonResult.success(service.listNoPage(params));
    }

    @PostMapping
    @ApiOperation("添加")
    public CommonResult create(@RequestBody CustomerMassagistRelation customerMassagistRelation) {
        service.create(customerMassagistRelation);
        return CommonResult.success(customerMassagistRelation);
    }

    @DeleteMapping("/{id}")
    @ApiOperation("删除")
    public CommonResult remove(@PathVariable Serializable id) {
        return CommonResult.success(service.removeById(id));
    }

    @GetMapping("/page")
    @ApiOperation("分页查询")
    public CommonResult page(@RequestParam Map<String, Object> params) {
        return CommonResult.success(service.pageInfo(params));
    }

    @PostMapping("/create/relation")
    @ApiOperation("添加")
    public CommonResult create(@RequestParam Long massagistId) {
        CustomerMassagistRelation customerMassagistRelation = new CustomerMassagistRelation();
        customerMassagistRelation.setMassagistId(massagistId);
        customerMassagistRelation.setCustomerId(curCustomerId());
        service.create(customerMassagistRelation);
        return CommonResult.success(customerMassagistRelation);
    }

    @GetMapping("/get/list")
    @ApiOperation("根据条件查询list")
    public CommonResult getList(@RequestParam Map<String, Object> params) {
        params.put("customerId", curCustomerId());
        return CommonResult.success(service.listNoPage(params));
    }

    @GetMapping("/get/page")
    @ApiOperation("分页查询")
    public CommonResult getPage(@RequestParam Map<String, Object> params) {
        params.put("customerId", curCustomerId());
        return CommonResult.success(service.pageInfo(params));
    }


}
