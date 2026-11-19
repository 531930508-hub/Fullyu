package com.macro.mall.controller;

import com.macro.mall.bo.AdminUserDetails;
import com.macro.mall.common.api.CommonResult;
import com.macro.mall.service.RoundScheduleService;
import com.macro.mall.utils.DateUtil;
import io.swagger.annotations.Api;
import io.swagger.annotations.ApiOperation;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * 排班轮次
 *
 * @author
 * @date 2025/08/13
 */
@RestController
@RequestMapping("/roundSchedule")
@Api(tags = "排班轮次")
public class RoundScheduleController {
    @Autowired
    RoundScheduleService service;

    @GetMapping("/page")
    @ApiOperation("分页查询")
    public CommonResult page(@RequestParam Map<String, Object> params) {
        return CommonResult.success(service.pageInfo(params));
    }

    @GetMapping("/get/massagist/round")
    @ApiOperation("查询技师当前轮次")
    public CommonResult getMassagistRound(@RequestParam Long shopId, @RequestParam String date) {
        return CommonResult.success(service.getMassagistRound(shopId, date));
    }

    // ==================== 轮牌（接待排队） ====================

    @GetMapping("/queue/board")
    @ApiOperation("轮牌看板：顺序、谁在忙、谁能抢单")
    public CommonResult queueBoard(@RequestParam Long shopId, @RequestParam String date) {
        return CommonResult.success(service.receptionBoard(shopId, date));
    }

    @GetMapping("/queue/issues")
    @ApiOperation("轮牌事项：值班意向/无值班可接待/超时未接待")
    public CommonResult queueIssues(@RequestParam Long shopId, @RequestParam String date) {
        return CommonResult.success(service.receptionIssues(shopId, date));
    }

    @GetMapping("/queue/next")
    @ApiOperation("一键安排预览：下一单该谁上")
    public CommonResult queueNext(@RequestParam Long shopId,
                                  @RequestParam String startTime,
                                  @RequestParam(required = false, defaultValue = "60") Integer durationMinutes) {
        return CommonResult.success(service.nextMassagist(shopId, DateUtil.toYYYYMMDD(DateUtil.string2DateTime(startTime)),
                DateUtil.string2DateTime(startTime), durationMinutes));
    }

    @PostMapping("/queue/duty")
    @ApiOperation("值班/下值班")
    public CommonResult duty(@RequestParam Long shopId,
                             @RequestParam String date,
                             @RequestParam Long massagistId,
                             @RequestParam Boolean onDuty) {
        return CommonResult.success(service.switchDuty(shopId, date, massagistId, Boolean.TRUE.equals(onDuty), operator()));
    }

    @PostMapping("/queue/finish")
    @ApiOperation("接待完成（下钟，回到休息区，位置不变）")
    public CommonResult finish(@RequestParam Long shopId,
                               @RequestParam String date,
                               @RequestParam Long massagistId) {
        service.finishReception(shopId, date, massagistId, operator());
        return CommonResult.success(null);
    }

    @PostMapping("/queue/join")
    @ApiOperation("调店进店：插到队头")
    public CommonResult join(@RequestParam Long shopId,
                             @RequestParam String date,
                             @RequestParam Long massagistId) {
        service.joinReceptionQueue(shopId, date, massagistId, operator());
        return CommonResult.success(null);
    }

    @PostMapping("/queue/grab")
    @ApiOperation("抢单：对方超过接待确认时限还没接待，把这单接过来")
    public CommonResult grab(@RequestParam Long shopId,
                             @RequestParam String date,
                             @RequestParam Long massagistId,
                             @RequestParam Long detailId) {
        service.grab(shopId, date, massagistId, detailId, operator());
        return CommonResult.success(null);
    }

    private String operator() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication != null && authentication.getPrincipal() instanceof AdminUserDetails) {
            // getUsername 里已经处理了后台账号和顾客两种身份
            return ((AdminUserDetails) authentication.getPrincipal()).getUsername();
        }
        return null;
    }
}
