package com.macro.mall.controller;

import com.macro.mall.common.api.CommonResult;
import com.macro.mall.service.RoundScheduleService;
import io.swagger.annotations.Api;
import io.swagger.annotations.ApiOperation;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * 排班轮次
 *
 * @author
 * @date 2025/08/13
 */
@RestController
@RequestMapping("/roundSchedule")
@Api(tags = "排班轮次")
public class RoundScheduleController {
    @Autowired
    RoundScheduleService service;

    @GetMapping("/page")
    @ApiOperation("分页查询")
    public CommonResult page(@RequestParam Map<String, Object> params) {
        return CommonResult.success(service.pageInfo(params));
    }

    @GetMapping("/get/massagist/round")
    @ApiOperation("查询技师当前轮次")
    public CommonResult getMassagistRound(@RequestParam Long shopId, @RequestParam String date) {
        return CommonResult.success(service.getMassagistRound(shopId, date));
    }
}
