package com.macro.mall.controller.shop;

import cn.hutool.core.date.DateTime;
import com.macro.mall.common.api.CommonResult;
import com.macro.mall.entity.Bed;
import com.macro.mall.service.shop.BedService;
import io.swagger.annotations.Api;
import io.swagger.annotations.ApiOperation;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * @author zkl
 * @date 2025/05/30
 */
@RestController
@RequestMapping("/bed")
@Api(tags = "")
public class BedController {
    @Autowired
    BedService bedService;

    @GetMapping("/page")
    @ApiOperation("分页查询")
    public CommonResult page(@RequestParam Map<String, Object> params) {
        return CommonResult.success(bedService.page(params));
    }

    @PostMapping("/saveOrUpd")
    @ApiOperation("添加或者编辑")
    public CommonResult saveOrUpd(@RequestBody Bed bed) {
        return CommonResult.success(bedService.addOrChange(bed));
    }

    @DeleteMapping("/remove")
    @ApiOperation("删除床位")
    public CommonResult remove(@RequestParam Long id) {
        bedService.remove(id);
        return CommonResult.success();
    }

    @GetMapping("/maxBedCount")
    @ApiOperation("获取门店干湿区最大床位数")
    public CommonResult maxBedCount(Long shopId, Integer type) {
        return CommonResult.success(bedService.findMaxBedCount(shopId, type));
    }

    @GetMapping("/maxPeopleCount")
    @ApiOperation("小程序获取门店最大接单人数")
    public CommonResult maxPeopleCount(Long shopId, Integer type, String date) {
        return CommonResult.success(bedService.maxMaxPeopleCount(shopId, type,date));
    }
}
