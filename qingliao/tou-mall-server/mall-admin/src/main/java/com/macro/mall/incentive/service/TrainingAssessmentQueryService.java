package com.macro.mall.incentive.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.macro.mall.common.exception.BusinessException;
import com.macro.mall.entity.Massagist;
import com.macro.mall.entity.Shop;
import com.macro.mall.incentive.calc.IncentiveMath;
import com.macro.mall.incentive.calc.TrainingAnalyticsCalculator;
import com.macro.mall.incentive.dto.IncentiveMassagistOption;
import com.macro.mall.incentive.dto.TrainerAssessmentView;
import com.macro.mall.incentive.dto.TrainerProfileView;
import com.macro.mall.incentive.dto.TrainerProjectOption;
import com.macro.mall.incentive.dto.TrainerTherapistOption;
import com.macro.mall.incentive.dto.TrainingAssessmentDetail;
import com.macro.mall.incentive.dto.TrainingAssessmentRow;
import com.macro.mall.incentive.dto.TrainingAssessmentSummary;
import com.macro.mall.incentive.entity.MassagistTrainingAssessment;
import com.macro.mall.incentive.entity.MassagistTrainingCert;
import com.macro.mall.incentive.entity.TrainingProjectConfig;
import com.macro.mall.incentive.mapper.MassagistTrainingAssessmentMapper;
import com.macro.mall.incentive.mapper.MassagistTrainingCertMapper;
import com.macro.mall.incentive.mapper.TrainingAssessmentQueryMapper;
import com.macro.mall.service.MassagistService;
import com.macro.mall.service.shop.ShopService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.YearMonth;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.stream.Collectors;

/**
 * 考核查询：内训师只看本人提交（完全盲考），管理端按门店范围看记录、看板与导出。
 */
@Service
public class TrainingAssessmentQueryService {

    @Autowired
    private IncentiveAccessService accessService;

    @Autowired
    private MassagistService massagistService;

    @Autowired
    private ShopService shopService;

    @Autowired
    private IncentiveConfigService configService;

    @Autowired
    private TrainingCertificationService certificationService;

    @Autowired
    private MassagistTrainingAssessmentMapper assessmentMapper;

    @Autowired
    private MassagistTrainingCertMapper certMapper;

    @Autowired
    private TrainingAssessmentQueryMapper queryMapper;

    @Autowired
    private TrainingExportService exportService;

    // ---------- 内训师 H5 ----------

    public TrainerProfileView trainerProfile() {
        Massagist trainer = accessService.requireTrainer();
        TrainerProfileView view = new TrainerProfileView();
        view.setTrainerId(trainer.getId());
        view.setTrainerName(trainer.getName());
        view.setShopId(trainer.getShopId());
        Shop shop = trainer.getShopId() == null ? null : shopService.getById(trainer.getShopId());
        view.setShopName(shop == null ? null : shop.getName());
        view.setTrainerSince(trainer.getTrainerSince() == null ? null : trainer.getTrainerSince().toString());
        LocalDate monthStart = LocalDate.now().withDayOfMonth(1);
        view.setMonthSubmissions(assessmentMapper.selectCount(
                new LambdaQueryWrapper<MassagistTrainingAssessment>()
                        .eq(MassagistTrainingAssessment::getTrainerMassagistId, trainer.getId())
                        .eq(MassagistTrainingAssessment::getVoided, 0)
                        .ge(MassagistTrainingAssessment::getAssessDate, monthStart)).intValue());
        view.setTodaySubmissions(assessmentMapper.selectCount(
                new LambdaQueryWrapper<MassagistTrainingAssessment>()
                        .eq(MassagistTrainingAssessment::getTrainerMassagistId, trainer.getId())
                        .eq(MassagistTrainingAssessment::getVoided, 0)
                        .eq(MassagistTrainingAssessment::getAssessDate, LocalDate.now())).intValue());
        return view;
    }

    public List<TrainerTherapistOption> trainerTherapists(String keyword, Long shopId) {
        accessService.requireTrainer();
        LambdaQueryWrapper<Massagist> wrapper = new LambdaQueryWrapper<Massagist>()
                .eq(Massagist::getStatus, 1)
                .orderByAsc(Massagist::getName).orderByAsc(Massagist::getId)
                .last("LIMIT 200");
        if (shopId != null) {
            wrapper.eq(Massagist::getShopId, shopId);
        }
        if (keyword != null && !keyword.trim().isEmpty()) {
            wrapper.like(Massagist::getName, keyword.trim());
        }
        List<Massagist> list = massagistService.list(wrapper);
        Map<Long, Shop> shops = shopsOf(list.stream().map(Massagist::getShopId)
                .filter(Objects::nonNull).distinct().collect(Collectors.toList()));
        List<TrainerTherapistOption> result = new ArrayList<>();
        for (Massagist massagist : list) {
            TrainerTherapistOption option = new TrainerTherapistOption();
            option.setId(massagist.getId());
            option.setName(massagist.getName());
            option.setShopId(massagist.getShopId());
            Shop shop = massagist.getShopId() == null ? null : shops.get(massagist.getShopId());
            option.setShopName(shop == null ? null : shop.getName());
            option.setStatus(massagist.getStatus());
            result.add(option);
        }
        return result;
    }

    public List<TrainerProjectOption> trainerProjects(Long massagistId) {
        accessService.requireTrainer();
        if (massagistId == null) {
            throw new BusinessException("请选择疗愈师");
        }
        if (massagistService.getById(massagistId) == null) {
            throw new BusinessException("疗愈师档案不存在");
        }
        List<TrainerProjectOption> result = new ArrayList<>();
        for (TrainingProjectConfig project : configService.bundleForMonth(IncentiveMath.currentMonth())
                .getTrainingProjects()) {
            if (!Integer.valueOf(1).equals(project.getEnabled())) {
                continue;
            }
            TrainerProjectOption option = new TrainerProjectOption();
            option.setProjectKey(project.getProjectKey());
            option.setProjectGroup(project.getProjectGroup());
            option.setProjectName(project.getProjectName());
            option.setDurationMinutes(project.getDurationMinutes());
            // 盲考：只暴露“待考核/已认证”，不返回票数、内训师名单或失败记录。
            boolean certified = certificationService.findByTargetAndProject(
                    massagistId, project.getProjectKey()) != null;
            option.setStatus(certified ? "CERTIFIED" : "PENDING");
            option.setStatusLabel(certified ? "已认证" : "待考核");
            result.add(option);
        }
        return result;
    }

    public Map<String, Object> myAssessments(String month, int page, int size) {
        Massagist trainer = accessService.requireTrainer();
        if (page < 1 || page > 100000 || size < 1 || size > 100) {
            throw new BusinessException("分页参数不正确");
        }
        LocalDate start = LocalDate.parse(IncentiveMath.normalizeMonth(month) + "-01");
        LocalDate end = start.plusMonths(1).minusDays(1);
        LambdaQueryWrapper<MassagistTrainingAssessment> wrapper =
                new LambdaQueryWrapper<MassagistTrainingAssessment>()
                        .eq(MassagistTrainingAssessment::getTrainerMassagistId, trainer.getId())
                        .between(MassagistTrainingAssessment::getAssessDate, start, end)
                        .orderByDesc(MassagistTrainingAssessment::getSubmittedAt)
                        .orderByDesc(MassagistTrainingAssessment::getId);
        long total = assessmentMapper.selectCount(wrapper).longValue();
        // 显式 LIMIT，避免依赖分页插件配置。
        wrapper.last("LIMIT " + ((page - 1) * size) + "," + size);
        List<MassagistTrainingAssessment> rows = assessmentMapper.selectList(wrapper);
        List<Long> targetIds = rows.stream().map(MassagistTrainingAssessment::getMassagistId)
                .distinct().collect(Collectors.toList());
        Map<Long, Massagist> targets = targetIds.isEmpty() ? Collections.emptyMap()
                : massagistService.listByIds(targetIds).stream()
                .collect(Collectors.toMap(Massagist::getId, e -> e));
        Map<Long, Shop> shops = shopsOf(targets.values().stream().map(Massagist::getShopId)
                .filter(Objects::nonNull).distinct().collect(Collectors.toList()));
        List<TrainerAssessmentView> list = new ArrayList<>();
        for (MassagistTrainingAssessment row : rows) {
            TrainerAssessmentView view = new TrainerAssessmentView();
            view.setId(row.getId());
            Massagist target = targets.get(row.getMassagistId());
            view.setMassagistName(target == null ? null : target.getName());
            Shop shop = target == null || target.getShopId() == null ? null : shops.get(target.getShopId());
            view.setShopName(shop == null ? null : shop.getName());
            view.setProjectName(row.getProjectName());
            view.setAssessDate(row.getAssessDate());
            view.setResult(row.getResult());
            view.setResultLabel(Integer.valueOf(1).equals(row.getResult()) ? "通过" : "不通过");
            view.setRemark(row.getRemark());
            view.setSubmittedAt(row.getSubmittedAt());
            view.setAuditStatus(Integer.valueOf(1).equals(row.getVoided()) ? "已作废" : "有效");
            list.add(view);
        }
        Map<String, Object> response = new LinkedHashMap<>();
        response.put("list", list);
        response.put("total", total);
        response.put("pageNum", page);
        response.put("pageSize", size);
        return response;
    }

    // ---------- 管理端 ----------

    /**
     * 管理端筛选用的内训师选项：只返回启用中的内训师，并限定在当前账号的门店范围内。
     */
    public List<IncentiveMassagistOption> trainerOptions() {
        accessService.requireManagement();
        List<Long> scope = accessService.authorizedShopIds();
        if (scope != null && scope.isEmpty()) {
            return new ArrayList<>();
        }
        LambdaQueryWrapper<Massagist> wrapper = new LambdaQueryWrapper<Massagist>()
                .eq(Massagist::getIsTrainer, 1)
                .eq(Massagist::getStatus, 1)
                .orderByAsc(Massagist::getName)
                .orderByAsc(Massagist::getId);
        if (scope != null) {
            wrapper.in(Massagist::getShopId, scope);
        }
        List<Massagist> list = massagistService.list(wrapper);
        Map<Long, Shop> shops = shopsOf(list.stream().map(Massagist::getShopId)
                .filter(Objects::nonNull).distinct().collect(Collectors.toList()));
        List<IncentiveMassagistOption> result = new ArrayList<>();
        for (Massagist massagist : list) {
            IncentiveMassagistOption option = new IncentiveMassagistOption();
            option.setId(massagist.getId());
            option.setName(massagist.getName());
            option.setShopId(massagist.getShopId());
            Shop shop = massagist.getShopId() == null ? null : shops.get(massagist.getShopId());
            option.setShopName(shop == null ? null : shop.getName());
            result.add(option);
        }
        return result;
    }

    public Map<String, Object> managementRecords(String month, Long shopId, Long trainerId,
                                                 Long massagistId, String projectKey,
                                                 Integer result, Integer voided, int page, int size) {
        accessService.requireManagement();
        if (shopId != null) {
            accessService.requireShopAccess(shopId);
        }
        requirePage(page, size);
        LocalDate[] range = monthRange(month);
        List<Long> scope = scopeShopIds(shopId);
        long total;
        List<TrainingAssessmentRow> list;
        if (scope != null && scope.isEmpty()) {
            total = 0;
            list = new ArrayList<>();
        } else {
            List<Long> shopIds = shopId == null ? scope : null;
            total = queryMapper.count(range[0], range[1], shopId, shopIds, trainerId,
                    massagistId, projectKey, result, voided);
            int offset = (page - 1) * size;
            list = offset >= total ? new ArrayList<>()
                    : queryMapper.page(range[0], range[1], shopId, shopIds, trainerId,
                    massagistId, projectKey, result, voided, offset, size);
        }
        Map<String, Object> response = new LinkedHashMap<>();
        response.put("list", list);
        response.put("total", total);
        response.put("pageNum", page);
        response.put("pageSize", size);
        return response;
    }

    public TrainingAssessmentSummary summary(String month, Long shopId) {
        accessService.requireManagement();
        if (shopId != null) {
            accessService.requireShopAccess(shopId);
        }
        LocalDate[] range = monthRange(month);
        List<Long> scope = scopeShopIds(shopId);
        List<TrainingAssessmentRow> rows;
        List<MassagistTrainingCert> certs;
        if (scope != null && scope.isEmpty()) {
            rows = new ArrayList<>();
            certs = new ArrayList<>();
        } else {
            List<Long> shopIds = shopId == null ? scope : null;
            rows = queryMapper.allForAnalytics(range[0], range[1], shopId, shopIds,
                    null, null, null, null, 0, TrainingExportService.MAX_ROWS);
            LambdaQueryWrapper<MassagistTrainingCert> certWrapper =
                    new LambdaQueryWrapper<MassagistTrainingCert>()
                            .between(MassagistTrainingCert::getPassedAt, range[0], range[1]);
            if (shopId != null) {
                certWrapper.eq(MassagistTrainingCert::getShopId, shopId);
            } else if (scope != null) {
                certWrapper.in(MassagistTrainingCert::getShopId, scope);
            }
            certs = certMapper.selectList(certWrapper);
        }
        return new TrainingAnalyticsCalculator().compute(
                YearMonth.from(range[0]).toString(), rows, certs);
    }

    public TrainingAssessmentDetail detail(Long massagistId, String projectKey) {
        accessService.requireManagement();
        if (massagistId == null || projectKey == null || projectKey.trim().isEmpty()) {
            throw new BusinessException("疗愈师和项目不能为空");
        }
        Massagist target = massagistService.getById(massagistId);
        if (target == null) {
            throw new BusinessException("疗愈师档案不存在");
        }
        accessService.requireShopAccess(target.getShopId());
        TrainingProjectConfig project = configService.bundleForMonth(IncentiveMath.currentMonth())
                .getTrainingProjects().stream()
                .filter(p -> projectKey.trim().equals(p.getProjectKey()))
                .findFirst().orElse(null);
        if (project == null) {
            throw new BusinessException("培训项目不存在");
        }
        TrainingAssessmentDetail detail = new TrainingAssessmentDetail();
        detail.setMassagistId(target.getId());
        detail.setMassagistName(target.getName());
        Shop shop = target.getShopId() == null ? null : shopService.getById(target.getShopId());
        detail.setShopName(shop == null ? null : shop.getName());
        detail.setProjectKey(project.getProjectKey());
        detail.setProjectName(project.getProjectName());
        MassagistTrainingCert cert =
                certificationService.findByTargetAndProject(massagistId, project.getProjectKey());
        if (cert != null) {
            detail.setCertId(cert.getId());
            detail.setPassedAt(cert.getPassedAt());
            detail.setCertSource(cert.getSource() == null ? "LEGACY" : cert.getSource());
            detail.setCertifiedAt(cert.getCertifiedAt());
            detail.setTeamSize(cert.getTeamSize() == null ? 0 : cert.getTeamSize());
        }
        List<TrainingAssessmentRow> history = queryMapper.history(
                massagistId, project.getProjectKey());
        Map<Long, Shop> trainerShops = shopsOf(history.stream()
                .map(TrainingAssessmentRow::getTrainerShopId)
                .filter(Objects::nonNull).distinct().collect(Collectors.toList()));
        for (TrainingAssessmentRow row : history) {
            TrainingAssessmentDetail.VoteView vote = new TrainingAssessmentDetail.VoteView();
            vote.setId(row.getId());
            vote.setTrainerName(row.getTrainerName());
            Shop trainerShop = row.getTrainerShopId() == null ? null
                    : trainerShops.get(row.getTrainerShopId());
            vote.setTrainerShopName(trainerShop == null ? null : trainerShop.getName());
            vote.setAssessDate(row.getAssessDate());
            vote.setResult(row.getResult());
            vote.setSubmittedAt(row.getSubmittedAt());
            vote.setVoided(row.getVoided());
            vote.setVoidReason(row.getVoidReason());
            detail.getVotes().add(vote);
        }
        return detail;
    }

    public String exportAssessments(String month, Long shopId, Long trainerId,
                                    Long massagistId, String projectKey, Integer result,
                                    Integer voided) {
        accessService.requireManagement();
        if (shopId != null) {
            accessService.requireShopAccess(shopId);
        }
        LocalDate[] range = monthRange(month);
        List<Long> scope = scopeShopIds(shopId);
        if (scope != null && scope.isEmpty()) {
            return exportService.assessmentCsv(new ArrayList<>());
        }
        List<Long> shopIds = shopId == null ? scope : null;
        List<TrainingAssessmentRow> rows = queryMapper.allForAnalytics(range[0], range[1],
                shopId, shopIds, trainerId, massagistId, projectKey, result, voided,
                TrainingExportService.MAX_ROWS);
        return exportService.assessmentCsv(rows);
    }

    public String exportCertifications(String month, Long shopId) {
        accessService.requireManagement();
        if (shopId != null) {
            accessService.requireShopAccess(shopId);
        }
        LocalDate[] range = monthRange(month);
        List<Long> scope = scopeShopIds(shopId);
        if (scope != null && scope.isEmpty()) {
            return exportService.certificationCsv(new ArrayList<>(),
                    Collections.emptyMap(), Collections.emptyMap(), Collections.emptyMap());
        }
        LambdaQueryWrapper<MassagistTrainingCert> wrapper =
                new LambdaQueryWrapper<MassagistTrainingCert>()
                        .between(MassagistTrainingCert::getPassedAt, range[0], range[1]);
        if (shopId != null) {
            wrapper.eq(MassagistTrainingCert::getShopId, shopId);
        } else if (scope != null) {
            wrapper.in(MassagistTrainingCert::getShopId, scope);
        }
        List<MassagistTrainingCert> certs = certMapper.selectList(wrapper);
        List<Long> massagistIds = certs.stream().map(MassagistTrainingCert::getMassagistId)
                .filter(Objects::nonNull).distinct().collect(Collectors.toList());
        Map<Long, Massagist> massagists = massagistIds.isEmpty() ? Collections.emptyMap()
                : massagistService.listByIds(massagistIds).stream()
                .collect(Collectors.toMap(Massagist::getId, e -> e));
        Map<Long, Shop> shops = shopsOf(massagists.values().stream().map(Massagist::getShopId)
                .filter(Objects::nonNull).distinct().collect(Collectors.toList()));
        Map<String, String> projectNames = new HashMap<>();
        for (TrainingProjectConfig project : configService.bundleForMonth(IncentiveMath.currentMonth())
                .getTrainingProjects()) {
            projectNames.put(project.getProjectKey(), project.getProjectName());
        }
        return exportService.certificationCsv(certs, massagists, shops, projectNames);
    }

    // ---------- 内部工具 ----------

    private void requirePage(int page, int size) {
        if (page < 1 || page > 100000 || size < 1 || size > 200) {
            throw new BusinessException("分页参数不正确");
        }
    }

    /**
     * 显式请求门店时只取该店；未指定时返回全局 null 或授权门店列表（空列表代表无权限）。
     */
    private List<Long> scopeShopIds(Long shopId) {
        if (shopId != null) {
            return Collections.singletonList(shopId);
        }
        return accessService.authorizedShopIds();
    }

    private LocalDate[] monthRange(String month) {
        String normalized;
        try {
            normalized = IncentiveMath.normalizeMonth(
                    month == null || month.trim().isEmpty() ? IncentiveMath.currentMonth() : month.trim());
        } catch (IllegalArgumentException e) {
            throw new BusinessException("月份格式须为 yyyy-MM");
        }
        YearMonth yearMonth = YearMonth.parse(normalized);
        return new LocalDate[]{yearMonth.atDay(1), yearMonth.atEndOfMonth()};
    }

    private Map<Long, Shop> shopsOf(List<Long> ids) {
        if (ids == null || ids.isEmpty()) {
            return Collections.emptyMap();
        }
        return shopService.listByIds(ids).stream()
                .collect(Collectors.toMap(Shop::getId, e -> e));
    }
}
