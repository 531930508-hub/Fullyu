package com.macro.mall.controller;

import cn.hutool.core.date.DateTime;
import com.macro.mall.common.api.CommonResult;
import com.macro.mall.entity.SalaryOtherAmount;
import com.macro.mall.service.SalaryOtherAmountService;
import com.macro.mall.utils.DateUtil;
import io.swagger.annotations.Api;
import io.swagger.annotations.ApiOperation;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.Map;

/**
 * 计薪其他调整
 *
 * @author
 * @date 2025/10/09
 */
@RestController
@RequestMapping("/salaryOtherAmount")
@Api(tags = "计薪其他调整")
public class SalaryOtherAmountController {
    @Autowired
    SalaryOtherAmountService salaryOtherAmountService;

    @PostMapping("/import/add")
    @ApiOperation("导入")
    public CommonResult importAdd(@RequestPart("file") MultipartFile file, @RequestParam Long createUser) {
        salaryOtherAmountService.importAdd(file, createUser);
        return CommonResult.success();
    }
    @GetMapping("/getSalaryOtherAmount")
    @ApiOperation("分页查询")
    public CommonResult getSalaryOtherAmount(@RequestParam Map<String, Object> params) {
        return CommonResult.success(salaryOtherAmountService.pageInfo(params));
    }
    //
    @DeleteMapping("/deleteSalaryOtherAmount")
    @ApiOperation("删除支出数据")
    public CommonResult deleteSalaryOtherAmount(@RequestParam Long id) {
        salaryOtherAmountService.removeById(id);
        return CommonResult.success();
    }
    @PostMapping("/saveSalaryOtherAmount")
    public CommonResult saveSalaryOtherAmount(@RequestBody SalaryOtherAmount salaryOtherAmount) {
        salaryOtherAmount.setCreateTime(DateTime.now().toLocalDateTime());
        salaryOtherAmountService.save(salaryOtherAmount);
        return CommonResult.success();
    }
}
