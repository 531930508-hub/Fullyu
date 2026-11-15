package com.macro.mall.controller.shop;

import cn.hutool.core.date.DateTime;
import com.macro.mall.bo.AdminUserDetails;
import com.macro.mall.common.api.CommonResult;
import com.macro.mall.common.exception.BusinessException;
import com.macro.mall.config.ContextMixin;
import com.macro.mall.entity.Shop;
import com.macro.mall.model.UmsAdmin;
import com.macro.mall.model.UmsRole;
import com.macro.mall.service.UmsAdminService;
import com.macro.mall.service.shop.ShopService;
import io.swagger.annotations.Api;
import io.swagger.annotations.ApiOperation;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

import java.util.List;
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
    @Autowired
    private UmsAdminService umsAdminService;

    /** 门店管理（列表/新增编辑/删除）仅超级管理员可用，与前端页签可见性保持一致 */
    private void requireSuperAdmin() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || !auth.isAuthenticated() || !(auth.getPrincipal() instanceof AdminUserDetails)) {
            throw new BusinessException("请先登录后台");
        }
        UmsAdmin admin = ((AdminUserDetails) auth.getPrincipal()).getUmsAdmin();
        if (admin == null || admin.getId() == null) {
            throw new BusinessException("请先登录后台");
        }
        List<UmsRole> roles = umsAdminService.getRoleList(admin.getId());
        boolean superAdmin = roles != null && roles.stream()
                .anyMatch(role -> role.getName() != null && "超级管理员".equals(role.getName().trim()));
        if (!superAdmin) {
            throw new BusinessException("仅超级管理员可管理门店");
        }
    }

    @GetMapping("/page")
    @ApiOperation("分页查询")
    public CommonResult page(@RequestParam Map<String, Object> params) {
        requireSuperAdmin();
        return CommonResult.success(shopService.page(params));
    }

    @PostMapping("/saveOrUpd")
    @ApiOperation("添加或者编辑")
    public CommonResult saveOrUpd(@RequestBody Shop shop) {
        requireSuperAdmin();
        shopService.saveOrUpd(shop);
        return CommonResult.success();
    }


    @GetMapping("/list")
    @ApiOperation("门店列表（当前账号授权范围内）")
    public CommonResult list(@RequestParam Map<String, Object> params) {
        return CommonResult.success(shopService.listAuthorized(params));
    }

    @GetMapping("/authorized")
    @ApiOperation("当前账号可查看的门店（前端门店下拉唯一数据源）")
    public CommonResult authorized(@RequestParam Map<String, Object> params) {
        return CommonResult.success(shopService.listAuthorized(params));
    }

    @GetMapping("/listAll")
    @ApiOperation("门店列表（受限账号仅返回授权门店）")
    public CommonResult listAll(@RequestParam Map<String, Object> params) {
        return CommonResult.success(shopService.listAuthorized(params));
    }

    @DeleteMapping("/remove")
    @ApiOperation("删除门店及其房间和床位")
    public CommonResult remove(@RequestParam Long id) {
        requireSuperAdmin();
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
