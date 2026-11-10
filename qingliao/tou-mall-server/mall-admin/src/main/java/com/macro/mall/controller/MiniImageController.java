package com.macro.mall.controller;

import com.github.pagehelper.util.StringUtil;
import com.macro.mall.common.api.CommonResult;
import com.macro.mall.consts.NormalConst;
import com.macro.mall.entity.MiniImage;
import com.macro.mall.service.MiniImageService;
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
@RequestMapping("/miniImage")
@Api(tags = "小程序图片")
public class MiniImageController {
    @Autowired
    MiniImageService miniImageService;


    @GetMapping("/page")
    @ApiOperation("分页查询")
    public CommonResult page(@RequestParam Map<String, Object> params) {
        return CommonResult.success(miniImageService.page(params));
    }

    @PostMapping("/saveOrUpd")
    @ApiOperation("添加或者编辑")
    public CommonResult saveOrUpd(@RequestBody MiniImage miniImage) {
        String url = miniImage.getUrl();
        if (StringUtil.isNotEmpty(url)) {
            String fileName = NormalConst.getFileName(url);
            if (fileName != miniImage.getName()) {
                miniImage.setName(fileName);
            }
        } else {
            miniImage.setName("");
        }
        return CommonResult.success(miniImageService.saveOrUpdate(miniImage));
    }


    @GetMapping("/list")
    @ApiOperation("图片列表")
    public CommonResult list(@RequestParam Map<String, Object> params) {
        return CommonResult.success(miniImageService.listNoPage(params));
    }

    @GetMapping("/splashScreenImageList")
    @ApiOperation("开屏图片列表")
    public CommonResult splashScreenImageList() {
        return CommonResult.success(miniImageService.splashScreenImageList());
    }

    @GetMapping("/popupImageList")
    @ApiOperation("小程序首页弹框图")
    public CommonResult popupImageList() {
        return CommonResult.success(miniImageService.popupImageList());
    }

    @GetMapping("/bannerList")
    @ApiOperation("banner图片列表")
    public CommonResult bannerList() {
        return CommonResult.success(miniImageService.bannerList());
    }

    @GetMapping("/couponImageList")
    @ApiOperation("送券图列表")
    public CommonResult CouponImageList() {
        return CommonResult.success(miniImageService.couponImageList());
    }

    @DeleteMapping("/remove")
    @ApiOperation("删除图片")
    public CommonResult remove(@RequestParam Long id) {
        miniImageService.removeById(id);
        return CommonResult.success();
    }

    @GetMapping("/appointmentImageList")
    @ApiOperation("此方法用于小程序审核时，隐藏选项卡功能，不可修改")
    public CommonResult appointmentImageList() {
        return CommonResult.success(miniImageService.appointmentImageList());
    }
    @GetMapping("/appointmentImageListNew")
    @ApiOperation("此方法用于小程序审核时，隐藏选项卡功能，不可修改")
    public CommonResult appointmentImageListNew() {
        return CommonResult.success(miniImageService.appointmentImageList());
    }

}
