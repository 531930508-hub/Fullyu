package com.macro.mall.incentive.controller;

import com.macro.mall.common.api.CommonResult;
import com.macro.mall.incentive.dto.AssessmentSubmitRequest;
import com.macro.mall.incentive.dto.AssessmentSubmitResult;
import com.macro.mall.incentive.dto.TrainerProfileView;
import com.macro.mall.incentive.dto.TrainerProjectOption;
import com.macro.mall.incentive.dto.TrainerTherapistOption;
import com.macro.mall.incentive.service.TrainingAssessmentQueryService;
import com.macro.mall.incentive.service.TrainingAssessmentService;
import io.swagger.annotations.Api;
import io.swagger.annotations.ApiOperation;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

/**
 * 内训师手机端接口。所有“我是谁”均由登录态推导，客户端不能传入内训师 ID。
 */
@Api(tags = "内训考核")
@RestController
@RequestMapping("/incentive/trainer")
public class TrainerAssessmentController {

    @Autowired
    private TrainingAssessmentService assessmentService;

    @Autowired
    private TrainingAssessmentQueryService queryService;

    @GetMapping("/profile")
    @ApiOperation("内训师个人信息与本月提交数")
    public CommonResult<TrainerProfileView> profile() {
        return CommonResult.success(queryService.trainerProfile());
    }

    @GetMapping("/therapists")
    @ApiOperation("可考核疗愈师（在职，最多200人）")
    public CommonResult<List<TrainerTherapistOption>> therapists(
            @RequestParam(required = false) String keyword,
            @RequestParam(required = false) Long shopId) {
        return CommonResult.success(queryService.trainerTherapists(keyword, shopId));
    }

    @GetMapping("/projects")
    @ApiOperation("疗愈师待考核/已认证项目（盲考）")
    public CommonResult<List<TrainerProjectOption>> projects(@RequestParam Long massagistId) {
        return CommonResult.success(queryService.trainerProjects(massagistId));
    }

    @PostMapping("/assessments")
    @ApiOperation("提交一次考核")
    public CommonResult<AssessmentSubmitResult> submit(@RequestBody AssessmentSubmitRequest request) {
        return CommonResult.success(assessmentService.submit(request), "考核已记录");
    }

    @GetMapping("/assessments")
    @ApiOperation("我提交的考核记录")
    public CommonResult<Map<String, Object>> mine(
            @RequestParam(required = false) String month,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int size) {
        return CommonResult.success(queryService.myAssessments(
                month == null || month.trim().isEmpty()
                        ? com.macro.mall.incentive.calc.IncentiveMath.currentMonth() : month.trim(),
                page, size));
    }
}
