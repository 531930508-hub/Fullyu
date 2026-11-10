package com.macro.mall.controller;

import com.macro.mall.common.api.CommonResult;
import com.macro.mall.entity.Project;
import com.macro.mall.service.ProjectService;
import io.swagger.annotations.Api;
import io.swagger.annotations.ApiOperation;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.io.Serializable;
import java.util.Map;

/**
 * 项目表
 *
 * @author ST
 * @date 2025/06/04
 */
@RestController
@RequestMapping("/project")
@Api(tags = "项目")
public class ProjectController {
    @Autowired
    ProjectService service;

    @PostMapping
    @ApiOperation("添加")
    public CommonResult create(@RequestBody Project project) {
        service.verify(project);
        service.save(project);
        return CommonResult.success(project);
    }

    @DeleteMapping("/{id}")
    @ApiOperation("删除")
    public CommonResult remove(@PathVariable Serializable id) {
        return CommonResult.success(service.removeById(id));
    }

    @PutMapping
    @ApiOperation("修改")
    public CommonResult update(@RequestBody Project project) {
        service.verify(project);
        service.updateById(project);
        return CommonResult.success(project);
    }

    @GetMapping("/page")
    @ApiOperation("分页查询")
    public CommonResult page(@RequestParam Map<String, Object> params) {
        return CommonResult.success(service.page(params));
    }

    @GetMapping("/list")
    @ApiOperation("根据条件查询list")
    public CommonResult list(@RequestParam Map<String, Object> params) {
        return CommonResult.success(service.listNoPage(params));
    }

    @GetMapping("/get/receptionProjectId")
    @ApiOperation("获取接待任务")
    public CommonResult update() {
        return CommonResult.success(service.getReceptionProjectId());
    }

}
