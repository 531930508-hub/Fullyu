package com.macro.mall.controller;

import com.macro.mall.common.api.CommonResult;
import com.macro.mall.config.ContextMixin;
import com.macro.mall.dto.MassagistRateDto;
import com.macro.mall.entity.MassagistRate;
import com.macro.mall.service.MassagistRateService;
import io.swagger.annotations.Api;
import io.swagger.annotations.ApiOperation;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.io.Serializable;
import java.util.Map;

/**
 * 疗愈师评分
 *
 * @author ST
 * @date 2025/06/04
 */
@RestController
@RequestMapping("/massagistRate")
@Api(tags = "疗愈师评分")
public class MassagistRateController implements ContextMixin {
    @Autowired
    MassagistRateService service;

    @PostMapping("/create/batch")
    @ApiOperation("添加")
    public CommonResult create(@RequestBody MassagistRateDto massagistRateDto) {
        service.createRateList(massagistRateDto,curCustomerId());
        return CommonResult.success(massagistRateDto);
    }

    @DeleteMapping("/{id}")
    @ApiOperation("删除")
    public CommonResult remove(@PathVariable Serializable id) {
        return CommonResult.success(service.removeById(id));
    }

    @PutMapping
    @ApiOperation("修改")
    public CommonResult update(@RequestBody MassagistRate massagistRate) {
        service.updateById(massagistRate);
        return CommonResult.success(massagistRate);
    }

    @GetMapping("/pageComment")
    @ApiOperation("分页查询")
    public CommonResult pageComment(@RequestParam Map<String, Object> params) {
        return CommonResult.success(service.pageInfoComent(params));
    }

    //技师的所有评分记录
    @GetMapping("/pageMassagistRating")
    @ApiOperation("技师的所有评分记录")
    public CommonResult pageMassagistRating(@RequestParam Map<String, Object> params) {
        return CommonResult.success(service.pageMassagistApiRating(params));
    }

}
