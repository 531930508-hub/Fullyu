package com.macro.mall.controller;

import com.macro.mall.common.api.CommonResult;
import com.macro.mall.entity.Adjust;
import com.macro.mall.service.AdjustService;
import io.swagger.annotations.Api;
import io.swagger.annotations.ApiOperation;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 调整疗愈师服务时长表
 *
 * @author zkl
 * @date 2025/06/13
 */
@RestController
@RequestMapping("/adjust")
@Api(tags = "调整疗愈师服务时长表")
public class AdjustController {
    @Autowired
    AdjustService adjustService;

    @PostMapping("/saveOrUpd")
    @ApiOperation("添加或者编辑")
    public CommonResult saveOrUpd(@RequestBody Adjust adjust) {
        return CommonResult.success(adjustService.saveOrUpdate(adjust));
    }
}
