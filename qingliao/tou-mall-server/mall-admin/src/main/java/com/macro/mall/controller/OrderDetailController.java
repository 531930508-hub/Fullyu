package com.macro.mall.controller;

import com.alibaba.fastjson2.JSONObject;
import com.macro.mall.aspect.FullLog;
import com.macro.mall.common.api.CommonResult;
import com.macro.mall.dto.SchedulingParam;
import com.macro.mall.service.OrderDetailService;
import io.swagger.annotations.Api;
import io.swagger.annotations.ApiOperation;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

import java.io.Serializable;
import java.util.Map;

/**
 * 订单详情
 *
 * @author ST
 * @date 2025/05/30
 */
@RestController
@RequestMapping("/orderDetail")
@Api(tags = "订单详情")
public class OrderDetailController {
    @Autowired
    OrderDetailService service;

    @GetMapping("/list")
    @ApiOperation("根据条件查询list")
    public CommonResult list(@RequestParam Map<String, Object> params) {
        return CommonResult.success(service.listNoPage(params));
    }

    @DeleteMapping("/{id}")
    @ApiOperation("删除")
    public CommonResult remove(@PathVariable Serializable id) {
        return CommonResult.success(service.removeById(id));
    }

    @GetMapping("/finish")
    @ApiOperation("完成服务")
    public CommonResult finish(@RequestParam Long id) {
        service.finish(id);
        return CommonResult.success();
    }

    @PutMapping("/doing/service")
    @ApiOperation("确认到店")
    public CommonResult doingService(@RequestParam Long id) {
        service.doingService(id);
        return CommonResult.success();
    }
    @PutMapping("/doing/exceArganizeMassagist")
    @ApiOperation("一键分配疗愈师")
    public CommonResult exceArganizeMassagist(@RequestParam Long id) {
        service.exceArganizeMassagist(id);
        return CommonResult.success();
    }

    @ApiOperation("排班，按（床位/疗愈师）分组")
    @GetMapping("/schedulingMap")
    public CommonResult schedulingMap(@ModelAttribute @Validated SchedulingParam schedulingParam) {
        return CommonResult.success(service.schedulingMap(schedulingParam));
    }

    @ApiOperation("排班详情")
    @GetMapping("/info")
    public CommonResult info(@RequestParam Long id) {
        return CommonResult.success(service.info(id));
    }

    @PostMapping("/update/order/detail")
    @ApiOperation("拖到修改订单")
    @FullLog(saveLogField = "oldData")
    public CommonResult updateOrderDetail(@RequestParam Long id, @RequestParam(required = false) Long bedId,
                                          @RequestParam(required = false) Long massagistId, @RequestParam String startTime) {
        JSONObject jsonObject = new JSONObject();
        jsonObject.put("oldData", service.updateDetail(id, bedId, massagistId, startTime));
        return CommonResult.success(jsonObject);
    }

    @PutMapping("/comment")
    @ApiOperation("修改订单明细备注")
    public CommonResult updateComment(@RequestParam Long id, @RequestParam String comment) {
        service.updateComment(id, comment);
        return CommonResult.success(id);
    }
}
