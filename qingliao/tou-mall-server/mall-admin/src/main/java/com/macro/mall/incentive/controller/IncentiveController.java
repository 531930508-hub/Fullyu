package com.macro.mall.incentive.controller;

import com.macro.mall.common.api.CommonResult;
import com.macro.mall.incentive.calc.IncentiveMath;
import com.macro.mall.incentive.dto.IncentiveConfigBundle;
import com.macro.mall.incentive.dto.IncentiveConfigSaveRequest;
import com.macro.mall.incentive.dto.IncentiveDashboard;
import com.macro.mall.incentive.dto.IncentiveMassagistOption;
import com.macro.mall.incentive.dto.IncentiveShopOption;
import com.macro.mall.incentive.dto.ShopTargetSaveRequest;
import com.macro.mall.incentive.dto.ShopTargetView;
import com.macro.mall.incentive.dto.ReasonRequest;
import com.macro.mall.incentive.dto.TrainingAssessmentDetail;
import com.macro.mall.incentive.dto.TrainingAssessmentSummary;
import com.macro.mall.incentive.dto.TrainingCertSaveRequest;
import com.macro.mall.incentive.dto.TrainingManualCertRequest;
import com.macro.mall.incentive.dto.TrainingRecordView;
import com.macro.mall.incentive.entity.IncentiveConfig;
import com.macro.mall.incentive.entity.MassagistTrainingCert;
import com.macro.mall.incentive.entity.ShopIncentiveTarget;
import com.macro.mall.incentive.model.IncentiveBoard;
import com.macro.mall.incentive.service.IncentiveAccessService;
import com.macro.mall.incentive.service.IncentiveConfigService;
import com.macro.mall.incentive.service.IncentiveDataService;
import io.swagger.annotations.Api;
import io.swagger.annotations.ApiOperation;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.DeleteMapping;
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
 * 激励看板接口。权限边界在 IncentiveAccessService 中执行，前端传参不作为授权依据。
 */
@RestController
@RequestMapping("/incentive")
@Api(tags = "疗愈师接单奖励看板")
public class IncentiveController {

    @Autowired
    private IncentiveDataService dataService;

    @Autowired
    private IncentiveConfigService configService;

    @Autowired
    private IncentiveAccessService accessService;

    @GetMapping("/mine")
    @ApiOperation("疗愈师本人按月查看接单奖励与培训进度")
    public CommonResult<IncentiveBoard> mine(@RequestParam(required = false) String month) {
        return CommonResult.success(dataService.currentTherapistBoard(monthOrDefault(month)));
    }

    @GetMapping("/dashboard")
    @ApiOperation("管理端经营看板：门店目标、汇总与疗愈师明细")
    public CommonResult<IncentiveDashboard> dashboard(@RequestParam(required = false) String month,
                                                      @RequestParam(required = false) Long shopId,
                                                      @RequestParam(required = false) Integer status,
                                                      @RequestParam(required = false) Integer page,
                                                      @RequestParam(required = false) Integer size) {
        return CommonResult.success(dataService.dashboard(monthOrDefault(month), shopId, status, page, size));
    }

    @GetMapping("/board")
    @ApiOperation("管理端疗愈师明细")
    public CommonResult<IncentiveBoard> board(@RequestParam Long massagistId,
                                              @RequestParam(required = false) String month,
                                              @RequestParam(required = false) Long shopId) {
        return CommonResult.success(dataService.adminBoard(
                massagistId, monthOrDefault(month), shopId));
    }

    @GetMapping("/shops")
    @ApiOperation("当前账号可查看的门店选项")
    public CommonResult<List<IncentiveShopOption>> shops() {
        return CommonResult.success(dataService.shopOptions());
    }

    @GetMapping("/massagists")
    @ApiOperation("当前账号可查看的疗愈师选项")
    public CommonResult<List<IncentiveMassagistOption>> massagists(
            @RequestParam(required = false) Long shopId) {
        return CommonResult.success(dataService.massagistOptions(shopId));
    }

    @GetMapping("/training-records")
    @ApiOperation("分页查询疗愈师培训项目认证与进度")
    public CommonResult<Map<String, Object>> trainingRecords(
            @RequestParam(required = false) String month,
            @RequestParam(required = false) Long shopId,
            @RequestParam(defaultValue = "1") Integer status,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(required = false) String keyword) {
        return CommonResult.success(dataService.trainingRecordsPage(
                monthOrDefault(month), shopId, status, page, size, keyword));
    }

    @PostMapping("/training-records")
    @ApiOperation("登记或修改疗愈师项目考核日（仅运营/财务）")
    public CommonResult<MassagistTrainingCert> saveTrainingRecord(
            @RequestBody TrainingCertSaveRequest request) {
        return CommonResult.success(dataService.saveCert(request), "考核记录已保存");
    }

    @DeleteMapping("/training-records/{certId}")
    @ApiOperation("撤销疗愈师项目考核记录（仅运营/财务）")
    public CommonResult<Void> deleteTrainingRecord(@PathVariable Long certId) {
        dataService.deleteCert(certId);
        return CommonResult.success(null, "考核记录已撤销");
    }

    @PostMapping("/training-records/manual")
    @ApiOperation("超管人工特批认证")
    public CommonResult<MassagistTrainingCert> manualCert(
            @RequestBody TrainingManualCertRequest request) {
        return CommonResult.success(dataService.manualCert(request), "人工特批已生效");
    }

    @PostMapping("/training-records/{certId}/revoke")
    @ApiOperation("超管撤销认证")
    public CommonResult<Void> revokeCert(@PathVariable Long certId,
                                         @RequestBody ReasonRequest request) {
        dataService.revokeCert(certId, request == null ? null : request.getReason());
        return CommonResult.success(null, "认证已撤销");
    }

    @GetMapping("/training-assessments")
    @ApiOperation("内训考核记录（管理端）")
    public CommonResult<Map<String, Object>> assessments(
            @RequestParam(required = false) String month,
            @RequestParam(required = false) Long shopId,
            @RequestParam(required = false) Long trainerId,
            @RequestParam(required = false) Long massagistId,
            @RequestParam(required = false) String projectKey,
            @RequestParam(required = false) Integer result,
            @RequestParam(required = false) Integer voided,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int size) {
        return CommonResult.success(dataService.assessmentRecords(monthOrDefault(month), shopId,
                trainerId, massagistId, projectKey, result, voided, page, size));
    }

    @GetMapping("/training-assessments/trainers")
    @ApiOperation("内训师筛选选项（管理端）")
    public CommonResult<List<IncentiveMassagistOption>> assessmentTrainers() {
        return CommonResult.success(dataService.trainerOptions());
    }

    @GetMapping("/training-assessments/summary")
    @ApiOperation("内训考核看板（管理端）")
    public CommonResult<TrainingAssessmentSummary> assessmentSummary(
            @RequestParam(required = false) String month,
            @RequestParam(required = false) Long shopId) {
        return CommonResult.success(dataService.assessmentSummary(monthOrDefault(month), shopId));
    }

    @GetMapping("/training-assessments/detail")
    @ApiOperation("某疗愈师某项目的考核历史（含作废票）")
    public CommonResult<TrainingAssessmentDetail> assessmentDetail(
            @RequestParam Long massagistId,
            @RequestParam String projectKey) {
        return CommonResult.success(dataService.assessmentDetail(massagistId, projectKey));
    }

    @PostMapping("/training-assessments/{id}/void")
    @ApiOperation("作废单条考核记录（超管）")
    public CommonResult<Void> voidAssessment(@PathVariable Long id,
                                             @RequestBody ReasonRequest request) {
        dataService.voidAssessment(id, request == null ? null : request.getReason());
        return CommonResult.success(null, "考核记录已作废");
    }

    @GetMapping("/training-assessments/export")
    @ApiOperation("导出内训考核明细 CSV")
    public void exportAssessments(@RequestParam(required = false) String month,
                                  @RequestParam(required = false) Long shopId,
                                  @RequestParam(required = false) Long trainerId,
                                  @RequestParam(required = false) Long massagistId,
                                  @RequestParam(required = false) String projectKey,
                                  @RequestParam(required = false) Integer result,
                                  @RequestParam(required = false) Integer voided,
                                  HttpServletResponse response) throws IOException {
        String selected = monthOrDefault(month);
        String csv = dataService.exportAssessments(selected, shopId, trainerId,
                massagistId, projectKey, result, voided);
        writeCsv(response, "内训考核明细-" + selected + ".csv", csv);
    }

    @GetMapping("/training-certifications/export")
    @ApiOperation("导出培训认证台账 CSV")
    public void exportCertifications(@RequestParam(required = false) String month,
                                     @RequestParam(required = false) Long shopId,
                                     HttpServletResponse response) throws IOException {
        String selected = monthOrDefault(month);
        String csv = dataService.exportCertifications(selected, shopId);
        writeCsv(response, "培训认证台账-" + selected + ".csv", csv);
    }

    @GetMapping("/config")
    @ApiOperation("某个月份生效的激励参数快照")
    public CommonResult<IncentiveConfigBundle> config(
            @RequestParam(required = false) String month) {
        return CommonResult.success(dataService.config(monthOrDefault(month)));
    }

    @GetMapping("/config/history")
    @ApiOperation("激励参数历史版本")
    public CommonResult<List<IncentiveConfig>> configHistory() {
        return CommonResult.success(configService.history());
    }

    @PostMapping("/config")
    @ApiOperation("保存激励参数并生成新版本（仅运营/财务）")
    public CommonResult<IncentiveConfig> saveConfig(
            @RequestBody IncentiveConfigSaveRequest request) {
        accessService.requireGlobal();
        return CommonResult.success(
                configService.save(request, accessService.currentAdmin().getId()),
                "参数已保存，历史月份不受影响");
    }

    @GetMapping("/shop-targets")
    @ApiOperation("查询门店月度业绩目标与店长提点")
    public CommonResult<List<ShopTargetView>> shopTargets(
            @RequestParam(required = false) String month,
            @RequestParam(required = false) Long shopId) {
        return CommonResult.success(dataService.targets(monthOrDefault(month), shopId));
    }

    @PostMapping("/shop-targets")
    @ApiOperation("保存门店月度业绩目标与店长提点（仅运营/财务）")
    public CommonResult<ShopIncentiveTarget> saveShopTarget(
            @RequestBody ShopTargetSaveRequest request) {
        return CommonResult.success(dataService.saveTarget(request), "门店目标已保存");
    }

    @GetMapping("/export")
    @ApiOperation("导出按月接单奖励明细 CSV（仅运营/财务）")
    public void export(@RequestParam(required = false) String month,
                       @RequestParam(required = false) Long shopId,
                       @RequestParam(defaultValue = "1") Integer status,
                       HttpServletResponse response) throws IOException {
        String selected = monthOrDefault(month);
        String csv = dataService.exportCsv(selected, shopId, status);
        String filename = URLEncoder.encode("接单奖励明细-" + selected + ".csv", "UTF-8")
                .replace("+", "%20");
        response.setCharacterEncoding("UTF-8");
        response.setContentType("text/csv;charset=UTF-8");
        response.setHeader("Content-Disposition", "attachment; filename*=UTF-8''" + filename);
        response.getWriter().write(csv);
        response.getWriter().flush();
    }

    private void writeCsv(HttpServletResponse response, String filename, String csv) throws IOException {
        String encoded = URLEncoder.encode(filename, "UTF-8").replace("+", "%20");
        response.setCharacterEncoding("UTF-8");
        response.setContentType("text/csv;charset=UTF-8");
        response.setHeader("Content-Disposition", "attachment; filename*=UTF-8''" + encoded);
        response.getWriter().write(csv);
        response.getWriter().flush();
    }

    private String monthOrDefault(String month) {
        return month == null || month.trim().isEmpty()
                ? IncentiveMath.currentMonth() : month.trim();
    }
}
