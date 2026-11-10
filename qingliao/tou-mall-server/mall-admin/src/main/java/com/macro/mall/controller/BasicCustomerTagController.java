package com.macro.mall.controller;

import com.macro.mall.common.api.CommonResult;
import com.macro.mall.entity.BasicCustomerTag;
import com.macro.mall.service.BasicCustomerTagService;
import io.swagger.annotations.Api;
import io.swagger.annotations.ApiOperation;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * 基础客户标签
 * @author ST
 * @date 2025/07/10
 */
@RestController
@RequestMapping("/basicCustomerTag")
@Api(tags = "基础客户标签")
public class BasicCustomerTagController {
    @Autowired
    BasicCustomerTagService basicCustomerTagService;

    @GetMapping("/all")
    @ApiOperation("获取所有的tree形数据基础客户标签")
    public CommonResult all() {
        return CommonResult.success(basicCustomerTagService.all());
    }

    @PostMapping("/saveOrUpdate")
    @ApiOperation("更新或保存基础客户标签")
    public CommonResult saveOrUpdate(@RequestBody BasicCustomerTag basicCustomerTag) {
        return CommonResult.success(basicCustomerTagService.saveOrUpdate(basicCustomerTag));
    }

    @DeleteMapping("/removeByIds")
    @ApiOperation("批量删除基础客户标签")
    public CommonResult removeByIds(@RequestBody List<Long> ids) {
        basicCustomerTagService.removeAfterCheck(ids);
        return CommonResult.success();
    }

    @GetMapping("/list")
    @ApiOperation("获取所有的数据基础客户标签")
    public CommonResult list() {
        return CommonResult.success(basicCustomerTagService.list());
    }


    @PostMapping("/listByTitles")
    @ApiOperation("按标题查询分类基础客户标签")
    public CommonResult communicationAndQA(@RequestBody List<String> titles) {
        return CommonResult.success(basicCustomerTagService.listByTitles(titles));
    }

    @GetMapping("/listChildById")
    @ApiOperation("获取分类下所有子分类基础客户标签")
    public CommonResult listChildByIds(@RequestParam Long categoryId) {
        return CommonResult.success(basicCustomerTagService.listByParentId(categoryId));
    }

    @GetMapping("/listChildByTitle")
    @ApiOperation("获取分类下所有子分类基础客户标签")
    public CommonResult listChildByTitle(@RequestParam String categoryTitle) {
        return CommonResult.success(basicCustomerTagService.listChildByTitle(categoryTitle));
    }
}
