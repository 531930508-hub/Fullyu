package com.macro.mall.controller.shop;

import cn.hutool.core.date.DateTime;
import com.macro.mall.bo.AdminUserDetails;
import com.macro.mall.common.api.CommonResult;
import com.macro.mall.config.ContextMixin;
import com.macro.mall.entity.Shop;
import com.macro.mall.service.shop.ShopService;
import io.swagger.annotations.Api;
import io.swagger.annotations.ApiOperation;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * @author zkl
 * @date 2025/05/30
 */
@RestController
@RequestMapping("/shop")
@Api(tags = "")
public class ShopController implements ContextMixin {
    @Autowired
    ShopService shopService;

    @GetMapping("/page")
    @ApiOperation("分页查询")
    public CommonResult page(@RequestParam Map<String, Object> params) {
        return CommonResult.success(shopService.page(params));
    }

    @PostMapping("/saveOrUpd")
    @ApiOperation("添加或者编辑")
    public CommonResult saveOrUpd(@RequestBody Shop shop) {
        shopService.saveOrUpd(shop);
        return CommonResult.success();
    }


    @GetMapping("/list")
    @ApiOperation("门店列表")
    public CommonResult list(@RequestParam Map<String, Object> params) {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        AdminUserDetails user = (AdminUserDetails) authentication.getPrincipal();
        return CommonResult.success(shopService.listNoPageNew(params,user.getUmsAdmin().getShopIdArr()));
    }
    @GetMapping("/listAll")
    @ApiOperation("门店列表")
    public CommonResult listAll(@RequestParam Map<String, Object> params) {
        return CommonResult.success(shopService.listNoPage(params));
    }

    @DeleteMapping("/remove")
    @ApiOperation("删除门店及其房间和床位")
    public CommonResult remove(@RequestParam Long id) {
        shopService.remove(id);
        return CommonResult.success();
    }
    @ApiOperation("获取会员所属的门店")
    @RequestMapping(value = "/getShopListByShopIdArr", method = RequestMethod.POST)
    public CommonResult getShopListByShopIdArr(@RequestParam("shopIdArr") String shopIdArr) {
        return CommonResult.success(shopService.getShopListByShopIdArr(shopIdArr));
    }

    @GetMapping("/timeList")
    @ApiOperation("门店时间列表")
    public CommonResult timeList(@RequestParam(required = false, defaultValue = "1") Long id) {
        return CommonResult.success(shopService.timeList(id));
    }
    @GetMapping("/timeShopEnd")
    @ApiOperation("门店时间列表")
    public CommonResult timeShopEnd(@RequestParam(required = false, defaultValue = "1") Long id) {
        return CommonResult.success(shopService.timeShopEnd(id));
    }


    @GetMapping("/receptionData")
    @ApiOperation("根据门店拿到接待排班信息")
    public CommonResult receptionData(@RequestParam(required = false, defaultValue = "1") Long id) {
        return CommonResult.success(shopService.receptionData(id));
    }

    @GetMapping("/get/list")
    @ApiOperation("门店列表")
    public CommonResult getList(@RequestParam Map<String, Object> params) {
        Long customerId = null;
        try {
            customerId = curCustomerId();
        } catch (Exception e) {
            e.printStackTrace();
        }
        return CommonResult.success(shopService.listByLastOrder(params, customerId));
    }

    @GetMapping("/minilist")
    @ApiOperation("小程序根据坐标获取门店列表")
    public CommonResult minilist(@RequestParam Map<String, Object> params) {
        //listNoPage
        long customerId=curCustomerId()==null?0:curCustomerId();
        params.put("customerId",customerId);
        return CommonResult.success(shopService.getMiniShopList(params));
    }
    @GetMapping("/miniCityAndStreet")
    @ApiOperation("小程序根据坐标获取城市和街道")
    public CommonResult miniCityAndStreet(@RequestParam Map<String, Object> params) {
        //listNoPage
        return CommonResult.success(shopService.getMiniCityAndStreet(params));
    }
    @GetMapping("/miniShopCollect")
    @ApiOperation("小程序获取用户收藏的门店列表")
    public CommonResult miniShopCollect() {
        long customerId=curCustomerId();
        return CommonResult.success(shopService.getMiniShopCollect(customerId));
    }
    @GetMapping("/miniInsterOrDelete")
    @ApiOperation("小程序用户添加收藏或删除")
    public CommonResult miniInsterOrDelete(long shopId) {
        long customerId=curCustomerId();
        shopService.miniInsterOrDelete(shopId,customerId);
        return CommonResult.success();
    }

    @GetMapping("/getSingleByShopId")
    @ApiOperation("小程序用户获取单个门店信息")
    public CommonResult getSingleByShopId(long shopId) {
        return CommonResult.success(shopService.getById(shopId));
    }



}
