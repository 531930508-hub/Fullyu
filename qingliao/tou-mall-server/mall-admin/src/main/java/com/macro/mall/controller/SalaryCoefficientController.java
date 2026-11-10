package com.macro.mall.controller;

import com.macro.mall.common.api.CommonResult;
import com.macro.mall.service.SalaryCoefficientService;
import io.swagger.annotations.ApiOperation;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;
import io.swagger.annotations.Api;
import org.springframework.web.multipart.MultipartFile;

/**
 * @author
 * @date 2025/09/23
 */
@RestController
@RequestMapping("/salaryCoefficient")
@Api(tags = "")
public class SalaryCoefficientController {
    @Autowired
    SalaryCoefficientService salaryCoefficientService;

    @GetMapping("/AddSalaryCoefficient")
    public CommonResult AddSalaryCoefficient(@RequestParam double onevalue,@RequestParam double twovalue,
                                             double threevalue,double fourvalue,double samllvalue) {

        salaryCoefficientService.updatedata(onevalue,twovalue,threevalue,fourvalue,samllvalue);
        return CommonResult.success();
    }
    @GetMapping("/GetSalaryCoefficient")
    public CommonResult GetSalaryCoefficient() {
        return CommonResult.success(salaryCoefficientService.list());
    }
}
