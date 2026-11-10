package com.macro.mall.controller;

import com.macro.mall.common.api.CommonResult;
import com.macro.mall.config.ContextMixin;
import com.macro.mall.dto.UpdateCustomerCouponDto;
import com.macro.mall.service.CustomerCouponService;
import io.swagger.annotations.Api;
import io.swagger.annotations.ApiOperation;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * 客户券
 *
 * @author ST
 * @date 2025/06/03
 */
@RestController
@RequestMapping("/customerCoupon")
@Api(tags = "客户券")
public class CustomerCouponController implements ContextMixin {
    @Autowired
    CustomerCouponService service;

    @GetMapping("/page")
    @ApiOperation("分页查询")
    public CommonResult page(@RequestParam Map<String, Object> params) {
        return CommonResult.success(service.pageInfo(params));
    }

    @GetMapping("/getCouponCount")
    @ApiOperation("获取代金券数量")
    public CommonResult getCouponCount() {
        return CommonResult.success(service.getCouponCountByCustomerId(curCustomerId()));
    }

    @GetMapping("/get/page")
    @ApiOperation("分页查询")
    public CommonResult getPage(@RequestParam Map<String, Object> params) {
        params.put("customerId", curCustomerId());
        params.put("effective", true);
        return CommonResult.success(service.pageInfo(params));
    }

    @PostMapping("/update/batch")
    @ApiOperation("批量更改客户券状态")
    public CommonResult updateBatch(@RequestBody UpdateCustomerCouponDto updateCustomerCouponDto) {
        service.updateBatch(updateCustomerCouponDto);
        return CommonResult.success();
    }

    @PutMapping("/invalid")
    @ApiOperation("回收券")
    public CommonResult invalid(@RequestParam Long id) {
        service.invalid(id);
        return CommonResult.success();
    }

    @GetMapping("/getUserAllCouponCount")
    @ApiOperation("小程序获取用户所有代金券数量")
    public CommonResult getUserAllCouponCount() {
        return CommonResult.success(service.getUserAllCouponCount(curCustomerId()));
    }
    @GetMapping("/getUserLastoneCoupon")
    @ApiOperation("小程序获取用户最后一次的会员卡")
    public CommonResult getUserLastoneCoupon() {
        return CommonResult.success(service.getUserLastoneCoupon(curCustomerId()));
    }

    @GetMapping("/getGroupCard")
    @ApiOperation("小程序获取用户的组合卷")
    public CommonResult getGroupCard(Integer state) {
        return CommonResult.success(service.getGroupCard(curCustomerId(),state));
    }
    @GetMapping("/getShareGroupCard")
    @ApiOperation("小程序获取用户分享的组合卷")
    public CommonResult getShareGroupCard(Integer state) {
        return CommonResult.success(service.getShareGroupCard(curCustomerId(),state));
    }

    @GetMapping("/getSingleCard")
    @ApiOperation("小程序获取用户单张卷")
    public CommonResult getSingleCard(Integer state) {
        return CommonResult.success(service.getSingleCard(curCustomerId(),state));
    }

    @GetMapping("/getListData")
    @ApiOperation("获取要合并的数据")
    public CommonResult getListData(@RequestParam Map<String, Object> params) {
        return CommonResult.success(service.gethebingData(params));
    }
/**
 * 获取合并后的Excel列表数据
 * @param params 包含查询参数的Map集合，用于传递查询条件
 * @return 返回一个CommonResult对象，其中包含合并后的Excel数据
 */
    @GetMapping("/getListDataExce")
    @ApiOperation("执行合并数据")
    public CommonResult getListDataExce(@RequestParam Map<String, Object> params) {
        return CommonResult.success(service.gethebingExct(params));
    }







}
