package com.macro.mall.controller;

import com.macro.mall.bo.AdminUserDetails;
import com.macro.mall.common.api.CommonResult;
import com.macro.mall.common.exception.BusinessException;
import com.macro.mall.config.ContextMixin;
import com.macro.mall.entity.Massagist;
import com.macro.mall.enums.MassagistIdentityCode;
import com.macro.mall.service.MassagistIdentityService;
import com.macro.mall.service.MassagistService;
import io.swagger.annotations.Api;
import io.swagger.annotations.ApiOperation;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * @author zkl
 * @date 2025/05/30
 */
@RestController
@RequestMapping("/massagist")
@Api(tags = "疗愈师")
public class MassagistController implements ContextMixin {
    @Autowired
    MassagistService massagistService;
    @Autowired
    MassagistIdentityService massagistIdentityService;

    @GetMapping("/page")
    @ApiOperation("分页查询")
    public CommonResult page(@RequestParam Map<String, Object> params) {
        return CommonResult.success(massagistService.pageInfo(params));
    }

    @PostMapping("/saveOrUpd")
    @ApiOperation("添加或者编辑")
    public CommonResult saveOrUpd(@RequestBody Massagist massagist) {
        return CommonResult.success(massagistService.saveOrUpd(massagist, currentAdminId()));
    }


    @GetMapping("/list")
    @ApiOperation("疗愈师列表")
    public CommonResult list(@RequestParam Map<String, Object> params) {
        return CommonResult.success(massagistService.listNoPage(params));
    }

    @GetMapping("/identityOptions")
    @ApiOperation("可选身份（店长/内训师等）")
    public CommonResult identityOptions() {
        List<Map<String, Object>> options = new ArrayList<>();
        for (MassagistIdentityCode code : MassagistIdentityCode.values()) {
            Map<String, Object> option = new HashMap<>();
            option.put("value", code.getCode());
            option.put("label", code.getLabel());
            options.add(option);
        }
        return CommonResult.success(options);
    }

    @GetMapping("/identities")
    @ApiOperation("疗愈师当前身份编码")
    public CommonResult identities(@RequestParam Long id) {
        return CommonResult.success(massagistIdentityService.codesOf(id));
    }

    @DeleteMapping("/remove")
    @ApiOperation("删除疗愈师")
    public CommonResult remove(@RequestParam Long id) {
        if (massagistIdentityService.hasCode(id, MassagistIdentityCode.SHOP_MANAGER)) {
            throw new BusinessException("该疗愈师是门店店长，请先在疗愈师档案中取消店长身份后再删除");
        }
        massagistService.removeById(id);
        return CommonResult.success();
    }

    @PostMapping("/relatedMassagist")
    @ApiOperation("账号关联疗愈师")
    public CommonResult relatedMassagist(@RequestParam Long umsAdminId, @RequestParam Long massagistId) {
        massagistService.relatedMassagist(umsAdminId, massagistId);
        return CommonResult.success();
    }

    @GetMapping("/get/list")
    @ApiOperation("根据条件查询list")
    public CommonResult getList(@RequestParam Map<String, Object> params) {
        params.put("customerId", curCustomerId());
        return CommonResult.success(massagistService.listNoPage(params));
    }

    @GetMapping("/sortList")
    @ApiOperation("根据条件查询list")
    public CommonResult sortList(String day, @RequestParam Long shopId) {
        //显示在职和挂职技师
        //return CommonResult.success(massagistService.sortList(day, shopId));
        //只显示在职
        return CommonResult.success(massagistService.sortListNew(day, shopId));
    }

    @GetMapping("/get/page")
    @ApiOperation("分页查询")
    public CommonResult getPage(@RequestParam Map<String, Object> params) {
        params.put("customerId", curCustomerId());
        return CommonResult.success(massagistService.pageInfo(params));
    }

    @PutMapping("/rerank")
    @ApiOperation("重排序")
    public CommonResult rerank(String day, @RequestParam Long shopId, @RequestBody List<Long> sortMassagistIdList) {
        massagistService.rerank(day, shopId, sortMassagistIdList);
        return CommonResult.success();
    }

    private Long currentAdminId() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication != null && authentication.getPrincipal() instanceof AdminUserDetails) {
            return ((AdminUserDetails) authentication.getPrincipal()).getUmsAdmin().getId();
        }
        return null;
    }
    /*@GetMapping("/pageComment")
    @ApiOperation("分页查询")
    public CommonResult pageComment(@RequestParam Map<String, Object> params) {
        return CommonResult.success(massagistService.pageInfoComent(params));
    }

    //技师的所有评分记录
    @GetMapping("/pageMassagistRating")
    @ApiOperation("技师的所有评分记录")
    public CommonResult pageMassagistRating(@RequestParam Map<String, Object> params) {
        return CommonResult.success(massagistService.pageMassagistApiRating(params));
    }*/

}
