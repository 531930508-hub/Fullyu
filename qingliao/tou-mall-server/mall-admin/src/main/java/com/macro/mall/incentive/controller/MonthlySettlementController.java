package com.macro.mall.incentive.controller;

import com.macro.mall.common.api.CommonResult;
import com.macro.mall.incentive.service.MonthlySettlementService;
import com.macro.mall.annotation.ExportLog;
import io.swagger.annotations.Api;
import io.swagger.annotations.ApiOperation;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import javax.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.net.URLEncoder;
import java.util.List;
import java.util.Map;

/**
 * 月度结算单。权限边界在 MonthlySettlementService 内校验。
 */
@Api(tags = "MonthlySettlementController")
@RestController
@RequestMapping("/monthlySettlement")
public class MonthlySettlementController {

    @Autowired
    private MonthlySettlementService settlementService;

    @ApiOperation("结算概览：人数、金额、各状态数量与门店分布")
    @GetMapping("/overview")
    public CommonResult<Map<String, Object>> overview(@RequestParam(required = false) String month,
                                                      @RequestParam(required = false) Long shopId) {
        return CommonResult.success(settlementService.overview(month, shopId));
    }

    @ApiOperation("结算单分页")
    @GetMapping("/page")
    public CommonResult<Map<String, Object>> page(@RequestParam(required = false) String month,
                                                  @RequestParam(required = false) Long shopId,
                                                  @RequestParam(required = false) String status,
                                                  @RequestParam(required = false) String keyword,
                                                  @RequestParam(required = false) Integer page,
                                                  @RequestParam(required = false) Integer size) {
        return CommonResult.success(settlementService.page(month, shopId, status, keyword, page, size));
    }

    @ApiOperation("疗愈师查询本人已发布结算单")
    @GetMapping("/mine")
    public CommonResult<Map<String, Object>> mine(@RequestParam(required = false) String month) {
        return CommonResult.success(settlementService.mine(month));
    }

    @ApiOperation("结算单明细（含生成时的看板快照）")
    @GetMapping("/{id}")
    public CommonResult<Map<String, Object>> detail(@PathVariable Long id) {
        return CommonResult.success(settlementService.detail(id));
    }

    @ApiOperation("生成/刷新结算草稿（冻结后的记录不会被覆盖）")
    @PostMapping("/generate")
    public CommonResult<Map<String, Object>> generate(@RequestBody(required = false) Map<String, Object> body) {
        Map<String, Object> params = body == null ? new java.util.HashMap<>() : body;
        String month = params.get("month") == null ? null : params.get("month").toString();
        Long shopId = toLong(params.get("shopId"));
        return CommonResult.success(settlementService.generate(month, shopId));
    }

    @ApiOperation("财务确认结算单（冻结金额）")
    @PostMapping("/confirm")
    public CommonResult<Map<String, Object>> confirm(@RequestBody Map<String, Object> body) {
        return CommonResult.success(settlementService.confirm(ids(body), str(body.get("month")),
                toLong(body.get("shopId"))));
    }

    @ApiOperation("发布结算单（通知疗愈师）")
    @PostMapping("/publish")
    public CommonResult<Map<String, Object>> publish(@RequestBody Map<String, Object> body) {
        return CommonResult.success(settlementService.publish(ids(body), str(body.get("month")),
                toLong(body.get("shopId"))));
    }

    @ApiOperation("撤销确认（仅超级管理员）")
    @PostMapping("/{id}/reopen")
    public CommonResult<Boolean> reopen(@PathVariable Long id) {
        return CommonResult.success(settlementService.reopen(id));
    }

    @ApiOperation("更新财务备注")
    @PostMapping("/{id}/remark")
    public CommonResult<Boolean> remark(@PathVariable Long id, @RequestBody Map<String, Object> body) {
        return CommonResult.success(settlementService.updateRemark(id, str(body.get("remark"))));
    }

    @ApiOperation("导出结算单 CSV")
    @GetMapping("/export")
    @ExportLog(module = "incentive_monthly_settlement", value = "月度结算单")
    public void export(@RequestParam(required = false) String month,
                       @RequestParam(required = false) Long shopId,
                       @RequestParam(required = false) String status,
                       HttpServletResponse response) throws IOException {
        String selected = month == null ? com.macro.mall.incentive.calc.IncentiveMath.currentMonth()
                : com.macro.mall.incentive.calc.IncentiveMath.normalizeMonth(month);
        String csv = settlementService.exportCsv(selected, shopId, status);
        String filename = URLEncoder.encode("月度结算单-" + selected + ".csv", "UTF-8")
                .replace("+", "%20");
        response.setCharacterEncoding("UTF-8");
        response.setContentType("text/csv;charset=UTF-8");
        response.setHeader("Content-Disposition", "attachment; filename*=UTF-8''" + filename);
        response.getWriter().write(csv);
        response.getWriter().flush();
    }

    @SuppressWarnings("unchecked")
    private List<Long> ids(Map<String, Object> body) {
        Object raw = body.get("ids");
        if (!(raw instanceof List)) {
            return null;
        }
        List<Long> ids = new java.util.ArrayList<>();
        for (Object item : (List<Object>) raw) {
            Long id = toLong(item);
            if (id != null) {
                ids.add(id);
            }
        }
        return ids;
    }

    private Long toLong(Object value) {
        if (value == null || value.toString().trim().isEmpty()) {
            return null;
        }
        try {
            return Long.valueOf(value.toString().trim());
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private String str(Object value) {
        return value == null ? null : value.toString();
    }
}