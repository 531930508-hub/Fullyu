package com.macro.mall.incentive.service;

import com.alibaba.fastjson2.JSONObject;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.macro.mall.common.exception.BusinessException;
import com.macro.mall.dto.OperatingRevenueDto;
import com.macro.mall.entity.Adjust;
import com.macro.mall.entity.Massagist;
import com.macro.mall.entity.SalaryOtherAmount;
import com.macro.mall.entity.SalaryRecord;
import com.macro.mall.entity.Shop;
import com.macro.mall.enums.AdjustStatus;
import com.macro.mall.incentive.calc.IncentiveCalculator;
import com.macro.mall.incentive.calc.IncentiveMath;
import com.macro.mall.incentive.calc.RepurchaseBatchCalculator;
import com.macro.mall.incentive.calc.SettlementCalculator;
import com.macro.mall.incentive.calc.TrainingCalculator;
import com.macro.mall.incentive.dto.IncentiveConfigBundle;
import com.macro.mall.incentive.dto.IncentiveDashboard;
import com.macro.mall.incentive.dto.IncentiveMassagistOption;
import com.macro.mall.incentive.dto.IncentiveShopOption;
import com.macro.mall.incentive.dto.ShopTargetSaveRequest;
import com.macro.mall.incentive.dto.ShopTargetView;
import com.macro.mall.incentive.dto.TrainingAssessmentDetail;
import com.macro.mall.incentive.dto.TrainingAssessmentSummary;
import com.macro.mall.incentive.dto.TrainingCertSaveRequest;
import com.macro.mall.incentive.dto.TrainingManualCertRequest;
import com.macro.mall.incentive.dto.TrainingRecordView;
import com.macro.mall.incentive.entity.MassagistTrainingAssessment;
import com.macro.mall.incentive.entity.MassagistTrainingCert;
import com.macro.mall.incentive.entity.MassagistTrainingCertLog;
import com.macro.mall.incentive.entity.ShopIncentiveTarget;
import com.macro.mall.incentive.entity.TrainingProjectConfig;
import com.macro.mall.incentive.mapper.IncentiveQueryMapper;
import com.macro.mall.incentive.mapper.MassagistTrainingAssessmentMapper;
import com.macro.mall.incentive.mapper.MassagistTrainingCertLogMapper;
import com.macro.mall.incentive.mapper.MassagistTrainingCertMapper;
import com.macro.mall.incentive.mapper.ShopIncentiveTargetMapper;
import com.macro.mall.incentive.mapper.TrainingRecordPageMapper;
import com.macro.mall.incentive.model.AchievementSummary;
import com.macro.mall.incentive.model.BaseIncentive;
import com.macro.mall.incentive.model.CoefficientBand;
import com.macro.mall.incentive.model.CustomerVisit;
import com.macro.mall.incentive.model.IncentiveBoard;
import com.macro.mall.incentive.model.ManagerIncentive;
import com.macro.mall.incentive.model.ManagerShopReward;
import com.macro.mall.incentive.model.RepurchaseMetrics;
import com.macro.mall.incentive.model.ServiceDetailRow;
import com.macro.mall.incentive.model.SettlementResult;
import com.macro.mall.incentive.model.TrainingOrder;
import com.macro.mall.incentive.model.TrainingProgress;
import com.macro.mall.incentive.model.TrainingProjectRule;
import com.macro.mall.incentive.model.TrainingSection;
import com.macro.mall.model.UmsAdmin;
import com.macro.mall.service.AdjustService;
import com.macro.mall.service.MassagistService;
import com.macro.mall.service.OrderService;
import com.macro.mall.service.SalaryOtherAmountService;
import com.macro.mall.service.SalaryRecordService;
import com.macro.mall.service.shop.ShopService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.CollectionUtils;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.YearMonth;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * 激励看板的数据装配层。计算口径全部委托给 calc 包，本类只负责取数、归属和权限边界。
 */
@Service
public class IncentiveDataService {

    private static final LocalDate HISTORY_START = LocalDate.of(2015, 1, 1);

    private final IncentiveCalculator incentiveCalculator = new IncentiveCalculator();
    private final TrainingCalculator trainingCalculator = new TrainingCalculator();
    private final RepurchaseBatchCalculator repurchaseCalculator = new RepurchaseBatchCalculator();
    private final SettlementCalculator settlementCalculator = new SettlementCalculator();

    @Autowired
    private IncentiveConfigService configService;

    @Autowired
    private IncentiveAccessService accessService;

    @Autowired
    private IncentiveQueryMapper queryMapper;

    @Autowired
    private TrainingRecordPageMapper trainingPageMapper;

    @Autowired
    private MassagistTrainingCertMapper certMapper;

    @Autowired
    private MassagistTrainingAssessmentMapper assessmentMapper;

    @Autowired
    private MassagistTrainingCertLogMapper certLogMapper;

    @Autowired
    private TrainingCertificationService certificationService;

    @Autowired
    private TrainingAssessmentQueryService queryService;

    @Autowired
    private TrainingTeamCertProperties teamCertProperties;

    @Autowired
    private ShopIncentiveTargetMapper targetMapper;

    @Autowired
    private MassagistService massagistService;

    @Autowired
    private ShopService shopService;

    @Autowired
    private AdjustService adjustService;

    @Autowired
    private SalaryOtherAmountService salaryOtherAmountService;

    @Autowired
    private SalaryRecordService salaryRecordService;

    @Autowired
    private OrderService orderService;

    public IncentiveDashboard dashboard(String month, Long requestedShopId, Integer status, Integer page, Integer size) {
        int pageNo = page == null ? 1 : page;
        int pageSize = size == null ? 20 : size;
        if (pageNo < 1 || pageNo > 100000 || pageSize < 1 || pageSize > 500) {
            throw new BusinessException("分页参数不正确");
        }
        IncentiveDashboard dashboard = fullDashboard(month, requestedShopId, status);
        // 汇总及排序仍覆盖全部筛选结果；HTTP 明细返回所选页。
        List<IncentiveBoard> allBoards = dashboard.getTherapists();
        int fromIndex = (int) Math.min((long) (pageNo - 1) * pageSize, allBoards.size());
        int toIndex = Math.min(fromIndex + pageSize, allBoards.size());
        dashboard.setTherapists(new ArrayList<>(allBoards.subList(fromIndex, toIndex)));
        return dashboard;
    }

    private IncentiveDashboard fullDashboard(String month, Long requestedShopId, Integer status) {
        Integer selectedStatus = normalizeStatus(status);
        String selected = IncentiveMath.normalizeMonth(month);
        requireNotFuture(selected);
        Long shopId = accessService.resolveShopId(requestedShopId);
        if (shopId != null) {
            accessService.requireShopAccess(shopId);
        }
        List<Long> scopeShopIds = shopId == null
                ? accessService.authorizedShopIds()
                : Collections.singletonList(shopId);

        // 默认只看合作中疗愈师，结束/暂停合作需显式筛选。
        List<Massagist> massagists = listMassagists(shopId, selectedStatus);
        LocalDate asOf = LocalDate.now();
        BoardContext context = loadContext(selected, asOf, massagists, scopeShopIds);

        IncentiveDashboard dashboard = new IncentiveDashboard();
        dashboard.setMonth(selected);
        dashboard.setAsOf(asOf);
        dashboard.setCutoff(context.cutoff);
        dashboard.setCurrentMonth(selected.equals(IncentiveMath.currentMonth()));
        dashboard.setShopId(shopId);
        dashboard.setShopName(shopId == null ? "全部门店" : context.shopNames.get(shopId));
        dashboard.setUsingDefaultConfig(context.bundle.isUsingDefault());
        dashboard.setWarnings(context.warnings);

        for (Massagist massagist : massagists) {
            IncentiveBoard board = buildBoard(context, massagist, false);
            dashboard.getTherapists().add(board);
            dashboard.setTotalBase(dashboard.getTotalBase().add(board.getBase().getAmount()));
            dashboard.setTotalManager(dashboard.getTotalManager().add(board.getManager().getTotalAmount()));
            dashboard.setTotalTraining(dashboard.getTotalTraining().add(board.getTraining().getEarnedAmount()));
            dashboard.setTotalRepurchase(dashboard.getTotalRepurchase().add(board.getRepurchase().getTotalAmount()));
            dashboard.setTotalPotential(dashboard.getTotalPotential().add(board.getRepurchase().getPotentialAmount()));
            dashboard.setTotalSettlement(dashboard.getTotalSettlement().add(board.getSettlement().getNet()));
        }
        dashboard.setTherapistCount(massagists.size());
        ShopIncentiveTarget target = shopId == null ? null : context.targets.stream()
                .filter(t -> shopId.equals(t.getShopId()))
                .findFirst().orElse(null);
        if (target != null) {
            BigDecimal actual = context.revenueByShop.getOrDefault(shopId, BigDecimal.ZERO);
            BigDecimal targetRevenue = target.getTargetRevenue() == null
                    ? BigDecimal.ZERO : target.getTargetRevenue();
            BigDecimal rate = target.getCommissionRate() == null
                    ? BigDecimal.ZERO : target.getCommissionRate();
            dashboard.setTargetRevenue(targetRevenue);
            dashboard.setActualRevenue(actual);
            dashboard.setAchievementRate(targetRevenue.compareTo(BigDecimal.ZERO) > 0
                    ? IncentiveMath.percent(actual, targetRevenue) : BigDecimal.ZERO);
            dashboard.setManagerAmount(target.getManagerMassagistId() == null
                    ? BigDecimal.ZERO
                    : incentiveCalculator.managerReward(true, actual, targetRevenue, rate));
            dashboard.setManagerName(target.getManagerMassagistId() == null
                    ? null : context.massagistNames.get(target.getManagerMassagistId()));
        } else if (shopId == null) {
            BigDecimal managerAmount = BigDecimal.ZERO;
            for (Massagist massagist : massagists) {
                managerAmount = managerAmount.add(managerRewardFor(context, massagist).getTotalAmount());
            }
            dashboard.setManagerAmount(managerAmount);
            dashboard.setActualRevenue(context.revenueByShop.values().stream()
                    .reduce(BigDecimal.ZERO, BigDecimal::add));
        }

        dashboard.getTherapists().sort(Comparator
                .comparing((IncentiveBoard b) -> b.getSettlement().getSubtotal())
                .reversed()
                .thenComparing(IncentiveBoard::getMassagistId));
        addConfigWarnings(dashboard.getWarnings(), context);
        addRepurchaseWarnings(dashboard.getWarnings(), dashboard.getTherapists());

        dashboard.setTherapistCount(dashboard.getTherapists().size());
        return dashboard;
    }

    /**
     * 按门店与在职状态筛选疗愈师。status 为 null 表示不限状态。
     */
    private List<Massagist> listMassagists(Long shopId, Integer status) {
        LambdaQueryWrapper<Massagist> lqw = new LambdaQueryWrapper<>();
        if (shopId != null) {
            lqw.eq(Massagist::getShopId, shopId);
        }
        if (status != null) {
            lqw.eq(Massagist::getStatus, status);
        }
        return massagistService.list(lqw);
    }

    /**
     * null 默认按在职（1）处理；-1 表示全部状态。
     */
    private Integer normalizeStatus(Integer status) {
        if (status == null) {
            return 1;
        }
        if (status < -1 || status > 2) {
            throw new BusinessException("合作状态不正确");
        }
        return status == -1 ? null : status;
    }

    public IncentiveBoard currentTherapistBoard(String month) {
        Long massagistId = accessService.currentMassagistId();
        return boardForMassagist(massagistId, month, null, false);
    }

    public List<IncentiveShopOption> shopOptions() {
        List<Long> ids = accessService.authorizedShopIds();
        List<Shop> shops;
        if (ids == null) {
            shops = shopService.list();
        } else if (ids.isEmpty()) {
            shops = new ArrayList<>();
        } else {
            shops = shopService.listByIds(ids);
        }
        List<IncentiveShopOption> result = new ArrayList<>();
        for (Shop shop : shops) {
            result.add(new IncentiveShopOption(shop.getId(), shop.getName()));
        }
        result.sort(Comparator.comparing(IncentiveShopOption::getId,
                Comparator.nullsLast(Comparator.naturalOrder())));
        return result;
    }

    public List<IncentiveMassagistOption> massagistOptions(Long requestedShopId) {
        Long shopId = accessService.resolveShopId(requestedShopId);
        List<Massagist> massagists = shopId == null
                ? massagistService.list()
                : massagistService.listByShopId(shopId, null);
        Map<Long, Shop> shops = shopsOf(massagists);
        List<IncentiveMassagistOption> result = new ArrayList<>();
        for (Massagist massagist : massagists) {
            IncentiveMassagistOption option = new IncentiveMassagistOption();
            option.setId(massagist.getId());
            option.setName(massagist.getName());
            option.setShopId(massagist.getShopId());
            Shop shop = massagist.getShopId() == null ? null : shops.get(massagist.getShopId());
            option.setShopName(shop == null ? null : shop.getName());
            option.setCooperationStatus(cooperationStatus(massagist));
            result.add(option);
        }
        result.sort(Comparator.comparing(IncentiveMassagistOption::getShopId,
                        Comparator.nullsLast(Comparator.naturalOrder()))
                .thenComparing(IncentiveMassagistOption::getName,
                        Comparator.nullsLast(Comparator.naturalOrder())));
        return result;
    }

    public IncentiveConfigBundle config(String month) {
        String selected = IncentiveMath.normalizeMonth(month);
        return configService.bundleForMonth(selected);
    }

    public IncentiveBoard adminBoard(Long massagistId, String month, Long requestedShopId) {
        if (massagistId == null) {
            throw new BusinessException("疗愈师不能为空");
        }
        Long shopId = requestedShopId == null ? null : accessService.resolveShopId(requestedShopId);
        return boardForMassagist(massagistId, month, shopId, true);
    }

    private IncentiveBoard boardForMassagist(Long massagistId,
                                             String month,
                                             Long shopId,
                                             boolean requireAccess) {
        String selected = IncentiveMath.normalizeMonth(month);
        requireNotFuture(selected);
        Massagist massagist = massagistService.getById(massagistId);
        if (massagist == null) {
            throw new BusinessException("疗愈师档案不存在");
        }
        if (requireAccess) {
            if (shopId != null) {
                accessService.requireShopAccess(shopId);
            } else {
                accessService.requireShopAccess(massagist.getShopId());
                // 非全局角色在未指定门店时，仍只按该疗愈师所属门店取数，避免跨店明细泄露。
                if (!accessService.isGlobal()) {
                    shopId = massagist.getShopId();
                }
            }
        }
        List<Long> scopeShopIds = shopId == null ? null : Collections.singletonList(shopId);
        List<Massagist> massagists = Collections.singletonList(massagist);
        BoardContext context = loadContext(selected, LocalDate.now(), massagists, scopeShopIds);
        IncentiveBoard board = buildBoard(context, massagist, true);
        addConfigWarnings(board.getWarnings(), context);
        return board;
    }

    public List<TrainingRecordView> trainingRecords(String month, Long requestedShopId, Integer status) {
        String selected = IncentiveMath.normalizeMonth(month);
        requireNotFuture(selected);
        Long shopId = accessService.resolveShopId(requestedShopId);
        if (shopId != null) {
            accessService.requireShopAccess(shopId);
        }
        // 默认只看合作中疗愈师，结束/暂停合作需显式筛选。
        List<Massagist> massagists = listMassagists(shopId, normalizeStatus(status));
        IncentiveConfigBundle bundle = configService.bundleForMonth(selected);
        List<MassagistTrainingCert> certs = massagists.isEmpty() ? new ArrayList<>()
                : certMapper.selectList(new LambdaQueryWrapper<MassagistTrainingCert>()
                .in(MassagistTrainingCert::getMassagistId,
                        massagists.stream().map(Massagist::getId).collect(Collectors.toList())));
        List<Long> ids = massagists.stream().map(Massagist::getId).collect(Collectors.toList());
        List<MassagistTrainingAssessment> assessments = ids.isEmpty() ? new ArrayList<>()
                : assessmentMapper.selectList(new LambdaQueryWrapper<MassagistTrainingAssessment>()
                .in(MassagistTrainingAssessment::getMassagistId, ids)
                .eq(MassagistTrainingAssessment::getVoided, 0));
        List<TrainingRecordView> result = trainingViews(massagists, bundle, certs, assessments);
        result.sort(Comparator.comparing(TrainingRecordView::getShopName,
                        Comparator.nullsLast(Comparator.naturalOrder()))
                .thenComparing(TrainingRecordView::getMassagistName,
                        Comparator.nullsLast(Comparator.naturalOrder())));
        return result;
    }

    @Transactional(readOnly = true)
    public Map<String, Object> trainingRecordsPage(String month, Long requestedShopId,
                                                   Integer status, int page, int size, String keyword) {
        if (page < 1 || page > 100000 || size < 1 || size > 100) {
            throw new BusinessException("分页参数不正确");
        }
        Integer selectedStatus = normalizeStatus(status);
        String name = keyword == null ? null : keyword.trim();
        if (name != null && name.length() > 100) {
            throw new BusinessException("姓名查询不能超过100个字符");
        }
        String selected = IncentiveMath.normalizeMonth(month);
        requireNotFuture(selected);
        Long shopId = accessService.resolveShopId(requestedShopId);
        if (shopId != null) accessService.requireShopAccess(shopId);
        List<Long> scopeShopIds = shopId == null ? accessService.authorizedShopIds()
                : Collections.singletonList(shopId);
        IncentiveConfigBundle bundle = configService.bundleForMonth(selected);
        LocalDate asOf = LocalDate.now();
        LocalDate cutoff = IncentiveMath.cutoff(selected, asOf);
        boolean noScope = scopeShopIds != null && scopeShopIds.isEmpty();
        long total = noScope ? 0 : trainingPageMapper.countPeople(shopId, selectedStatus, name);
        long offset = (long) (page - 1) * size;
        List<Massagist> massagists = offset >= total ? new ArrayList<>()
                : trainingPageMapper.selectPeople(shopId, selectedStatus, name, (int) offset, size);
        List<TrainingRecordView> rows = new ArrayList<>();
        if (!massagists.isEmpty()) {
            List<Long> ids = massagists.stream().map(Massagist::getId).collect(Collectors.toList());
            List<MassagistTrainingCert> certs = certMapper.selectList(
                    new LambdaQueryWrapper<MassagistTrainingCert>()
                            .in(MassagistTrainingCert::getMassagistId, ids));
            List<MassagistTrainingAssessment> assessments = assessmentMapper.selectList(
                    new LambdaQueryWrapper<MassagistTrainingAssessment>()
                            .in(MassagistTrainingAssessment::getMassagistId, ids)
                            .eq(MassagistTrainingAssessment::getVoided, 0));
            rows = trainingViews(massagists, bundle, certs, assessments);
            // 仅构建培训进度所需上下文，不能调用包含薪资/复购/全店收入的 loadContext。
            BoardContext context = new BoardContext();
            context.month = selected;
            context.asOf = asOf;
            context.bundle = bundle;
            for (MassagistTrainingCert cert : certs) {
                context.certsByKey.put(cert.getMassagistId() + "|" + cert.getProjectKey(), cert);
            }
            LocalDate start = certs.stream().map(MassagistTrainingCert::getPassedAt)
                    .filter(d -> d != null).min(LocalDate::compareTo)
                    .map(d -> d.plusDays(1)).orElse(null);
            if (start != null && !start.isAfter(cutoff)) {
                for (ServiceDetailRow row : queryMapper.selectServiceDetailsForMassagists(
                        scopeShopIds, ids, start.atStartOfDay(), cutoff.plusDays(1).atStartOfDay())) {
                    if (row.getServiceDate() == null) continue;
                    TrainingOrder order = new TrainingOrder();
                    order.setOrderId(row.getOrderId());
                    order.setServiceDate(row.getServiceDate());
                    order.setMassagistId(row.getMassagistId());
                    order.setShopId(row.getShopId());
                    order.setProjectId(row.getProjectId());
                    order.setDuration(row.getDuration());
                    order.setProjectTitle(row.getProjectTitle());
                    order.setParts(row.getParts());
                    context.trainingOrdersByMassagist
                            .computeIfAbsent(row.getMassagistId(), k -> new ArrayList<>()).add(order);
                }
            }
            for (int i = 0; i < massagists.size(); i++) {
                rows.get(i).setProgress(trainingSection(context, massagists.get(i)).getProjects());
            }
        }
        Map<String, Object> response = new LinkedHashMap<>();
        response.put("list", rows);
        response.put("total", total);
        response.put("pageNum", page);
        response.put("pageSize", size);
        response.put("month", selected);
        response.put("cutoff", cutoff);
        response.put("shopId", shopId);
        response.put("trainingProjects", bundle.getTrainingProjects());
        response.put("teamCertEnabled", teamCertProperties.enabled());
        return response;
    }

    public List<IncentiveMassagistOption> trainerOptions() {
        return queryService.trainerOptions();
    }

    private List<TrainingRecordView> trainingViews(List<Massagist> massagists,
                                                   IncentiveConfigBundle bundle,
                                                   List<MassagistTrainingCert> certs,
                                                   List<MassagistTrainingAssessment> assessments) {
        Map<Long, Shop> shops = shopsOf(massagists);
        Map<String, MassagistTrainingCert> certByKey = new HashMap<>();
        for (MassagistTrainingCert cert : certs) {
            certByKey.put(cert.getMassagistId() + "|" + cert.getProjectKey(), cert);
        }
        Map<String, List<MassagistTrainingAssessment>> votesByKey = new HashMap<>();
        for (MassagistTrainingAssessment row : assessments) {
            votesByKey.computeIfAbsent(row.getMassagistId() + "|" + row.getProjectKey(),
                    k -> new ArrayList<>()).add(row);
        }

        List<TrainingRecordView> result = new ArrayList<>();
        for (Massagist massagist : massagists) {
            TrainingRecordView view = new TrainingRecordView();
            view.setMassagistId(massagist.getId());
            view.setMassagistName(massagist.getName());
            view.setShopId(massagist.getShopId());
            Shop shop = massagist.getShopId() == null ? null : shops.get(massagist.getShopId());
            view.setShopName(shop == null ? null : shop.getName());
            view.setCooperationStatus(cooperationStatus(massagist));
            view.setEntryDay(massagist.getEntryDay());
            int certified = 0;
            for (TrainingProjectConfig project : bundle.getTrainingProjects()) {
                String key = massagist.getId() + "|" + project.getProjectKey();
                TrainingRecordView.CertItem item = new TrainingRecordView.CertItem();
                item.setProjectKey(project.getProjectKey());
                item.setProjectGroup(project.getProjectGroup());
                item.setProjectName(project.getProjectName());
                item.setProjectId(project.getProjectId());
                item.setDurationMinutes(project.getDurationMinutes());
                List<MassagistTrainingAssessment> votes = votesByKey.get(key);
                if (votes != null) {
                    int pass = 0;
                    int fail = 0;
                    LocalDate last = null;
                    for (MassagistTrainingAssessment vote : votes) {
                        if (Integer.valueOf(1).equals(vote.getResult())) {
                            pass++;
                        } else {
                            fail++;
                        }
                        if (vote.getAssessDate() != null
                                && (last == null || vote.getAssessDate().isAfter(last))) {
                            last = vote.getAssessDate();
                        }
                    }
                    item.setPassCount(pass);
                    item.setFailCount(fail);
                    item.setAttemptCount(pass + fail);
                    item.setLastAssessDate(last);
                }
                MassagistTrainingCert cert = certByKey.get(key);
                if (cert != null) {
                    certified++;
                    item.setCertId(cert.getId());
                    item.setPassedAt(cert.getPassedAt());
                    item.setCertifierName(cert.getCertifierName());
                    item.setRemark(cert.getRemark());
                    item.setCertSource(cert.getSource() == null ? "LEGACY" : cert.getSource());
                    item.setCertifiedAt(cert.getCertifiedAt());
                    item.setTeamSize(cert.getTeamSize() == null ? 0 : cert.getTeamSize());
                }
                view.getCerts().add(item);
            }
            view.setCertifiedCount(certified);
            result.add(view);
        }
        return result;
    }

    @Transactional(rollbackFor = Exception.class)
    public MassagistTrainingCert saveCert(TrainingCertSaveRequest request) {
        if (teamCertProperties.enabled()) {
            accessService.requireSuperAdmin();
            if (request == null || request.getRemark() == null
                    || request.getRemark().trim().isEmpty()) {
                throw new BusinessException("人工特批必须填写原因");
            }
            return saveCertInternal(request, true);
        }
        accessService.requireGlobal();
        return saveCertInternal(request, false);
    }

    private MassagistTrainingCert saveCertInternal(TrainingCertSaveRequest request, boolean manual) {
        if (request == null || request.getMassagistId() == null
                || request.getProjectKey() == null || request.getProjectKey().trim().isEmpty()
                || request.getPassedAt() == null) {
            throw new BusinessException("疗愈师、培训项目和考核日不能为空");
        }
        if (request.getPassedAt().isAfter(LocalDate.now())) {
            throw new BusinessException("考核日不能晚于今天");
        }
        Massagist massagist = massagistService.getById(request.getMassagistId());
        if (massagist == null) {
            throw new BusinessException("疗愈师档案不存在");
        }
        String projectKey = request.getProjectKey().trim();
        IncentiveConfigBundle bundle = configService.bundleForMonth(IncentiveMath.currentMonth());
        TrainingProjectConfig project = bundle.getTrainingProjects().stream()
                .filter(p -> projectKey.equals(p.getProjectKey()))
                .findFirst().orElse(null);
        if (project == null) {
            throw new BusinessException("培训项目不存在：" + projectKey);
        }

        MassagistTrainingCert existing = certMapper.selectOne(new LambdaQueryWrapper<MassagistTrainingCert>()
                .eq(MassagistTrainingCert::getMassagistId, massagist.getId())
                .eq(MassagistTrainingCert::getProjectKey, projectKey)
                .last("LIMIT 1"));
        UmsAdmin operator = accessService.currentAdmin();
        MassagistTrainingCertLog log = new MassagistTrainingCertLog();
        log.setMassagistId(massagist.getId());
        log.setShopId(massagist.getShopId());
        log.setProjectKey(projectKey);
        log.setOperatorId(operator.getId());
        log.setOperatorName(accessService.currentOperatorName());
        log.setRemark(request.getRemark());

        if (existing == null) {
            MassagistTrainingCert cert = new MassagistTrainingCert();
            cert.setMassagistId(massagist.getId());
            cert.setShopId(massagist.getShopId());
            cert.setProjectKey(projectKey);
            cert.setPassedAt(request.getPassedAt());
            cert.setCertifierId(operator.getId());
            cert.setCertifierName(accessService.currentOperatorName());
            cert.setRemark(request.getRemark());
            cert.setSource(manual ? "MANUAL" : "LEGACY");
            cert.setCertifiedAt(LocalDateTime.now());
            cert.setTeamSize(0);
            certMapper.insert(cert);
            log.setCertId(cert.getId());
            log.setAction(manual ? "MANUAL_CERTIFY" : "CREATE");
            log.setNewPassedAt(cert.getPassedAt());
            certLogMapper.insert(log);
            return cert;
        }
        log.setCertId(existing.getId());
        log.setAction("UPDATE");
        log.setOldPassedAt(existing.getPassedAt());
        existing.setPassedAt(request.getPassedAt());
        existing.setRemark(request.getRemark());
        existing.setCertifierId(operator.getId());
        existing.setCertifierName(accessService.currentOperatorName());
        if (manual) {
            existing.setSource("MANUAL");
            existing.setCertifiedAt(LocalDateTime.now());
            existing.setTeamSize(0);
        }
        certMapper.updateById(existing);
        log.setNewPassedAt(existing.getPassedAt());
        certLogMapper.insert(log);
        return existing;
    }

    @Transactional(rollbackFor = Exception.class)
    public void deleteCert(Long certId) {
        deleteCert(certId, null);
    }

    @Transactional(rollbackFor = Exception.class)
    public void deleteCert(Long certId, String reason) {
        if (teamCertProperties.enabled()) {
            accessService.requireSuperAdmin();
            certificationService.revoke(certId, reason);
            return;
        }
        accessService.requireGlobal();
        MassagistTrainingCert cert = certMapper.selectById(certId);
        if (cert == null) {
            throw new BusinessException("考核记录不存在");
        }
        MassagistTrainingCertLog log = new MassagistTrainingCertLog();
        log.setCertId(cert.getId());
        log.setMassagistId(cert.getMassagistId());
        log.setShopId(cert.getShopId());
        log.setProjectKey(cert.getProjectKey());
        log.setAction("DELETE");
        log.setOldPassedAt(cert.getPassedAt());
        log.setOperatorId(accessService.currentAdmin().getId());
        log.setOperatorName(accessService.currentOperatorName());
        certLogMapper.insert(log);
        certMapper.deleteById(certId);
    }

    @Transactional(rollbackFor = Exception.class)
    public MassagistTrainingCert manualCert(TrainingManualCertRequest request) {
        if (!teamCertProperties.enabled()) {
            throw new BusinessException("内训考核功能尚未开启");
        }
        accessService.requireSuperAdmin();
        if (request == null || request.getMassagistId() == null
                || request.getProjectKey() == null || request.getProjectKey().trim().isEmpty()
                || request.getPassedAt() == null) {
            throw new BusinessException("疗愈师、项目和通过日期不能为空");
        }
        Massagist massagist = massagistService.getById(request.getMassagistId());
        if (massagist == null) {
            throw new BusinessException("疗愈师档案不存在");
        }
        String projectKey = request.getProjectKey().trim();
        TrainingProjectConfig project = configService.bundleForMonth(IncentiveMath.currentMonth())
                .getTrainingProjects().stream()
                .filter(p -> projectKey.equals(p.getProjectKey()))
                .findFirst().orElse(null);
        if (project == null) {
            throw new BusinessException("培训项目不存在");
        }
        return certificationService.manualCert(massagist, project, request.getPassedAt(),
                request.getReason());
    }

    public void revokeCert(Long certId, String reason) {
        if (!teamCertProperties.enabled()) {
            throw new BusinessException("内训考核功能尚未开启");
        }
        certificationService.revoke(certId, reason);
    }

    public Map<String, Object> assessmentRecords(String month, Long shopId, Long trainerId,
                                                 Long massagistId, String projectKey,
                                                 Integer result, Integer voided, int page, int size) {
        return queryService.managementRecords(month, shopId, trainerId, massagistId,
                projectKey, result, voided, page, size);
    }

    public TrainingAssessmentSummary assessmentSummary(String month, Long shopId) {
        return queryService.summary(month, shopId);
    }

    public TrainingAssessmentDetail assessmentDetail(Long massagistId, String projectKey) {
        return queryService.detail(massagistId, projectKey);
    }

    public void voidAssessment(Long id, String reason) {
        if (!teamCertProperties.enabled()) {
            throw new BusinessException("内训考核功能尚未开启");
        }
        certificationService.voidAssessment(id, reason);
    }

    public String exportAssessments(String month, Long shopId, Long trainerId,
                                    Long massagistId, String projectKey, Integer result,
                                    Integer voided) {
        return queryService.exportAssessments(month, shopId, trainerId, massagistId,
                projectKey, result, voided);
    }

    public String exportCertifications(String month, Long shopId) {
        return queryService.exportCertifications(month, shopId);
    }

    public List<ShopTargetView> targets(String month, Long requestedShopId) {
        String selected = IncentiveMath.normalizeMonth(month);
        Long shopId = accessService.resolveShopId(requestedShopId);
        if (shopId != null) {
            accessService.requireShopAccess(shopId);
        }
        LambdaQueryWrapper<ShopIncentiveTarget> wrapper = new LambdaQueryWrapper<ShopIncentiveTarget>()
                .eq(ShopIncentiveTarget::getMonthCode, selected)
                .orderByAsc(ShopIncentiveTarget::getShopId);
        if (shopId != null) {
            wrapper.eq(ShopIncentiveTarget::getShopId, shopId);
        } else {
            List<Long> ids = accessService.authorizedShopIds();
            if (ids != null) {
                if (ids.isEmpty()) {
                    return new ArrayList<>();
                }
                wrapper.in(ShopIncentiveTarget::getShopId, ids);
            }
        }
        List<ShopIncentiveTarget> list = targetMapper.selectList(wrapper);
        Map<Long, Shop> shops = shopsByIds(list.stream()
                .map(ShopIncentiveTarget::getShopId).collect(Collectors.toList()));
        Map<Long, Massagist> managers = massagistsByIds(list.stream()
                .map(ShopIncentiveTarget::getManagerMassagistId).collect(Collectors.toList()));
        List<ShopTargetView> result = new ArrayList<>();
        for (ShopIncentiveTarget target : list) {
            ShopTargetView view = new ShopTargetView();
            view.setId(target.getId());
            view.setShopId(target.getShopId());
            Shop shop = shops.get(target.getShopId());
            view.setShopName(shop == null ? null : shop.getName());
            view.setMonthCode(target.getMonthCode());
            view.setTargetRevenue(target.getTargetRevenue());
            view.setCommissionRate(target.getCommissionRate());
            view.setManagerMassagistId(target.getManagerMassagistId());
            Massagist manager = managers.get(target.getManagerMassagistId());
            view.setManagerName(manager == null ? null : manager.getName());
            view.setRemark(target.getRemark());
            result.add(view);
        }
        return result;
    }

    @Transactional(rollbackFor = Exception.class)
    public ShopIncentiveTarget saveTarget(ShopTargetSaveRequest request) {
        accessService.requireGlobal();
        if (request == null || request.getShopId() == null) {
            throw new BusinessException("门店不能为空");
        }
        IncentiveMath.requireMonth(request.getMonthCode());
        String month = IncentiveMath.normalizeMonth(request.getMonthCode());
        if (shopService.getById(request.getShopId()) == null) {
            throw new BusinessException("门店不存在");
        }
        if (request.getTargetRevenue() == null
                || request.getTargetRevenue().compareTo(BigDecimal.ZERO) < 0) {
            throw new BusinessException("业绩目标不能为负");
        }
        if (request.getCommissionRate() == null
                || request.getCommissionRate().compareTo(BigDecimal.ZERO) < 0
                || request.getCommissionRate().compareTo(new BigDecimal("100")) > 0) {
            throw new BusinessException("提点比例必须在 0–100 之间");
        }
        if (request.getManagerMassagistId() != null
                && massagistService.getById(request.getManagerMassagistId()) == null) {
            throw new BusinessException("店长对应的疗愈师档案不存在");
        }
        String monthCode = month;
        ShopIncentiveTarget existing = targetMapper.selectOne(new LambdaQueryWrapper<ShopIncentiveTarget>()
                .eq(ShopIncentiveTarget::getShopId, request.getShopId())
                .eq(ShopIncentiveTarget::getMonthCode, monthCode)
                .last("LIMIT 1"));
        if (existing == null) {
            existing = new ShopIncentiveTarget();
            existing.setShopId(request.getShopId());
            existing.setMonthCode(monthCode);
            existing.setCreateUserId(accessService.currentAdmin().getId());
            existing.setConfigId(configService.bundleForMonth(monthCode).getConfig().getId());
            existing.setTargetRevenue(request.getTargetRevenue());
            existing.setCommissionRate(request.getCommissionRate());
            existing.setManagerMassagistId(request.getManagerMassagistId());
            existing.setRemark(request.getRemark());
            targetMapper.insert(existing);
        } else {
            existing.setTargetRevenue(request.getTargetRevenue());
            existing.setCommissionRate(request.getCommissionRate());
            existing.setManagerMassagistId(request.getManagerMassagistId());
            existing.setRemark(request.getRemark());
            targetMapper.updateById(existing);
        }
        return existing;
    }

    public String exportCsv(String month, Long shopId) {
        return exportCsv(month, shopId, 1);
    }

    @Transactional(readOnly = true)
    public String exportCsv(String month, Long shopId, Integer status) {
        accessService.requireGlobal();
        // 只装配一次完整筛选结果，不通过列表页循环重算，也不截断 500 行。
        IncentiveDashboard dashboard = fullDashboard(month, shopId, status);
        StringBuilder csv = new StringBuilder();
        csv.append('\ufeff');
        csv.append("数据月份,").append(csv(dashboard.getMonth()))
                .append(",数据截止,").append(csv(String.valueOf(dashboard.getCutoff())))
                .append('\n');
        csv.append("门店,疗愈师,合作状态,加入天数,服务时长(分钟),基础系数,基础接单奖励,店长奖励,培训补贴,复购激励,复购潜力,其他调整,激励合计,税前预估,个税预估,结算预估\n");
        for (IncentiveBoard board : dashboard.getTherapists()) {
            csv.append(csv(board.getShopName())).append(',')
                    .append(csv(board.getMassagistName())).append(',')
                    .append(csv(board.getCooperationStatus())).append(',')
                    .append(board.getJoinDays() == null ? "" : board.getJoinDays()).append(',')
                    .append(board.getBase().getMinutes()).append(',')
                    .append(board.getBase().getCoefficient()).append(',')
                    .append(board.getBase().getAmount()).append(',')
                    .append(board.getManager().getTotalAmount()).append(',')
                    .append(board.getTraining().getEarnedAmount()).append(',')
                    .append(board.getRepurchase().getTotalAmount()).append(',')
                    .append(board.getRepurchase().getPotentialAmount()).append(',')
                    .append(board.getSettlement().getAdjustment()).append(',')
                    .append(board.getSettlement().getSubtotal()).append(',')
                    .append(board.getSettlement().getPreTax()).append(',')
                    .append(board.getSettlement().getTax()).append(',')
                    .append(board.getSettlement().getNet()).append('\n');
        }
        return csv.toString();
    }

    private BoardContext loadContext(String month,
                                     LocalDate asOf,
                                     List<Massagist> massagists,
                                     List<Long> scopeShopIds) {
        BoardContext context = new BoardContext();
        context.month = month;
        context.asOf = asOf;
        context.cutoff = IncentiveMath.cutoff(month, asOf);
        context.scopeShopIds = scopeShopIds;
        context.scopeShopId = scopeShopIds != null && scopeShopIds.size() == 1
                ? scopeShopIds.get(0) : null;
        context.bundle = configService.bundleForMonth(month);
        context.massagistNames = massagists.stream()
                .filter(m -> m.getId() != null && m.getName() != null)
                .collect(Collectors.toMap(Massagist::getId, Massagist::getName, (a, b) -> a));
        context.shopNames = new HashMap<>();
        for (Shop shop : shopsOf(massagists).values()) {
            if (shop.getId() != null && shop.getName() != null) {
                context.shopNames.put(shop.getId(), shop.getName());
            }
        }
        context.massagists = massagists;
        if (massagists.isEmpty()) {
            return context;
        }

        List<Long> massagistIds = massagists.stream().map(Massagist::getId).collect(Collectors.toList());
        Long filterMassagistId = massagists.size() == 1 ? massagists.get(0).getId() : null;
        LocalDate monthStart = IncentiveMath.monthStart(month);
        boolean windowOpen = !context.cutoff.isBefore(monthStart);
        boolean noShop = scopeShopIds != null && scopeShopIds.isEmpty();

        if (windowOpen && !noShop) {
            List<ServiceDetailRow> details = queryMapper.selectServiceDetails(
                    scopeShopIds, filterMassagistId,
                    monthStart.atStartOfDay(), context.cutoff.plusDays(1).atStartOfDay());
            for (ServiceDetailRow row : details) {
                context.detailsByMassagist.computeIfAbsent(row.getMassagistId(), k -> new ArrayList<>()).add(row);
            }

            LambdaQueryWrapper<Adjust> adjustQuery = new LambdaQueryWrapper<Adjust>()
                    .eq(Adjust::getStatus, AdjustStatus.DOING.getValue())
                    .in(Adjust::getMassagistId, massagistIds)
                    .between(Adjust::getAdjustDate, monthStart, context.cutoff);
            if (scopeShopIds != null) {
                adjustQuery.in(Adjust::getShopId, scopeShopIds);
            }
            for (Adjust adjust : adjustService.list(adjustQuery)) {
                int signed = adjust.getDuration() == null ? 0 : adjust.getDuration();
                if (adjust.getType() != null && adjust.getType() == 0) {
                    signed = -signed;
                }
                context.adjustmentsByMassagist.merge(adjust.getMassagistId(), BigDecimal.valueOf(signed), BigDecimal::add);
            }
        }

        List<MassagistTrainingCert> certs = certMapper.selectList(
                new LambdaQueryWrapper<MassagistTrainingCert>()
                        .in(MassagistTrainingCert::getMassagistId, massagistIds));
        for (MassagistTrainingCert cert : certs) {
            context.certsByKey.put(cert.getMassagistId() + "|" + cert.getProjectKey(), cert);
        }

        LocalDate trainingStart = certs.stream()
                .map(MassagistTrainingCert::getPassedAt)
                .filter(d -> d != null)
                .min(LocalDate::compareTo)
                .map(d -> d.plusDays(1))
                .orElse(null);
        if (trainingStart != null && !trainingStart.isAfter(context.cutoff) && !noShop) {
            // 培训按“服务完成日”累计；支付在前、考核通过后才完成的订单也应计入。
            List<ServiceDetailRow> rows = queryMapper.selectServiceDetails(
                    scopeShopIds, filterMassagistId,
                    trainingStart.atStartOfDay(), context.cutoff.plusDays(1).atStartOfDay());
            for (ServiceDetailRow row : rows) {
                if (row.getServiceDate() == null) {
                    continue;
                }
                TrainingOrder order = new TrainingOrder();
                order.setOrderId(row.getOrderId());
                order.setServiceDate(row.getServiceDate());
                order.setMassagistId(row.getMassagistId());
                order.setShopId(row.getShopId());
                order.setProjectId(row.getProjectId());
                order.setDuration(row.getDuration());
                order.setProjectTitle(row.getProjectTitle());
                order.setParts(row.getParts());
                context.trainingOrdersByMassagist
                        .computeIfAbsent(row.getMassagistId(), k -> new ArrayList<>()).add(order);
            }
        }

        loadVisits(context, massagistIds, filterMassagistId, noShop);

        LambdaQueryWrapper<ShopIncentiveTarget> targetQuery = new LambdaQueryWrapper<ShopIncentiveTarget>()
                .eq(ShopIncentiveTarget::getMonthCode, month);
        if (noShop) {
            context.targets = new ArrayList<>();
        } else {
            if (scopeShopIds != null) {
                targetQuery.in(ShopIncentiveTarget::getShopId, scopeShopIds);
            }
            context.targets = targetMapper.selectList(targetQuery);
        }
        List<Long> missingShopIds = context.targets.stream()
                .map(ShopIncentiveTarget::getShopId)
                .filter(id -> id != null && !context.shopNames.containsKey(id))
                .collect(Collectors.toList());
        // 目标门店名称一次批量读取，避免门店越多查询越多。
        for (Shop shop : shopsByIds(missingShopIds).values()) {
            if (shop.getId() != null && shop.getName() != null) {
                context.shopNames.put(shop.getId(), shop.getName());
            }
        }
        for (ShopIncentiveTarget target : context.targets) {
            if (target.getManagerMassagistId() != null) {
                context.targetsByManager
                        .computeIfAbsent(target.getManagerMassagistId(), k -> new ArrayList<>()).add(target);
            }
        }
        loadRevenue(context);

        List<SalaryOtherAmount> otherAmounts = salaryOtherAmountService
                .findSalaryOtherAmountList(month, null);
        for (SalaryOtherAmount item : otherAmounts) {
            if (item.getMassagistId() == null || item.getAmount() == null
                    || !massagistIds.contains(item.getMassagistId())) {
                continue;
            }
            if (scopeShopIds != null && item.getShopId() > 0
                    && !scopeShopIds.contains(item.getShopId())) {
                continue;
            }
            BigDecimal signed = item.getType() != null && item.getType() == 0
                    ? item.getAmount().negate() : item.getAmount();
            context.otherAmounts.merge(item.getMassagistId(), signed, BigDecimal::add);
        }

        String year = month.substring(0, 4);
        List<SalaryRecord> priorRecords = salaryRecordService.list(new LambdaQueryWrapper<SalaryRecord>()
                .in(SalaryRecord::getMassagistId, massagistIds)
                .ge(SalaryRecord::getMonthCode, year + "-01")
                .lt(SalaryRecord::getMonthCode, month));
        for (SalaryRecord record : priorRecords) {
            context.priorSalaryByMassagist
                    .computeIfAbsent(record.getMassagistId(), k -> new ArrayList<>()).add(record);
        }
        return context;
    }

    private void loadVisits(BoardContext context,
                            List<Long> massagistIds,
                            Long filterMassagistId,
                            boolean noShop) {
        if (noShop) {
            return;
        }
        IncentiveConfigBundle bundle = context.bundle;
        int retentionMonths = positive(bundle.getRule().getRetentionMonths(), 6);
        int retentionOffset = nonNegative(bundle.getRule().getRetentionEndOffset(), 2);
        YearMonth selected = IncentiveMath.parseMonth(context.month);
        LocalDate retentionStart = selected.minusMonths(retentionOffset + retentionMonths - 1L).atDay(1);
        // 历史月份统计到该月月末，当前月份统计到今天，避免用后续月份的数据回算历史看板。
        LocalDate visitEnd = context.cutoff.plusDays(1);
        if (retentionStart.isAfter(context.cutoff)) {
            return;
        }
        List<CustomerVisit> scoped = queryMapper.selectVisits(
                context.scopeShopIds, filterMassagistId,
                retentionStart.atStartOfDay(), visitEnd.atStartOfDay());
        Set<String> phones = new LinkedHashSet<>();
        for (CustomerVisit visit : scoped) {
            if (visit.getPhone() != null && !visit.getPhone().trim().isEmpty()) {
                phones.add(visit.getPhone().trim());
            }
        }
        if (phones.isEmpty()) {
            context.visits = new ArrayList<>();
            return;
        }
        List<String> phoneList = new ArrayList<>(phones);
        List<CustomerVisit> all = new ArrayList<>();
        int chunk = 500;
        for (int i = 0; i < phoneList.size(); i += chunk) {
            int end = Math.min(i + chunk, phoneList.size());
            all.addAll(queryMapper.selectVisitsByPhones(
                    phoneList.subList(i, end),
                    HISTORY_START.atStartOfDay(),
                    visitEnd.atStartOfDay()));
        }
        context.visits = all;
    }

    private void loadRevenue(BoardContext context) {
        Set<Long> shopIds = new LinkedHashSet<>();
        for (ShopIncentiveTarget target : context.targets) {
            if (target.getShopId() != null) {
                shopIds.add(target.getShopId());
            }
        }
        String end = context.cutoff.toString();
        String start = IncentiveMath.monthStart(context.month).toString();
        for (Long shopId : shopIds) {
            try {
                OperatingRevenueDto dto = new OperatingRevenueDto();
                dto.setShopId(shopId);
                dto.setStartPayTime(start);
                dto.setEndPayTime(end);
                JSONObject revenue = orderService.operatingRevenueTop(dto);
                BigDecimal actual = revenue == null ? BigDecimal.ZERO
                        : revenue.getBigDecimal("totalActualAmount");
                context.revenueByShop.put(shopId, actual == null ? BigDecimal.ZERO : actual);
            } catch (RuntimeException e) {
                context.revenueByShop.put(shopId, BigDecimal.ZERO);
                context.warnings.add("门店 " + shopId + " 实收款读取失败，店长奖励按 0 展示，请核对经营流水。");
            }
        }
    }

    private IncentiveBoard buildBoard(BoardContext context,
                                      Massagist massagist,
                                      boolean includeAchievements) {
        IncentiveBoard board = new IncentiveBoard();
        board.setMonth(context.month);
        board.setAsOf(context.asOf);
        board.setCutoff(context.cutoff);
        board.setCurrentMonth(context.month.equals(IncentiveMath.currentMonth()));
        board.setMassagistId(massagist.getId());
        board.setMassagistName(massagist.getName());
        board.setShopId(massagist.getShopId());
        board.setShopName(massagist.getShopId() == null ? null : context.shopNames.get(massagist.getShopId()));
        board.setCooperationStatus(cooperationStatus(massagist));

        LocalDate joinDate = massagist.getEntryDay();
        if (joinDate == null && includeAchievements) {
            joinDate = queryMapper.selectEarliestServiceDate(massagist.getId());
            if (joinDate != null) {
                board.getWarnings().add("加入日期未维护，累计成就从最早服务日 " + joinDate + " 起算。");
            }
        }
        board.setJoinDate(joinDate);
        board.setJoinDays(joinDate == null || joinDate.isAfter(context.cutoff)
                ? null : ChronoUnit.DAYS.between(joinDate, context.cutoff) + 1);
        if (includeAchievements) {
            board.setAchievements(achievements(context, massagist, joinDate, board.getWarnings()));
        } else {
            AchievementSummary summary = new AchievementSummary();
            summary.setJoinDate(joinDate);
            summary.setAsOf(context.cutoff);
            board.setAchievements(summary);
        }

        BaseIncentive base = baseIncentive(context, massagist);
        board.setBase(base);
        TrainingSection training = trainingSection(context, massagist);
        board.setTraining(training);
        RepurchaseMetrics repurchase = repurchaseCalculator.calculate(
                massagist.getId(), context.scopeShopId, context.visits, null,
                context.bundle.getRule(), context.month, context.cutoff);
        board.setRepurchase(repurchase);
        ManagerIncentive manager = managerRewardFor(context, massagist);
        board.setManager(manager);

        BigDecimal adjustment = context.otherAmounts.getOrDefault(massagist.getId(), BigDecimal.ZERO);
        List<SalaryRecord> prior = context.priorSalaryByMassagist
                .getOrDefault(massagist.getId(), new ArrayList<>());
        BigDecimal priorAnnual = prior.stream()
                .map(r -> r.getPreTaxIncome() == null ? BigDecimal.ZERO : r.getPreTaxIncome())
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal priorPaid = prior.stream()
                .map(r -> r.getPayableIncomeTax() == null ? BigDecimal.ZERO : r.getPayableIncomeTax())
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        int continuousMonths = continuousMonths(prior, context.month);
        SettlementResult settlement = settlementCalculator.calculate(
                base.getAmount(), manager.getTotalAmount(), training.getEarnedAmount(),
                repurchase.getTotalAmount(), adjustment, priorAnnual, priorPaid, continuousMonths);
        board.setSettlement(settlement);

        addRepurchaseBoardWarnings(board);
        if (includeAchievements && prior.isEmpty()) {
            board.getWarnings().add("未找到本年度历史结算记录，年度个税按本年起算，最终以财务结算为准。");
        }
        return board;
    }

    private BaseIncentive baseIncentive(BoardContext context, Massagist massagist) {
        BigDecimal minutes = BigDecimal.ZERO;
        List<ServiceDetailRow> details = context.detailsByMassagist
                .getOrDefault(massagist.getId(), new ArrayList<>());
        for (ServiceDetailRow row : details) {
            if (row.getDuration() == null) {
                continue;
            }
            BigDecimal coefficient = row.getProjectCoefficient() == null
                    ? BigDecimal.ONE : row.getProjectCoefficient();
            minutes = minutes.add(coefficient.multiply(BigDecimal.valueOf(row.getDuration())));
        }
        BigDecimal adjustment = context.adjustmentsByMassagist
                .getOrDefault(massagist.getId(), BigDecimal.ZERO);
        minutes = IncentiveMath.nonNegative(minutes.add(adjustment));

        boolean newPartner = isNewPartner(massagist, context.month);
        BigDecimal coefficient = context.bundle.getRule().coefficientFor(minutes, newPartner);
        BaseIncentive base = new BaseIncentive();
        base.setMinutes(IncentiveMath.money(minutes));
        base.setCoefficient(coefficient);
        base.setAmount(IncentiveMath.money(minutes.multiply(coefficient)));
        base.setNewPartner(newPartner);
        base.setBands(context.bundle.getRule().getCoefficients());

        List<CoefficientBand> bands = context.bundle.getRule().getCoefficients();
        CoefficientBand current = null;
        CoefficientBand next = null;
        for (CoefficientBand band : bands) {
            if (minutes.longValue() >= band.getMinMinutes()) {
                current = band;
            } else {
                next = band;
                break;
            }
        }
        if (current != null) {
            base.setCurrentBandMinutes(current.getMinMinutes());
            base.setCurrentBandCoefficient(current.getCoefficient());
        }
        if (next != null) {
            base.setNextBandMinutes(next.getMinMinutes());
            base.setNextBandCoefficient(next.getCoefficient());
            BigDecimal needed = BigDecimal.valueOf(next.getMinMinutes()).subtract(minutes);
            base.setMinutesToNextBand(IncentiveMath.money(IncentiveMath.nonNegative(needed)));
            base.setNextBandHint(newPartner
                    ? "新人合作期按 " + coefficient.stripTrailingZeros().toPlainString()
                    + " 计算；累计 " + base.getMinutesToNextBand().stripTrailingZeros().toPlainString()
                    + " 分钟进入下一档"
                    : "再累计 " + base.getMinutesToNextBand().stripTrailingZeros().toPlainString()
                    + " 分钟，系数进入 " + next.getCoefficient().stripTrailingZeros().toPlainString());
        } else {
            base.setNextBandHint(newPartner
                    ? "新人合作期系数 " + coefficient.stripTrailingZeros().toPlainString()
                    : "已达最高时长档位，系数 " + coefficient.stripTrailingZeros().toPlainString());
        }
        return base;
    }

    private TrainingSection trainingSection(BoardContext context, Massagist massagist) {
        TrainingSection section = new TrainingSection();
        List<TrainingOrder> orders = context.trainingOrdersByMassagist
                .getOrDefault(massagist.getId(), new ArrayList<>());
        BigDecimal earned = BigDecimal.ZERO;
        int completed = 0;
        for (TrainingProjectRule project : context.bundle.getRule().getTrainingProjects()) {
            MassagistTrainingCert cert = context.certsByKey
                    .get(massagist.getId() + "|" + project.getProjectKey());
            TrainingProgress progress = trainingCalculator.calculate(
                    massagist.getId(), project,
                    cert == null ? null : cert.getId(),
                    cert == null ? null : cert.getPassedAt(),
                    orders, context.month, context.asOf);
            section.getProjects().add(progress);
            if (progress.getEarnedAmount() != null) {
                earned = earned.add(progress.getEarnedAmount());
            }
            if (progress.getStatus() != null && progress.getStatus().startsWith("completed")) {
                completed++;
            }
        }
        section.setEarnedAmount(IncentiveMath.money(earned));
        section.setCompletedCount(completed);
        section.setProjectCount(section.getProjects().size());
        return section;
    }

    private ManagerIncentive managerRewardFor(BoardContext context, Massagist massagist) {
        ManagerIncentive result = new ManagerIncentive();
        List<ShopIncentiveTarget> targets = context.targetsByManager
                .getOrDefault(massagist.getId(), new ArrayList<>());
        if (targets.isEmpty()) {
            return result;
        }
        result.setManager(true);
        BigDecimal total = BigDecimal.ZERO;
        for (ShopIncentiveTarget target : targets) {
            BigDecimal actual = context.revenueByShop.getOrDefault(target.getShopId(), BigDecimal.ZERO);
            BigDecimal targetRevenue = target.getTargetRevenue() == null
                    ? BigDecimal.ZERO : target.getTargetRevenue();
            BigDecimal rate = target.getCommissionRate() == null
                    ? BigDecimal.ZERO : target.getCommissionRate();
            ManagerShopReward reward = new ManagerShopReward();
            reward.setShopId(target.getShopId());
            reward.setShopName(context.shopNames.get(target.getShopId()));
            reward.setActualRevenue(IncentiveMath.money(actual));
            reward.setTargetRevenue(targetRevenue);
            reward.setCommissionRate(rate);
            reward.setAchieved(targetRevenue.compareTo(BigDecimal.ZERO) > 0
                    && actual.compareTo(targetRevenue) >= 0);
            reward.setAmount(incentiveCalculator.managerReward(true, actual, targetRevenue, rate));
            total = total.add(reward.getAmount());
            result.getShops().add(reward);
        }
        result.setTotalAmount(IncentiveMath.money(total));
        return result;
    }

    private AchievementSummary achievements(BoardContext context,
                                            Massagist massagist,
                                            LocalDate joinDate,
                                            List<String> warnings) {
        AchievementSummary summary = new AchievementSummary();
        summary.setJoinDate(joinDate);
        summary.setAsOf(context.cutoff);
        if (joinDate == null || joinDate.isAfter(context.cutoff)) {
            return summary;
        }
        List<ServiceDetailRow> details = queryMapper.selectServiceDetails(
                context.scopeShopIds, massagist.getId(),
                joinDate.atStartOfDay(), context.cutoff.plusDays(1).atStartOfDay());
        BigDecimal minutes = BigDecimal.ZERO;
        Map<String, Integer> visitsByPhone = new LinkedHashMap<>();
        for (ServiceDetailRow row : details) {
            if (row.getDuration() != null) {
                BigDecimal coefficient = row.getProjectCoefficient() == null
                        ? BigDecimal.ONE : row.getProjectCoefficient();
                minutes = minutes.add(coefficient.multiply(BigDecimal.valueOf(row.getDuration())));
            }
            String phone = row.getPhone() == null ? "" : row.getPhone().trim();
            if (!phone.isEmpty()) {
                visitsByPhone.merge(phone, 1, Integer::sum);
            }
        }
        summary.setTotalServiceMinutes(IncentiveMath.money(minutes));
        summary.setCustomerCount(visitsByPhone.size());
        String topPhone = null;
        int topVisits = 0;
        for (Map.Entry<String, Integer> entry : visitsByPhone.entrySet()) {
            if (entry.getValue() > topVisits) {
                topPhone = entry.getKey();
                topVisits = entry.getValue();
            }
        }
        summary.setTopFanMasked(topPhone == null ? null : IncentiveMath.maskPhone(topPhone));
        summary.setTopFanVisits(topVisits);
        return summary;
    }

    private int continuousMonths(List<SalaryRecord> prior, String month) {
        if (CollectionUtils.isEmpty(prior)) {
            return 1;
        }
        Set<String> months = prior.stream().map(SalaryRecord::getMonthCode)
                .filter(m -> m != null).collect(Collectors.toSet());
        YearMonth cursor = IncentiveMath.shiftMonth(month, -1);
        int count = 1;
        while (months.contains(cursor.toString()) && count < 12) {
            count++;
            cursor = cursor.minusMonths(1);
        }
        return count;
    }

    private boolean isNewPartner(Massagist massagist, String month) {
        String formalMonth = massagist.getFormalMonth();
        return formalMonth != null && !formalMonth.trim().isEmpty()
                && month.compareTo(formalMonth.trim()) < 0;
    }

    private String cooperationStatus(Massagist massagist) {
        if (massagist.getStatus() == null) {
            return "合作中";
        }
        if (massagist.getStatus() == 0) {
            return "已结束合作";
        }
        if (massagist.getStatus() == 2) {
            return "暂挂合作";
        }
        return "合作中";
    }

    private void addRepurchaseBoardWarnings(IncentiveBoard board) {
        RepurchaseMetrics metrics = board.getRepurchase();
        if (metrics.getRetentionSample() == null || metrics.getRetentionSample() == 0) {
            board.getWarnings().add("老客留存暂无样本，复购激励暂不计入。");
        } else if (!Boolean.TRUE.equals(metrics.getRetentionEligible())) {
            board.getWarnings().add("老客 60 天留存未达门槛，复购激励暂不计入，潜力金额仅供参考。");
        }
        if (Boolean.FALSE.equals(metrics.getConversionSampleSufficient())) {
            board.getWarnings().add("新客 30 天样本不足 " + metrics.getMinNewSample()
                    + " 人，30 天档位暂不计入；10 天复购不受此限制。");
        }
    }

    private void addRepurchaseWarnings(List<String> warnings, List<IncentiveBoard> boards) {
        Set<String> existing = new HashSet<>(warnings);
        for (IncentiveBoard board : boards) {
            for (String warning : board.getWarnings()) {
                if (warning.startsWith("老客") || warning.startsWith("新客")) {
                    existing.add(warning);
                }
            }
        }
        warnings.clear();
        warnings.addAll(existing);
    }

    private void addConfigWarnings(List<String> warnings, BoardContext context) {
        if (context.bundle.isUsingDefault()) {
            warnings.add("当前月份未配置激励参数，使用系统默认值；请在参数设置中保存一版正式参数。");
        }
        long unbound = context.bundle.getTrainingProjects().stream()
                .filter(p -> p.getProjectId() == null)
                .count();
        if (unbound > 0) {
            warnings.add("有 " + unbound + " 个培训项目尚未绑定线上项目 ID，暂按部位/时长匹配，建议绑定后复核。");
        }
        warnings.add("店长奖励、培训补贴与其他调整可能与现有手工结算重复，请财务在正式结算前核对。");
        warnings.add("复购按首单月归属，二次到店统计至 " + context.cutoff
                + "；个税为预估，最终以财务结算为准。");
    }

    private Map<Long, Shop> shopsOf(List<Massagist> massagists) {
        return shopsByIds(massagists.stream().map(Massagist::getShopId).collect(Collectors.toList()));
    }

    private Map<Long, Shop> shopsByIds(List<Long> ids) {
        List<Long> clean = ids.stream().filter(id -> id != null && id > 0).distinct()
                .collect(Collectors.toList());
        if (clean.isEmpty()) {
            return new HashMap<>();
        }
        return shopService.listByIds(clean).stream()
                .collect(Collectors.toMap(Shop::getId, s -> s, (a, b) -> a));
    }

    private Map<Long, Massagist> massagistsByIds(List<Long> ids) {
        List<Long> clean = ids.stream().filter(id -> id != null && id > 0).distinct()
                .collect(Collectors.toList());
        if (clean.isEmpty()) {
            return new HashMap<>();
        }
        return massagistService.listByIds(clean).stream()
                .collect(Collectors.toMap(Massagist::getId, m -> m, (a, b) -> a));
    }

    private int positive(Integer value, int fallback) {
        return value == null || value < 1 ? fallback : value;
    }

    private void requireNotFuture(String month) {
        if (IncentiveMath.parseMonth(month).isAfter(YearMonth.now())) {
            throw new BusinessException("不能查看未来月份的数据");
        }
    }

    private int nonNegative(Integer value, int fallback) {
        return value == null || value < 0 ? fallback : value;
    }

    private String csv(String value) {
        if (value == null) {
            return "";
        }
        String safe = value.replace("\"", "\"\"");
        if (safe.startsWith("=") || safe.startsWith("+") || safe.startsWith("-")
                || safe.startsWith("@")) {
            safe = "'" + safe;
        }
        return "\"" + safe + "\"";
    }

    private static class BoardContext {
        private String month;
        private LocalDate asOf;
        private LocalDate cutoff;
        private Long scopeShopId;
        private List<Long> scopeShopIds;
        private IncentiveConfigBundle bundle;
        private List<Massagist> massagists = new ArrayList<>();
        private Map<Long, String> massagistNames = new HashMap<>();
        private Map<Long, String> shopNames = new HashMap<>();
        private Map<Long, List<ServiceDetailRow>> detailsByMassagist = new HashMap<>();
        private Map<Long, BigDecimal> adjustmentsByMassagist = new HashMap<>();
        private Map<String, MassagistTrainingCert> certsByKey = new HashMap<>();
        private Map<Long, List<TrainingOrder>> trainingOrdersByMassagist = new HashMap<>();
        private List<CustomerVisit> visits = new ArrayList<>();
        private List<ShopIncentiveTarget> targets = new ArrayList<>();
        private Map<Long, List<ShopIncentiveTarget>> targetsByManager = new HashMap<>();
        private Map<Long, BigDecimal> revenueByShop = new HashMap<>();
        private Map<Long, BigDecimal> otherAmounts = new HashMap<>();
        private Map<Long, List<SalaryRecord>> priorSalaryByMassagist = new HashMap<>();
        private List<String> warnings = new ArrayList<>();
    }
}
