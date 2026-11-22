package com.macro.mall.controller;

import com.macro.mall.bo.AdminUserDetails;
import com.macro.mall.common.api.CommonResult;
import com.macro.mall.common.exception.BusinessException;
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

import java.time.LocalDateTime;
import java.time.format.DateTimeParseException;
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
    @ApiOperation("轮牌看板：顺序、谁在忙、谁能抢单（queueKind：0服务单轮牌 1接待单轮牌，不传按服务单）")
    public CommonResult queueBoard(@RequestParam Long shopId, @RequestParam String date,
                                   @RequestParam(required = false, defaultValue = "0") Integer queueKind) {
        return CommonResult.success(service.receptionBoard(shopId, date, queueKind));
    }

    @GetMapping("/queue/issues")
    @ApiOperation("轮牌事项：值班意向/无值班可接待/超时未接待")
    public CommonResult queueIssues(@RequestParam Long shopId, @RequestParam String date) {
        return CommonResult.success(service.receptionIssues(shopId, date));
    }

    @GetMapping("/queue/positions")
    @ApiOperation("队序与今日接单数（只读，不生成队列）；队列当天没起来返回空列表")
    public CommonResult queuePositions(@RequestParam Long shopId, @RequestParam String date) {
        return CommonResult.success(service.queuePositions(shopId, date));
    }

    @GetMapping("/queue/next")
    @ApiOperation("一键安排预览：下一单该谁上（startTime 传 yyyy-MM-dd HH:mm:ss）")
    public CommonResult queueNext(@RequestParam Long shopId,
                                  @RequestParam String startTime,
                                  @RequestParam(required = false, defaultValue = "60") Integer durationMinutes,
                                  @RequestParam(required = false, defaultValue = "0") Integer queueKind) {
        LocalDateTime start = parseStartTime(startTime);
        return CommonResult.success(service.nextMassagist(shopId, DateUtil.toYYYYMMDD(start),
                start, durationMinutes, queueKind));
    }

    /** 日期控件常给到分钟（yyyy-MM-dd HH:mm）或带 T，统一补成 yyyy-MM-dd HH:mm:ss；格式不对报业务错而不是 500 */
    private LocalDateTime parseStartTime(String startTime) {
        String text = startTime == null ? "" : startTime.trim().replace('T', ' ');
        if (text.length() == 16) {
            text = text + ":00";
        }
        try {
            return DateUtil.string2DateTime(text);
        } catch (DateTimeParseException | NullPointerException e) {
            throw new BusinessException("开始时间格式不对，应为 yyyy-MM-dd HH:mm:ss");
        }
    }

    @PostMapping("/queue/duty")
    @ApiOperation("值班/下值班（queueKind：0服务单轮牌 1接待单轮牌）")
    public CommonResult duty(@RequestParam Long shopId,
                             @RequestParam String date,
                             @RequestParam Long massagistId,
                             @RequestParam Boolean onDuty,
                             @RequestParam(required = false, defaultValue = "0") Integer queueKind) {
        return CommonResult.success(service.switchDuty(shopId, date, massagistId, Boolean.TRUE.equals(onDuty), operator(), queueKind));
    }

    @PostMapping("/queue/finish")
    @ApiOperation("接待完成（下钟，回到休息区，位置不变）")
    public CommonResult finish(@RequestParam Long shopId,
                               @RequestParam String date,
                               @RequestParam Long massagistId,
                               @RequestParam(required = false, defaultValue = "0") Integer queueKind) {
        service.finishReception(shopId, date, massagistId, operator(), queueKind);
        return CommonResult.success(null);
    }

    @PostMapping("/queue/swap")
    @ApiOperation("手工调序：交换两名疗愈师的顺序（拖拽/箭头调序都走这里）")
    public CommonResult swap(@RequestParam Long shopId,
                             @RequestParam String date,
                             @RequestParam Long massagistIdA,
                             @RequestParam Long massagistIdB,
                             @RequestParam(required = false, defaultValue = "0") Integer queueKind) {
        service.swapReceptionOrder(shopId, date, massagistIdA, massagistIdB, operator(), queueKind);
        return CommonResult.success(null);
    }

    @PostMapping("/queue/join")
    @ApiOperation("调店进店：插到队头")
    public CommonResult join(@RequestParam Long shopId,
                             @RequestParam String date,
                             @RequestParam Long massagistId,
                             @RequestParam(required = false, defaultValue = "0") Integer queueKind) {
        service.joinReceptionQueue(shopId, date, massagistId, operator(), queueKind);
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
