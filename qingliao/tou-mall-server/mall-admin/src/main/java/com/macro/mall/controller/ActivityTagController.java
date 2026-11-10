package com.macro.mall.controller;

import com.macro.mall.common.api.CommonResult;
import com.macro.mall.entity.ActivityTag;
import com.macro.mall.service.ActivityTagService;
import io.swagger.annotations.Api;
import io.swagger.annotations.ApiOperation;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * 活动标签
 *
 * @author
 * @date 2025/07/14
 */
@RestController
@RequestMapping("/activityTag")
@Api(tags = "活动标签")
public class ActivityTagController {
    @Autowired
    ActivityTagService service;

    @GetMapping("/list")
    @ApiOperation("根据条件查询list")
    public CommonResult list(@RequestParam Map<String, Object> params) {
        return CommonResult.success(service.listNoPage(params));
    }

    @PostMapping
    @ApiOperation("添加活动标签")
    public CommonResult create(@RequestBody ActivityTag entity) {
        service.checkAndSave(entity);
        return CommonResult.success(entity);
    }

    @DeleteMapping("/{id}")
    @ApiOperation("删除活动标签")
    public CommonResult remove(@PathVariable Long id) {
        return CommonResult.success(service.removeById(id));
    }

}
