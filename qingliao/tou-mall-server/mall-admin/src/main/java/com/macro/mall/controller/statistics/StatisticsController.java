package com.macro.mall.controller.statistics;

import com.macro.mall.common.api.CommonResult;
import com.macro.mall.common.exception.BusinessException;
import com.macro.mall.incentive.service.IncentiveAccessService;
import com.macro.mall.model.UmsAdmin;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import com.macro.mall.dto.OperatingRevenueDto;
import com.macro.mall.entity.payout;
import com.macro.mall.service.serviceStatistics.StatisticsService;
import com.macro.mall.service.serviceStatistics.PayoutService;
import io.swagger.annotations.ApiOperation;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.io.FileNotFoundException;
import java.io.IOException;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * 服务统计
 *
 * @author zkl on 2025/6/13
 */
@RestController
@RequestMapping("/statistics")
public class StatisticsController {
    @Autowired
    StatisticsService service;
    @Autowired
    PayoutService payoutService;

    @Autowired
    IncentiveAccessService access;
    @Autowired
    com.macro.mall.service.serviceStatistics.TherapistStatsService therapistStatsService;

    private Long[] durationScope(Long shopId, Long massagistId) {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null || !authentication.isAuthenticated())
            throw new BusinessException("登录状态已失效，请重新登录");
        UmsAdmin admin = access.currentAdmin();
        if (!Integer.valueOf(1).equals(admin.getStatus()))
            throw new BusinessException("当前账号已停用");
        if (!access.isGlobal() && admin.getMassagistId() != null) {
            Long self = access.currentMassagistId();
            if (massagistId != null && !massagistId.equals(self))
                throw new BusinessException("仅可查看本人的服务时长");
            // 不指定门店时按本人统计跨店历史；指定门店仍须通过授权校验。
            if (shopId != null) access.requireShopAccess(shopId);
            return new Long[]{shopId, self};
        }
        return new Long[]{access.resolveShopId(shopId), massagistId};
    }

    @GetMapping("/serviceDuration")
    @ApiOperation("疗愈师服务时长统计")
    public CommonResult serviceDuration(@RequestParam String startTime,
                                        @RequestParam String endTime,
                                        @RequestParam(required = false) Long shopId,
                                        @RequestParam(required = false) Long massagistId,
                                        @RequestParam(defaultValue = "1") Integer status,
                                        @RequestParam(defaultValue = "1") int page,
                                        @RequestParam(defaultValue = "10") int size) {
        Long[] scope = durationScope(shopId, massagistId);
        return CommonResult.success(service.serviceDurationPage(scope[0], startTime, endTime, scope[1], status, page, size));
    }

    @GetMapping("/serviceDuration/export")
    @ApiOperation("疗愈师服务时长导出")
    public void serviceDurationExport(@RequestParam String startTime,
                                      @RequestParam String endTime,
                                      @RequestParam(required = false) Long shopId,
                                      @RequestParam(required = false) Long massagistId,
                                      @RequestParam(defaultValue = "1") Integer status) {
        Long[] scope = durationScope(shopId, massagistId);
        service.serviceDurationExport(scope[0], startTime, endTime, scope[1], status);
    }

    /** 疗愈师账号只能看本人；管理员可多选疗愈师，门店按授权收敛。返回 [shopId, ids]。 */
    private Object[] therapistStatsScope(Long shopId, String massagistIds) {
        List<Long> ids = parseIds(massagistIds);
        Long[] scope = durationScope(shopId, null);
        if (scope[1] != null) {
            Long self = scope[1];
            if (ids.stream().anyMatch(id -> !id.equals(self)))
                throw new BusinessException("仅可查看本人的统计数据");
            return new Object[]{scope[0], java.util.Collections.singletonList(self)};
        }
        return new Object[]{scope[0], ids};
    }

    private static List<Long> parseIds(String raw) {
        if (raw == null || raw.trim().isEmpty()) return new java.util.ArrayList<>();
        try {
            return Arrays.stream(raw.split(",")).map(String::trim).filter(s -> !s.isEmpty())
                    .map(Long::valueOf).distinct().collect(Collectors.toList());
        } catch (NumberFormatException e) {
            throw new BusinessException("疗愈师参数不正确");
        }
    }

    @GetMapping("/therapistStats")
    @ApiOperation("疗愈师统计（订单/支付方式/男女顾客/点钟/部位）")
    @SuppressWarnings("unchecked")
    public CommonResult therapistStats(@RequestParam String startTime,
                                       @RequestParam String endTime,
                                       @RequestParam(required = false) Long shopId,
                                       @RequestParam(required = false) String massagistIds,
                                       @RequestParam(defaultValue = "1") Integer status,
                                       @RequestParam(defaultValue = "1") int page,
                                       @RequestParam(defaultValue = "10") int size) {
        Object[] scope = therapistStatsScope(shopId, massagistIds);
        return CommonResult.success(therapistStatsService.page((Long) scope[0], startTime, endTime,
                (List<Long>) scope[1], status, page, size));
    }

    @GetMapping("/therapistStats/export")
    @ApiOperation("疗愈师统计导出")
    @SuppressWarnings("unchecked")
    public void therapistStatsExport(@RequestParam String startTime,
                                     @RequestParam String endTime,
                                     @RequestParam(required = false) Long shopId,
                                     @RequestParam(required = false) String massagistIds,
                                     @RequestParam(defaultValue = "1") Integer status) {
        Object[] scope = therapistStatsScope(shopId, massagistIds);
        therapistStatsService.export((Long) scope[0], startTime, endTime, (List<Long>) scope[1], status);
    }

    @GetMapping("/operatingRevenue")
    @ApiOperation("经营流水数据")
    public CommonResult operatingRevenue(@ModelAttribute OperatingRevenueDto operatingRevenueDto) {
        return CommonResult.success(service.operatingRevenue(operatingRevenueDto));
    }

    @GetMapping("/operatingRevenue/top")
    @ApiOperation("经营流水数据")
    public CommonResult operatingRevenueTop(@ModelAttribute OperatingRevenueDto operatingRevenueDto) {
        return CommonResult.success(service.operatingRevenueTop(operatingRevenueDto));
    }

    @GetMapping("/operatingRevenue/export")
    @ApiOperation("经营流水数据导出")
    public void operatingRevenueExport(@ModelAttribute OperatingRevenueDto operatingRevenueDto) {
        service.operatingRevenueExport(operatingRevenueDto);
    }

    @GetMapping("/operatingRevenue/dailyExport")
    @ApiOperation("经营日报导出（按入账日期汇总收入）")
    public void operatingRevenueDailyExport(@ModelAttribute OperatingRevenueDto operatingRevenueDto) {
        service.operatingRevenueDailyExport(operatingRevenueDto);
    }

    @PostMapping("/addMonthlyPayout")
    @ApiOperation("添加支出")
    public CommonResult addMonthlyPayout(@RequestBody payout obj) {
        return CommonResult.success(payoutService.add(obj));
    }
    @GetMapping("/payoutpage")
    @ApiOperation("分页查询")
    public CommonResult payoutpage(@RequestParam Map<String, Object> params,int[] shopIdArrNew) {
        if(shopIdArrNew!=null){
            params.put("shopIdArrNew",shopIdArrNew);
        }
        return CommonResult.success(payoutService.pageInfo(params));
    }
    @DeleteMapping("/deletePayoutData")
    @ApiOperation("删除支出数据")
    public CommonResult deletePayoutData(@RequestParam Long id) {
        payoutService.removeById(id);
        return CommonResult.success();
    }

    @GetMapping("/topAlldata")
    @ApiOperation("获取月度看板的顶部统计数据")
    public CommonResult topAlldata(@RequestParam Map<String, Object> params,int[] shopIdArrNew) {
        if(shopIdArrNew!=null){
            params.put("shopIdArrNew",shopIdArrNew);
        }
        return CommonResult.success(payoutService.topAlldata(params));
    }

    @GetMapping("/operatingRevenueXinZi/export")
    @ApiOperation("疗愈师薪资导出")
    public void operatingRevenueXinZiExport(@RequestParam Map<String, Object> params,int[] shopIdArrNew) throws IOException {
        if(shopIdArrNew!=null){
            params.put("shopIdArrNew",shopIdArrNew);
        }
        payoutService.operatingRevenueXinZiExport(params);
    }
    @GetMapping("/operatingRevenueFuWu/export")
    @ApiOperation("疗愈师服务时长导出")
    public void operatingRevenueFuWuExport(@RequestParam Map<String, Object> params,int[] shopIdArrNew) {
        if(shopIdArrNew!=null){
            params.put("shopIdArrNew",shopIdArrNew);
        }
        service.operatingRevenueFuWuExport(params);
    }
}
