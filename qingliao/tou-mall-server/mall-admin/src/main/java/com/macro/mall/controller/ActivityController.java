package com.macro.mall.controller;

import com.macro.mall.common.api.CommonResult;
import com.macro.mall.entity.Activity;
import com.macro.mall.entity.Bed;
import com.macro.mall.service.ActivityService;
import io.swagger.annotations.Api;
import io.swagger.annotations.ApiOperation;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * 活动表
 *
 * @author zkl
 * @date 2025/07/10
 */
@RestController
@RequestMapping("/activity")
@Api(tags = "活动表")
public class ActivityController {
    @Autowired
    ActivityService activityService;

    @GetMapping("/page")
    @ApiOperation("分页查询")
    public CommonResult page(@RequestParam Map<String, Object> params) {
        return CommonResult.success(activityService.pageWithDetail(params));
    }

    @GetMapping("/doingList")
    @ApiOperation("活动列表")
    public CommonResult doingList() {
        return CommonResult.success(activityService.doingList());
    }

    @PutMapping("/buildMiniProgramQrCode")
    @ApiOperation("生成小程序活动二维码")
    public CommonResult buildMiniProgramQrCode(@RequestParam Long id, @RequestParam String pagePath) {
        return CommonResult.success(activityService.buildMiniProgramQrCode(id, pagePath));
    }

    @PostMapping("/saveOrUpd")
    @ApiOperation("添加或者编辑")
    public CommonResult save(@RequestBody Activity activity) {
        activityService.saveOrUpd(activity);
        return CommonResult.success();
    }

    @PostMapping("/enable")
    @ApiOperation("启用")
    public CommonResult enable(@RequestParam Long id) {
        activityService.enable(id);
        return CommonResult.success();
    }

    @PostMapping("/disable")
    @ApiOperation("禁用")
    public CommonResult disable(@RequestParam Long id) {
        activityService.disable(id);
        return CommonResult.success();
    }

}
