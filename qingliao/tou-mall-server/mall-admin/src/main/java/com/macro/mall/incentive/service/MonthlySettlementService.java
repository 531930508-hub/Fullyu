package com.macro.mall.incentive.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.macro.mall.common.exception.BusinessException;
import com.macro.mall.incentive.calc.IncentiveMath;
import com.macro.mall.incentive.entity.AdminMessage;
import com.macro.mall.incentive.dto.IncentiveConfigBundle;
import com.macro.mall.incentive.entity.MonthlySettlement;
import com.macro.mall.incentive.mapper.MonthlySettlementMapper;
import com.macro.mall.incentive.model.IncentiveBoard;
import com.macro.mall.entity.Shop;
import com.macro.mall.service.shop.ShopService;
import com.macro.mall.service.base.BaseService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.CollectionUtils;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * 月度结算单：把激励看板的实时预估固化为快照。
 *
 * <p>状态机：DRAFT（草稿，可反复生成覆盖）→ CONFIRMED（财务确认，金额冻结）
 * → PUBLISHED（已发布，疗愈师可见并收到站内消息）。冻结后不接受重新生成，
 * 需要改口径必须由超级管理员撤销确认。结算单只用来看数与发放依据，
 * 真正的发放仍需走财务审批与打款流程。</p>
 */
@Service
public class MonthlySettlementService extends BaseService<MonthlySettlementMapper, MonthlySettlement> {

    private static final Logger LOGGER = LoggerFactory.getLogger(MonthlySettlementService.class);

    @Autowired
    private IncentiveDataService dataService;

    @Autowired
    private IncentiveAccessService accessService;

    @Autowired
    private AdminMessageService messageService;

    @Autowired
    private ShopService shopService;

    @Autowired
    private ObjectMapper objectMapper;

    // ------------------------------------------------------------------
    // 生成快照
    // ------------------------------------------------------------------

    /**
     * 手工生成（财务/运营/店长）。店长只能生成自己授权门店。
     */
    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> generate(String month, Long requestedShopId) {
        accessService.requireManagement();
        List<Long> scope = accessService.authorizedShopIds();
        if (requestedShopId != null) {
            accessService.requireShopAccess(requestedShopId);
            scope = Collections.singletonList(requestedShopId);
        }
        if (scope != null && scope.isEmpty()) {
            throw new BusinessException("当前账号尚未配置可查看门店");
        }
        return doGenerate(month, scope, accessService.currentOperatorName());
    }

    /**
     * 定时任务：全部门店、全部合作状态，每月 2 号补齐上月结算草稿。
     */
    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> generateAutomatically(String month) {
        return doGenerate(month, null, "系统");
    }

    private Map<String, Object> doGenerate(String month, List<Long> scopeShopIds, String operator) {
        String selected = IncentiveMath.normalizeMonth(month);
        if (IncentiveMath.monthStart(selected).isAfter(LocalDate.now())) {
            throw new BusinessException("不能生成未来月份的结算单");
        }
        List<IncentiveBoard> boards = dataService.settlementBoards(selected);
        Map<Long, MonthlySettlement> existing = list(new LambdaQueryWrapper<MonthlySettlement>()
                .eq(MonthlySettlement::getMonthCode, selected))
                .stream()
                .collect(Collectors.toMap(MonthlySettlement::getMassagistId, m -> m, (a, b) -> a));

        IncentiveConfigBundle bundle = dataService.config(selected);
        Integer revision = bundle.getConfig() == null ? null : bundle.getConfig().getRevision();
        boolean usingDefault = bundle.isUsingDefault();
        LocalDateTime now = LocalDateTime.now();
        int generated = 0;
        int refreshed = 0;
        int skippedFrozen = 0;
        int skippedEmpty = 0;
        BigDecimal totalNet = BigDecimal.ZERO;
        Map<Long, Integer> shopCount = new LinkedHashMap<>();
        Map<Long, BigDecimal> shopNet = new LinkedHashMap<>();
        Set<Long> frozenShops = new HashSet<>();

        for (IncentiveBoard board : boards) {
            Long shopId = board.getShopId();
            if (scopeShopIds != null && (shopId == null || !scopeShopIds.contains(shopId))) {
                continue;
            }
            MonthlySettlement row = existing.get(board.getMassagistId());
            if (row != null && !row.isDraft()) {
                skippedFrozen++;
                if (shopId != null) {
                    frozenShops.add(shopId);
                }
                continue;
            }
            BigDecimal subtotal = zero(board.getSettlement().getSubtotal());
            BigDecimal minutes = zero(board.getBase().getMinutes());
            if (subtotal.signum() == 0 && minutes.signum() == 0) {
                skippedEmpty++;
                continue;
            }
            boolean isNew = row == null;
            if (isNew) {
                row = new MonthlySettlement();
                row.setMonthCode(selected);
                row.setMassagistId(board.getMassagistId());
            }
            fillFromBoard(row, board, revision, usingDefault);
            row.setGeneratedBy(operator);
            row.setGeneratedTime(now);
            if (isNew) {
                save(row);
                generated++;
            } else {
                updateById(row);
                refreshed++;
            }
            totalNet = totalNet.add(zero(row.getNet()));
            if (shopId != null) {
                shopCount.merge(shopId, 1, Integer::sum);
                shopNet.merge(shopId, zero(row.getNet()), BigDecimal::add);
            }
        }

        if (generated + refreshed > 0) {
            // 全局一条汇总 + 每家门店一条（门店消息在 notifySettlementSummary 内按店长范围过滤）
            messageService.notifySettlementSummary(AdminMessage.TYPE_SETTLEMENT_DRAFT, selected, null, null,
                    generated + refreshed, totalNet, true, false);
            for (Map.Entry<Long, Integer> entry : shopCount.entrySet()) {
                messageService.notifySettlementSummary(AdminMessage.TYPE_SETTLEMENT_DRAFT, selected,
                        entry.getKey(), shopName(entry.getKey()), entry.getValue(),
                        shopNet.getOrDefault(entry.getKey(), BigDecimal.ZERO), false, true);
            }
        }

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("month", selected);
        result.put("generated", generated);
        result.put("refreshed", refreshed);
        result.put("skippedFrozen", skippedFrozen);
        result.put("skippedEmpty", skippedEmpty);
        result.put("totalNet", scale(totalNet));
        result.put("frozenShops", frozenShops.size());
        LOGGER.info("结算单生成 month={} operator={} generated={} refreshed={} frozen={} empty={}",
                selected, operator, generated, refreshed, skippedFrozen, skippedEmpty);
        return result;
    }

    private void fillFromBoard(MonthlySettlement row, IncentiveBoard board, Integer revision,
                               boolean usingDefault) {
        row.setShopId(board.getShopId());
        row.setShopName(board.getShopName());
        row.setMassagistName(board.getMassagistName());
        row.setCooperationStatus(board.getCooperationStatus());
        row.setStatus(MonthlySettlement.STATUS_DRAFT);
        row.setConfigRevision(revision);
        row.setUsingDefaultConfig(usingDefault);
        row.setBaseAmount(scale(board.getBase().getAmount()));
        row.setManagerAmount(scale(board.getManager().getTotalAmount()));
        row.setTrainingAmount(scale(board.getTraining().getEarnedAmount()));
        row.setRepurchaseAmount(scale(board.getRepurchase().getTotalAmount()));
        row.setRepurchasePotential(scale(board.getRepurchase().getPotentialAmount()));
        row.setAdjustmentAmount(scale(board.getSettlement().getAdjustment()));
        row.setSubtotal(scale(board.getSettlement().getSubtotal()));
        row.setGross(scale(board.getSettlement().getGross()));
        row.setPreTax(scale(board.getSettlement().getPreTax()));
        row.setTax(scale(board.getSettlement().getTax()));
        row.setNet(scale(board.getSettlement().getNet()));
        row.setCountedMinutes(scale(board.getBase().getMinutes()));
        row.setWarnings(toJson(board.getWarnings()));
        row.setDetailJson(toJson(board));
        // 重新生成会覆盖草稿金额，清空上一次的确认痕迹
        row.setConfirmedBy(null);
        row.setConfirmedTime(null);
        row.setPublishedBy(null);
        row.setPublishedTime(null);
    }

    // ------------------------------------------------------------------
    // 查询
    // ------------------------------------------------------------------

    public Map<String, Object> page(String month, Long requestedShopId, String status, String keyword,
                                    Integer pageNo, Integer pageSize) {
        accessService.requireManagement();
        String selected = IncentiveMath.normalizeMonth(month);
        Long shopId = accessService.isGlobal()
                ? requestedShopId
                : accessService.resolveShopId(requestedShopId);
        int no = pageNo == null || pageNo < 1 ? 1 : pageNo;
        int size = pageSize == null || pageSize < 1 ? 20 : Math.min(pageSize, 200);
        Page<MonthlySettlement> page = page(new Page<>(no, size),
                buildWrapper(selected, shopId, status, keyword));
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("list", page.getRecords());
        result.put("total", page.getTotal());
        result.put("pageNum", no);
        result.put("pageSize", size);
        return result;
    }

    public Map<String, Object> overview(String month, Long requestedShopId) {
        accessService.requireManagement();
        String selected = IncentiveMath.normalizeMonth(month);
        Long shopId = accessService.isGlobal()
                ? requestedShopId
                : accessService.resolveShopId(requestedShopId);
        if (shopId != null) {
            accessService.requireShopAccess(shopId);
        }
        List<MonthlySettlement> rows = list(buildWrapper(selected, shopId, null, null));

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("month", selected);
        result.put("shopId", shopId);
        result.put("shopName", shopId == null ? "全部门店" : shopName(shopId));
        result.put("count", rows.size());

        int draft = 0;
        int confirmed = 0;
        int published = 0;
        int warningRows = 0;
        int repurchasePending = 0;
        BigDecimal totalSubtotal = BigDecimal.ZERO;
        BigDecimal totalNet = BigDecimal.ZERO;
        BigDecimal totalTax = BigDecimal.ZERO;
        BigDecimal totalPotential = BigDecimal.ZERO;
        BigDecimal draftNet = BigDecimal.ZERO;
        BigDecimal confirmedNet = BigDecimal.ZERO;
        LocalDateTime lastGenerated = null;
        Map<Long, Map<String, Object>> byShop = new LinkedHashMap<>();

        for (MonthlySettlement row : rows) {
            totalSubtotal = totalSubtotal.add(zero(row.getSubtotal()));
            totalNet = totalNet.add(zero(row.getNet()));
            totalTax = totalTax.add(zero(row.getTax()));
            totalPotential = totalPotential.add(zero(row.getRepurchasePotential())
                    .subtract(zero(row.getRepurchaseAmount())));
            if (row.isDraft()) {
                draft++;
                draftNet = draftNet.add(zero(row.getNet()));
            } else if (row.isConfirmed()) {
                confirmed++;
                confirmedNet = confirmedNet.add(zero(row.getNet()));
            } else if (row.isPublished()) {
                published++;
            }
            if (row.getWarnings() != null && !row.getWarnings().isEmpty()
                    && !"[]".equals(row.getWarnings())) {
                warningRows++;
            }
            if (zero(row.getRepurchasePotential()).compareTo(zero(row.getRepurchaseAmount())) > 0) {
                repurchasePending++;
            }
            if (lastGenerated == null || (row.getGeneratedTime() != null
                    && row.getGeneratedTime().isAfter(lastGenerated))) {
                lastGenerated = row.getGeneratedTime();
            }
            Long key = row.getShopId() == null ? -1L : row.getShopId();
            Map<String, Object> shopAgg = byShop.computeIfAbsent(key, k -> {
                Map<String, Object> agg = new LinkedHashMap<>();
                agg.put("shopId", row.getShopId());
                agg.put("shopName", row.getShopName());
                agg.put("count", 0);
                agg.put("net", BigDecimal.ZERO);
                agg.put("draftCount", 0);
                agg.put("confirmedCount", 0);
                agg.put("publishedCount", 0);
                return agg;
            });
            shopAgg.put("count", (Integer) shopAgg.get("count") + 1);
            shopAgg.put("net", ((BigDecimal) shopAgg.get("net")).add(zero(row.getNet())));
            if (row.isDraft()) {
                shopAgg.put("draftCount", (Integer) shopAgg.get("draftCount") + 1);
            } else if (row.isConfirmed()) {
                shopAgg.put("confirmedCount", (Integer) shopAgg.get("confirmedCount") + 1);
            } else if (row.isPublished()) {
                shopAgg.put("publishedCount", (Integer) shopAgg.get("publishedCount") + 1);
            }
        }

        List<Map<String, Object>> shops = new ArrayList<>(byShop.values());
        shops.sort(Comparator.comparing((Map<String, Object> m) -> (BigDecimal) m.get("net")).reversed());

        result.put("draftCount", draft);
        result.put("confirmedCount", confirmed);
        result.put("publishedCount", published);
        result.put("warningRows", warningRows);
        result.put("repurchasePending", repurchasePending);
        result.put("totalSubtotal", scale(totalSubtotal));
        result.put("totalNet", scale(totalNet));
        result.put("totalTax", scale(totalTax));
        result.put("totalPotential", scale(totalPotential));
        result.put("draftNet", scale(draftNet));
        result.put("confirmedNet", scale(confirmedNet));
        result.put("lastGeneratedTime", lastGenerated);
        result.put("shops", shops);
        return result;
    }

    public Map<String, Object> detail(Long id) {
        accessService.requireManagement();
        MonthlySettlement row = requireSettlement(id);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("settlement", row);
        result.put("board", parseBoard(row.getDetailJson()));
        return result;
    }

    /**
     * 疗愈师本人某月的已发布结算单：未发布（草稿/确认中/未生成）返回 settled=false。
     * 只暴露 PUBLISHED 状态，未发布的金额对疗愈师不可见。
     */
    public Map<String, Object> mine(String month) {
        Long massagistId = accessService.currentMassagistId();
        String selected = IncentiveMath.normalizeMonth(month);
        MonthlySettlement row = getOne(new LambdaQueryWrapper<MonthlySettlement>()
                .eq(MonthlySettlement::getMonthCode, selected)
                .eq(MonthlySettlement::getMassagistId, massagistId)
                .eq(MonthlySettlement::getStatus, MonthlySettlement.STATUS_PUBLISHED)
                .last("limit 1"), false);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("month", selected);
        result.put("settled", row != null);
        result.put("settlement", row);
        return result;
    }

    public boolean updateRemark(Long id, String remark) {
        accessService.requireManagement();
        requireSettlement(id);
        if (remark != null && remark.length() > 255) {
            throw new BusinessException("备注不能超过 255 字");
        }
        MonthlySettlement row = new MonthlySettlement();
        row.setId(id);
        row.setRemark(remark);
        return updateById(row);
    }

    // ------------------------------------------------------------------
    // 确认 / 发布 / 撤销
    // ------------------------------------------------------------------

    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> confirm(List<Long> ids, String month, Long requestedShopId) {
        accessService.requireGlobal();
        List<MonthlySettlement> rows = selectForAction(ids, month, requestedShopId,
                MonthlySettlement.STATUS_DRAFT);
        if (rows.isEmpty()) {
            throw new BusinessException("没有可确认的草稿结算单");
        }
        String operator = accessService.currentOperatorName();
        LocalDateTime now = LocalDateTime.now();
        for (MonthlySettlement row : rows) {
            row.setStatus(MonthlySettlement.STATUS_CONFIRMED);
            row.setConfirmedBy(operator);
            row.setConfirmedTime(now);
            updateById(row);
        }
        notifySummary(AdminMessage.TYPE_SETTLEMENT_CONFIRMED, rows);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("confirmed", rows.size());
        result.put("totalNet", scale(rows.stream().map(r -> zero(r.getNet()))
                .reduce(BigDecimal.ZERO, BigDecimal::add)));
        return result;
    }

    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> publish(List<Long> ids, String month, Long requestedShopId) {
        accessService.requireGlobal();
        List<MonthlySettlement> rows = selectForAction(ids, month, requestedShopId,
                MonthlySettlement.STATUS_CONFIRMED);
        if (rows.isEmpty()) {
            throw new BusinessException("没有已确认待发布的结算单");
        }
        String operator = accessService.currentOperatorName();
        LocalDateTime now = LocalDateTime.now();
        for (MonthlySettlement row : rows) {
            row.setStatus(MonthlySettlement.STATUS_PUBLISHED);
            row.setPublishedBy(operator);
            row.setPublishedTime(now);
            updateById(row);
        }
        notifySummary(AdminMessage.TYPE_SETTLEMENT_PUBLISHED, rows);
        for (MonthlySettlement row : rows) {
            messageService.notifySettlementPublishedToTherapist(row);
        }
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("published", rows.size());
        result.put("totalNet", scale(rows.stream().map(r -> zero(r.getNet()))
                .reduce(BigDecimal.ZERO, BigDecimal::add)));
        return result;
    }

    @Transactional(rollbackFor = Exception.class)
    public boolean reopen(Long id) {
        accessService.requireSuperAdmin();
        MonthlySettlement row = requireSettlement(id);
        if (!row.isConfirmed()) {
            throw new BusinessException("只有已确认的结算单可以撤销，已发布请先线下沟通");
        }
        row.setStatus(MonthlySettlement.STATUS_DRAFT);
        row.setConfirmedBy(null);
        row.setConfirmedTime(null);
        return updateById(row);
    }

    private List<MonthlySettlement> selectForAction(List<Long> ids, String month, Long requestedShopId,
                                                    String requiredStatus) {
        String selected = month == null ? null : IncentiveMath.normalizeMonth(month);
        List<MonthlySettlement> rows;
        if (!CollectionUtils.isEmpty(ids)) {
            rows = listByIds(ids);
        } else {
            if (selected == null) {
                throw new BusinessException("请选择结算月份或勾选记录");
            }
            Long shopId = requestedShopId;
            if (shopId != null) {
                accessService.requireShopAccess(shopId);
            }
            rows = list(buildWrapper(selected, shopId, requiredStatus, null));
        }
        List<MonthlySettlement> result = new ArrayList<>();
        for (MonthlySettlement row : rows) {
            if (!requiredStatus.equals(row.getStatus())) {
                continue;
            }
            accessService.requireShopAccess(row.getShopId());
            result.add(row);
        }
        result.sort(Comparator.comparing(MonthlySettlement::getId));
        return result;
    }

    private void notifySummary(String type, List<MonthlySettlement> rows) {
        String month = rows.get(0).getMonthCode();
        BigDecimal total = rows.stream().map(r -> zero(r.getNet()))
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        messageService.notifySettlementSummary(type, month, null, null, rows.size(), total, true, false);
        Map<Long, List<MonthlySettlement>> byShop = rows.stream()
                .filter(r -> r.getShopId() != null)
                .collect(Collectors.groupingBy(MonthlySettlement::getShopId, LinkedHashMap::new, Collectors.toList()));
        byShop.forEach((shopId, group) -> messageService.notifySettlementSummary(type, month, shopId,
                group.get(0).getShopName(), group.size(),
                group.stream().map(r -> zero(r.getNet())).reduce(BigDecimal.ZERO, BigDecimal::add),
                false, true));
    }

    // ------------------------------------------------------------------
    // 导出
    // ------------------------------------------------------------------

    @Transactional(readOnly = true)
    public String exportCsv(String month, Long requestedShopId, String status) {
        accessService.requireManagement();
        String selected = IncentiveMath.normalizeMonth(month);
        Long shopId = accessService.isGlobal()
                ? requestedShopId
                : accessService.resolveShopId(requestedShopId);
        List<MonthlySettlement> rows = list(buildWrapper(selected, shopId, status, null));
        StringBuilder csv = new StringBuilder();
        csv.append('\ufeff');
        csv.append("结算月份,门店,疗愈师,合作状态,状态,基础薪资,店长奖励,培训奖励,复购激励,复购潜力,")
                .append("其他调整,小计,含服务费金额,税前,个税,应发,折算时长(分钟),参数版本,确认人,确认时间,发布人,发布时间\n");
        for (MonthlySettlement row : rows) {
            csv.append(csv(row.getMonthCode())).append(',')
                    .append(csv(row.getShopName())).append(',')
                    .append(csv(row.getMassagistName())).append(',')
                    .append(csv(row.getCooperationStatus())).append(',')
                    .append(statusLabel(row.getStatus())).append(',')
                    .append(zero(row.getBaseAmount())).append(',')
                    .append(zero(row.getManagerAmount())).append(',')
                    .append(zero(row.getTrainingAmount())).append(',')
                    .append(zero(row.getRepurchaseAmount())).append(',')
                    .append(zero(row.getRepurchasePotential())).append(',')
                    .append(zero(row.getAdjustmentAmount())).append(',')
                    .append(zero(row.getSubtotal())).append(',')
                    .append(zero(row.getGross())).append(',')
                    .append(zero(row.getPreTax())).append(',')
                    .append(zero(row.getTax())).append(',')
                    .append(zero(row.getNet())).append(',')
                    .append(zero(row.getCountedMinutes())).append(',')
                    .append(row.getConfigRevision() == null ? "" : "v" + row.getConfigRevision()).append(',')
                    .append(csv(row.getConfirmedBy())).append(',')
                    .append(row.getConfirmedTime() == null ? "" : row.getConfirmedTime()).append(',')
                    .append(csv(row.getPublishedBy())).append(',')
                    .append(row.getPublishedTime() == null ? "" : row.getPublishedTime()).append('\n');
        }
        return csv.toString();
    }

    public static String statusLabel(String status) {
        if (MonthlySettlement.STATUS_DRAFT.equals(status)) {
            return "草稿";
        }
        if (MonthlySettlement.STATUS_CONFIRMED.equals(status)) {
            return "已确认";
        }
        if (MonthlySettlement.STATUS_PUBLISHED.equals(status)) {
            return "已发布";
        }
        return status;
    }

    // ------------------------------------------------------------------
    // 内部工具
    // ------------------------------------------------------------------

    private LambdaQueryWrapper<MonthlySettlement> buildWrapper(String month, Long shopId,
                                                               String status, String keyword) {
        LambdaQueryWrapper<MonthlySettlement> lqw = new LambdaQueryWrapper<MonthlySettlement>()
                .eq(MonthlySettlement::getMonthCode, month);
        if (shopId != null) {
            lqw.eq(MonthlySettlement::getShopId, shopId);
        }
        if (status != null && !status.trim().isEmpty()) {
            lqw.eq(MonthlySettlement::getStatus, status.trim().toUpperCase());
        }
        if (keyword != null && !keyword.trim().isEmpty()) {
            String kw = keyword.trim();
            lqw.and(w -> w.like(MonthlySettlement::getMassagistName, kw)
                    .or().like(MonthlySettlement::getShopName, kw));
        }
        List<Long> scope = accessService.authorizedShopIds();
        if (scope != null) {
            if (scope.isEmpty()) {
                // 没有门店权限时返回空集，避免 SQL IN () 语法错误
                lqw.eq(MonthlySettlement::getShopId, -1L);
            } else {
                lqw.in(MonthlySettlement::getShopId, scope);
            }
        }
        lqw.orderByDesc(MonthlySettlement::getNet).orderByAsc(MonthlySettlement::getMassagistId);
        return lqw;
    }

    private MonthlySettlement requireSettlement(Long id) {
        if (id == null) {
            throw new BusinessException("结算单不能为空");
        }
        MonthlySettlement row = getById(id);
        if (row == null) {
            throw new BusinessException("结算单不存在");
        }
        accessService.requireShopAccess(row.getShopId());
        return row;
    }

    private String shopName(Long shopId) {
        if (shopId == null) {
            return null;
        }
        Shop shop = shopService.getById(shopId);
        return shop == null ? "门店" + shopId : shop.getName();
    }

    private IncentiveBoard parseBoard(String json) {
        if (json == null || json.trim().isEmpty()) {
            return null;
        }
        try {
            return objectMapper.readValue(json, IncentiveBoard.class);
        } catch (Exception e) {
            LOGGER.warn("结算单快照解析失败", e);
            return null;
        }
    }

    private String toJson(Object value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (Exception e) {
            LOGGER.warn("结算单快照序列化失败", e);
            return null;
        }
    }

    private static BigDecimal zero(BigDecimal value) {
        return value == null ? BigDecimal.ZERO : value;
    }

    private static BigDecimal scale(BigDecimal value) {
        return zero(value).setScale(2, RoundingMode.HALF_UP);
    }

    private static String csv(String value) {
        if (value == null) {
            return "";
        }
        if (value.contains(",") || value.contains("\"") || value.contains("\n")) {
            return "\"" + value.replace("\"", "\"\"") + "\"";
        }
        return value;
    }
}