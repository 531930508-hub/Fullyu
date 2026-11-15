package com.macro.mall.service;

import com.alibaba.fastjson2.JSONArray;
import com.alibaba.fastjson2.JSONObject;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.github.pagehelper.PageHelper;
import com.github.pagehelper.PageInfo;
import com.macro.mall.common.exception.BusinessException;
import com.macro.mall.dto.ApprovalFlowNodeBrief;
import com.macro.mall.dto.ApprovalResolvedNode;
import com.macro.mall.entity.Approval;
import com.macro.mall.entity.ApprovalCategory;
import com.macro.mall.entity.ApprovalDetail;
import com.macro.mall.entity.ApprovalFlowNode;
import com.macro.mall.entity.MassagistLeave;
import com.macro.mall.enums.FlowState;
import com.macro.mall.enums.FlowUserType;
import com.macro.mall.enums.approval.ApprovalNodeMode;
import com.macro.mall.enums.approval.FlowCategoryCode;
import com.macro.mall.mapper.ApprovalDetailMapper;
import com.macro.mall.service.base.BaseService;
import com.macro.mall.service.base.WrapperBuilder;
import com.macro.mall.utils.ContextUtil;
import com.macro.mall.utils.DateUtil;
import org.apache.logging.log4j.util.Strings;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.CollectionUtils;
import org.springframework.util.ObjectUtils;

import java.time.LocalDateTime;
import java.util.*;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * 审批详情 服务类
 *
 * @author zkl
 * @date 2025/06/10
 */
@Service
public class ApprovalDetailService extends BaseService<ApprovalDetailMapper, ApprovalDetail> {
    @Autowired
    ApprovalCategoryService approvalCategoryService;
    @Autowired
    ApprovalService approvalService;
    @Autowired
    AdminApprovalNoticeService noticeService;
    @Autowired
    ApprovalFlowNodeService approvalFlowNodeService;
    @Autowired
    @org.springframework.context.annotation.Lazy
    com.macro.mall.service.approval.RefundApplyService refundApplyService;
    @Autowired
    com.macro.mall.service.base.ShopScopeService shopScopeService;
    /** 请假申请与审批明细双向依赖，懒加载避免启动期循环。 */
    @Autowired
    @org.springframework.context.annotation.Lazy
    MassagistLeaveService massagistLeaveService;

    private void captureNotice(Long approvalId) {
        if (noticeService != null) noticeService.capture(approvalId);
    }

    @Override
    protected QueryWrapper<ApprovalDetail> buildWrapper(Map<String, Object> params, QueryWrapper<ApprovalDetail> queryWrapper) {
        if (params.get("approval_ids") != null) {
            queryWrapper.in("approval_id", params.get("approval_ids").toString().split(","));
        }
        if (params.get("category_ids") != null) {
            String[] categoryIds = Arrays.stream(params.get("category_ids").toString().split(","))
                    .map(String::trim).filter(Strings::isNotBlank).toArray(String[]::new);
            if (categoryIds.length > 0) queryWrapper.in("category_id", (Object[]) categoryIds);
        }
        queryWrapper.eq("target_user_id", currentUserId());
        return WrapperBuilder.init(queryWrapper, params)
                .in("state")
                .equal("approval_id")
                .equal("flow_user_type")
                .between("create_time")
                .equal("category_id")
                .getQueryWrapper();
    }

    @Transactional(rollbackFor = Exception.class)
    public Long addRelationOrderId(Long orderId, Long shopId, FlowCategoryCode categoryCode, Long createUser) {
        return add(orderId, null, shopId, categoryCode, createUser);
    }

    @Transactional(rollbackFor = Exception.class)
    public Long addRelationCustomerId(Long customerId, Long shopId, FlowCategoryCode categoryCode, Long createUser) {
        return add(null, customerId, shopId, categoryCode, createUser);
    }

    @Transactional(rollbackFor = Exception.class)
    public Long addRelationMassagistLeaveId(Long shopId, FlowCategoryCode categoryCode, Long createUser,int number) {
        return addLeave(null, null, shopId, categoryCode, createUser,number);
    }
    /**
     * 请假审批入口。number 为历史参数（请假日期含今天时传 2），当天请假审批链路提到店长及以上。
     */
    @Transactional(rollbackFor = Exception.class)
    public Long addLeave(Long orderId, Long customerId, Long shopId, FlowCategoryCode categoryCode, Long createUser, int number) {
        return add(orderId, customerId, shopId, categoryCode, createUser, number == 2);
    }

    /**
     * 按节点快照生成审批明细：第一个节点为审批中，其余待提交；同一节点多人时共享 level。
     */
    private List<ApprovalDetail> buildDetails(Approval approval, ApprovalCategory category,
                                              List<ApprovalResolvedNode> nodes, Long createUser,
                                              List<Long> ccIds, LocalDateTime nowTime) {
        List<ApprovalDetail> detailList = new ArrayList<>();
        detailList.add(ApprovalDetail.builder()
                .approvalId(approval.getId())
                .categoryId(category.getId())
                .level(0)
                .targetUserId(createUser)
                .startTime(nowTime)
                .finishTime(nowTime)
                .flowUserType(FlowUserType.CREATE.getValue())
                .state(FlowState.PASSED.getValue())
                .createUser(createUser)
                .build());
        int level = 1;
        for (ApprovalResolvedNode node : nodes) {
            boolean firstNode = level == 1;
            for (Long adminId : node.getAdminIds()) {
                detailList.add(ApprovalDetail.builder()
                        .approvalId(approval.getId())
                        .categoryId(category.getId())
                        .level(level)
                        .nodeName(node.getNodeName())
                        .approveMode(node.getApproveMode())
                        .targetUserId(adminId)
                        .flowUserType(FlowUserType.APPROVAL.getValue())
                        .state(firstNode ? FlowState.APPROVING.getValue() : FlowState.NOT_SUBMIT.getValue())
                        .startTime(firstNode ? nowTime : null)
                        .createUser(createUser)
                        .build());
            }
            level++;
        }
        if (ccIds != null) {
            for (Long ccId : ccIds) {
                detailList.add(ApprovalDetail.builder()
                        .approvalId(approval.getId())
                        .categoryId(category.getId())
                        .level(0)
                        .targetUserId(ccId)
                        .flowUserType(FlowUserType.CC.getValue())
                        .createUser(createUser)
                        .build());
            }
        }
        return detailList;
    }

    /**
     * 解析审批流：优先用节点配置（岗位/指定人、或签/会签）；没有节点时回退旧的 approvalIds 逐人顺序审批。
     * 节点里全是发起人本人或人员已离职/停用时，该节点自动跳过。
     */
    private List<ApprovalResolvedNode> resolveNodes(ApprovalCategory category, Long shopId, Long createUser) {
        return resolveNodes(category, shopId, createUser, false);
    }

    /**
     * @param sameDayLeave 请假分类且没配节点时，按内置规则组链：提前请假只到店长，当天请假再加二级审批人（总部CEO）
     */
    private List<ApprovalResolvedNode> resolveNodes(ApprovalCategory category, Long shopId, Long createUser, boolean sameDayLeave) {
        List<ApprovalFlowNode> nodes = approvalFlowNodeService.listByCategoryId(category.getId());
        if (!nodes.isEmpty()) {
            List<ApprovalResolvedNode> resolved = approvalFlowNodeService.resolveNodes(nodes, shopId, createUser);
            if (resolved.isEmpty()) {
                throw new BusinessException("审批流程中的审批人当前都不可用（可能已离职或停用），请联系管理员调整审批设置");
            }
            return resolved;
        }
        // 没配节点：请假走内置规则（取不到店长/二级审批人时由内置规则直接拦下）
        if (FlowCategoryCode.ASK_FOR_LEAVE.getCode().equals(category.getCode())) {
            return approvalFlowNodeService.resolveLeaveChain(shopId, createUser, sameDayLeave);
        }
        List<ApprovalResolvedNode> resolved = legacyNodes(category, createUser, null);
        if (resolved.isEmpty()) {
            throw new BusinessException("审批流程未配置审批人，请联系管理员在审批设置中配置");
        }
        return resolved;
    }

    /** 旧版逐人顺序审批：approvalIds 里每个人一个节点，已在内置节点里的人跳过。 */
    private List<ApprovalResolvedNode> legacyNodes(ApprovalCategory category, Long createUser, Collection<Long> skip) {
        List<ApprovalResolvedNode> legacyNodes = new ArrayList<>();
        for (Long adminId : ApprovalCategoryService.parseUsers(category.getApprovalIds(), true)) {
            if (adminId.equals(createUser)) continue;
            if (skip != null && skip.contains(adminId)) continue;
            ApprovalResolvedNode legacy = new ApprovalResolvedNode();
            legacy.setNodeName(null);
            legacy.setApproveMode(ApprovalNodeMode.ANY.getCode());
            legacy.setAdminIds(new ArrayList<>(Collections.singletonList(adminId)));
            legacyNodes.add(legacy);
        }
        return legacyNodes;
    }

    private List<Long> resolveCcIds(ApprovalCategory category) {
        return ApprovalCategoryService.parseUsers(category.getCcIds(), false);
    }

    /**
     * 批量添加审批
     *
     * @param customerIdList
     * @param shopId
     * @param categoryCode
     * @param createUser
     * @return
     */
    @Transactional(rollbackFor = Exception.class)
    public Map<Long, Long> addBatch(List<Long> customerIdList, Long shopId, FlowCategoryCode categoryCode, Long createUser) {
        ApprovalCategory flowCategory = approvalCategoryService.findByCode(categoryCode, shopId);
        if (flowCategory == null) throw new BusinessException("审批流程未配置");
        List<ApprovalResolvedNode> nodes = resolveNodes(flowCategory, shopId, createUser);
        List<Long> ccIds = resolveCcIds(flowCategory);
        LocalDateTime nowTime = LocalDateTime.now();
        List<Approval> approvalList = new ArrayList<>();
        customerIdList.forEach(customerId -> {
            Approval approval = new Approval();
            approval.setCategoryId(flowCategory.getId());
            approval.setCategoryTitle(flowCategory.getTitle());
            approval.setState(FlowState.APPROVING.getValue());
            approval.setCreateUser(createUser);
            approval.setCustomerId(customerId);
            approvalList.add(approval);
        });
        if (!approvalService.saveBatch(approvalList) || approvalList.stream().anyMatch(a -> a.getId() == null))
            throw new BusinessException("审批主记录保存失败");
        List<ApprovalDetail> detailList = new ArrayList<>();
        approvalList.forEach(approval -> detailList.addAll(buildDetails(approval, flowCategory, nodes, createUser, ccIds, nowTime)));
        if (!saveBatch(detailList)) throw new BusinessException("审批节点保存失败");
        approvalList.forEach(a -> captureNotice(a.getId()));
        return approvalList.stream().collect(Collectors.toMap(Approval::getCustomerId, Approval::getId));
    }

    @Transactional(rollbackFor = Exception.class)
    public Long add(Long orderId, Long customerId, Long shopId, FlowCategoryCode categoryCode, Long createUser) {
        return add(orderId, customerId, shopId, categoryCode, createUser, false);
    }

    /**
     * 创建审批。
     *
     * @param sameDayLeave 当天请假：店长审批后再加二级审批人（总部CEO）；提前请假只到店长
     */
    @Transactional(rollbackFor = Exception.class)
    public Long add(Long orderId, Long customerId, Long shopId, FlowCategoryCode categoryCode, Long createUser, boolean sameDayLeave) {
        ApprovalCategory flowCategory = approvalCategoryService.findByCode(categoryCode, shopId);
        if (flowCategory == null) {
            throw new BusinessException("审批流程未配置");
        }
        List<ApprovalResolvedNode> nodes = resolveNodes(flowCategory, shopId, createUser,
                categoryCode == FlowCategoryCode.ASK_FOR_LEAVE && sameDayLeave);
        List<Long> ccIds = resolveCcIds(flowCategory);
        LocalDateTime nowTime = LocalDateTime.now();
        Approval approval = new Approval();
        approval.setCategoryId(flowCategory.getId());
        approval.setCategoryTitle(flowCategory.getTitle());
        approval.setState(FlowState.APPROVING.getValue());
        approval.setCreateUser(createUser);
        approval.setOrderId(orderId);
        approval.setCustomerId(customerId);
        if (!approvalService.save(approval) || approval.getId() == null) throw new BusinessException("审批主记录保存失败");
        List<ApprovalDetail> detailList = buildDetails(approval, flowCategory, nodes, createUser, ccIds, nowTime);
        if (!saveBatch(detailList)) throw new BusinessException("审批节点保存失败");
        captureNotice(approval.getId());
        return approval.getId();
    }


    /**
     * 通过
     *
     * @param detailId
     * @return
     */
    @Transactional(rollbackFor = Exception.class)
    public Long pass(Long detailId) {
        ApprovalDetail detail = checkAndGet(detailId);
        requireAssignedApprover(detail);
        Long approvalId = detail.getApprovalId();
        String key = "approvalId" + approvalId;
        synchronized (key.intern()) {
            detail = checkAndGet(detailId);
            requireAssignedApprover(detail);
            if (FlowState.PASSED.getValue().equals(detail.getState())) return detailId;
            if (!FlowState.APPROVING.getValue().equals(detail.getState())) throw new BusinessException("该节点当前不可审批，请刷新待办");
            Approval approval = approvalService.getById(approvalId);
            if (approval == null || !FlowState.APPROVING.getValue().equals(approval.getState()))
                throw new BusinessException("审批已结束或不存在，请刷新待办");
            LocalDateTime nowTime = LocalDateTime.now();
            detail.setState(FlowState.PASSED.getValue());
            detail.setFinishTime(nowTime);
            detail.setTakingSeconds(DateUtil.diffSeconds(detail.getStartTime(), nowTime));
            if (!updateById(detail)) throw new BusinessException("审批节点状态保存失败");

            int currentLevel = detail.getLevel() == null ? 0 : detail.getLevel();
            List<ApprovalDetail> approvers = findByApprovalIdAndUserType(approvalId, FlowUserType.APPROVAL);
            List<ApprovalDetail> current = approvers.stream()
                    .filter(d -> Objects.equals(d.getLevel(), currentLevel)).collect(Collectors.toList());
            boolean allMode = current.stream().anyMatch(d -> ApprovalNodeMode.ALL.getCode().equalsIgnoreCase(d.getApproveMode()));
            boolean nodeDone = !allMode || current.stream()
                    .allMatch(d -> FlowState.PASSED.getValue().equals(d.getState()));
            if (!nodeDone) {
                // 会签节点：其他人还没签，本节点继续等待。
                captureNotice(approvalId);
                return detailId;
            }
            // 节点完成：或签节点的其他审批人、以及会签里未处理的节点统一跳过，避免留下无效待办。
            for (ApprovalDetail sibling : current) {
                if (FlowState.APPROVING.getValue().equals(sibling.getState())
                        || FlowState.NOT_SUBMIT.getValue().equals(sibling.getState())) {
                    sibling.setState(FlowState.SKIPPED.getValue());
                    sibling.setFinishTime(nowTime);
                    if (!updateById(sibling)) throw new BusinessException("审批节点状态保存失败");
                }
            }
            int nextLevel = currentLevel + 1;
            List<ApprovalDetail> next = approvers.stream()
                    .filter(d -> Objects.equals(d.getLevel(), nextLevel)
                            && FlowState.NOT_SUBMIT.getValue().equals(d.getState()))
                    .collect(Collectors.toList());
            if (!next.isEmpty()) {
                for (ApprovalDetail nextDetail : next) {
                    nextDetail.setStartTime(nowTime);
                    nextDetail.setState(FlowState.APPROVING.getValue());
                    if (!updateById(nextDetail)) throw new BusinessException("下一审批节点保存失败");
                }
            } else {
                approvalService.changeState(approval, FlowState.PASSED);
                changeCcState(approvalId, FlowState.PASSED);
                changeRelateRecordState(approval, FlowState.PASSED);
            }
            captureNotice(approvalId);
            return detailId;
        }
    }

    public List<ApprovalDetail> findByApprovalIdAndUserType(Long approvalId, FlowUserType flowUserType) {
        LambdaQueryWrapper<ApprovalDetail> queryWrapper = new LambdaQueryWrapper();
        queryWrapper.eq(ApprovalDetail::getApprovalId, approvalId);
        queryWrapper.eq(ApprovalDetail::getFlowUserType, flowUserType.getValue());
        return list(queryWrapper);
    }

    /**
     * 覆盖审批的抄送人（请假申请页可增减流程默认抄送人）。
     * ccIds 为 null 表示不调整，空列表表示取消抄送；仅在提交/再次提交时调用。
     */
    @Transactional(rollbackFor = Exception.class)
    public void replaceCcUsers(Long approvalId, List<Long> ccIds) {
        if (approvalId == null || approvalId <= 0 || ccIds == null) return;
        Approval approval = approvalService.getById(approvalId);
        if (approval == null) throw new BusinessException("审批不存在");
        Set<Long> desired = new LinkedHashSet<>();
        for (Long ccId : ccIds) {
            if (ccId != null && ccId > 0) desired.add(ccId);
        }
        List<ApprovalDetail> existing = findByApprovalIdAndUserType(approvalId, FlowUserType.CC);
        Set<Long> current = existing.stream().map(ApprovalDetail::getTargetUserId)
                .filter(Objects::nonNull).collect(Collectors.toCollection(LinkedHashSet::new));
        if (current.equals(desired)) return;
        if (!existing.isEmpty()) {
            List<Long> staleIds = existing.stream().map(ApprovalDetail::getId).collect(Collectors.toList());
            if (!removeByIds(staleIds)) throw new BusinessException("抄送人保存失败，请重试");
        }
        if (!desired.isEmpty()) {
            List<ApprovalDetail> ccDetails = new ArrayList<>();
            for (Long ccId : desired) {
                ccDetails.add(ApprovalDetail.builder()
                        .approvalId(approvalId)
                        .categoryId(approval.getCategoryId())
                        .level(0)
                        .targetUserId(ccId)
                        .flowUserType(FlowUserType.CC.getValue())
                        .createUser(approval.getCreateUser())
                        .build());
            }
            if (!saveBatch(ccDetails)) throw new BusinessException("抄送人保存失败，请重试");
        }
        // 抄送明细变化后重新排队提醒，旧的抄送提醒由 current() 校验自动失效。
        captureNotice(approvalId);
    }

    private List<ApprovalDetail> findByApprovalIdAndUserTypes(Long approvalId, List<Integer> flowUserTypes) {
        LambdaQueryWrapper<ApprovalDetail> queryWrapper = new LambdaQueryWrapper();
        queryWrapper.eq(ApprovalDetail::getApprovalId, approvalId);
        queryWrapper.in(ApprovalDetail::getFlowUserType, flowUserTypes);
        return list(queryWrapper);
    }

    /**
     * 更改抄送记录状态
     *
     * @param approvalId
     * @param state
     */
    private void changeCcState(Long approvalId, FlowState state) {
        List<ApprovalDetail> ccDetails = findByApprovalIdAndUserType(approvalId, FlowUserType.CC);
        if (CollectionUtils.isEmpty(ccDetails)) return;
        for (ApprovalDetail cc : ccDetails) {
            cc.setState(state.getValue());
            if (!updateById(cc)) throw new BusinessException("抄送节点状态保存失败");
        }
    }

    /**
     * 获取审批关联的业务详情
     *
     * @param approvalId
     * @return
     */
    public Object detail(Long approvalId) {
        Approval approval = approvalService.getById(approvalId);
        if (approval == null) throw new BusinessException("审批不存在");
        requireViewable(approval);
        ApprovalRelation approvalRelation = getRelationClass(approval);
        if (!ObjectUtils.isEmpty(approvalRelation)) {
            return approvalRelation.detail(approvalId);
        }
        return new Object();
    }

    /**
     * 只读查看完整审批流程：发起人、任一流程节点处理人、全局角色（超级管理员等）均可查看。
     *
     * <p>与“我的待办”不同，这里不按 target_user_id 过滤节点，用于订单详情、消费记录、
     * 排班变动日志等入口回溯历史审批；返回结果不含操作权限，前端只做展示。</p>
     */
    public JSONObject flow(Long approvalId) {
        Approval approval = approvalService.getById(approvalId);
        if (approval == null) throw new BusinessException("审批不存在");
        requireViewable(approval);
        List<ApprovalDetail> details = list(new LambdaQueryWrapper<ApprovalDetail>()
                .eq(ApprovalDetail::getApprovalId, approvalId)
                .orderByAsc(ApprovalDetail::getId));
        JSONObject result = new JSONObject();
        result.put("approval", approval);
        result.put("categoryTitle", approval.getCategoryTitle());
        result.put("orderId", approval.getOrderId());
        result.put("customerId", approval.getCustomerId());
        result.put("details", details);
        Object businessDetail;
        try {
            businessDetail = detail(approvalId);
        } catch (Exception e) {
            // 业务详情缺失（历史数据/已删除关联）不影响流程节点展示
            businessDetail = null;
        }
        result.put("businessDetail", businessDetail);
        return result;
    }

    /** 按订单查询关联审批（订单审批 + 订单退款审批），仅返回当前账号有权查看的记录 */
    public List<JSONObject> listByOrderId(Long orderId) {
        if (orderId == null) throw new BusinessException("订单不存在");
        Long userId = currentUserId();
        List<Approval> approvals = approvalService.list(new LambdaQueryWrapper<Approval>()
                .eq(Approval::getOrderId, orderId)
                .orderByDesc(Approval::getId));
        List<Long> ids = approvals.stream().map(Approval::getId).filter(Objects::nonNull).collect(Collectors.toList());
        // 退款审批通过 RefundApply.approval_id 关联订单，补进来避免漏单
        List<com.macro.mall.entity.RefundApply> refundApplies = refundApplyService.list(
                new LambdaQueryWrapper<com.macro.mall.entity.RefundApply>()
                        .eq(com.macro.mall.entity.RefundApply::getOrderId, orderId)
                        .isNotNull(com.macro.mall.entity.RefundApply::getApprovalId));
        for (com.macro.mall.entity.RefundApply refundApply : refundApplies) {
            if (refundApply.getApprovalId() != null && !ids.contains(refundApply.getApprovalId())) {
                ids.add(refundApply.getApprovalId());
            }
        }
        Map<Long, Approval> approvalMap = new LinkedHashMap<>();
        for (Approval approval : approvals) approvalMap.put(approval.getId(), approval);
        for (Long id : ids) {
            if (approvalMap.containsKey(id)) continue;
            Approval approval;
            try {
                approval = approvalService.getById(id);
            } catch (Exception e) {
                // 跨门店等越界访问直接跳过，不影响本单其他审批展示
                continue;
            }
            if (approval != null) approvalMap.put(id, approval);
        }
        List<JSONObject> result = new ArrayList<>();
        for (Approval approval : approvalMap.values()) {
            boolean related = userId.equals(approval.getCreateUser())
                    || count(new LambdaQueryWrapper<ApprovalDetail>()
                    .eq(ApprovalDetail::getApprovalId, approval.getId())
                    .eq(ApprovalDetail::getTargetUserId, userId)) > 0;
            if (!related && !isGlobalViewer()) continue;
            JSONObject item = new JSONObject();
            item.put("id", approval.getId());
            item.put("categoryTitle", approval.getCategoryTitle());
            item.put("state", approval.getState());
            item.put("createTime", approval.getCreateTime());
            item.put("rejectReason", approval.getRejectReason());
            result.add(item);
        }
        result.sort((a, b) -> Long.compare(b.getLongValue("id"), a.getLongValue("id")));
        return result;
    }

    /** 审批可见性：发起人、流程节点处理人（含审批/办理/抄送）或全局角色 */
    private void requireViewable(Approval approval) {
        Long userId = currentUserId();
        if (userId.equals(approval.getCreateUser())) return;
        if (count(new LambdaQueryWrapper<ApprovalDetail>()
                .eq(ApprovalDetail::getApprovalId, approval.getId())
                .eq(ApprovalDetail::getTargetUserId, userId)) > 0) return;
        if (isGlobalViewer()) return;
        throw new BusinessException("无权查看该审批");
    }

    /** 全局门店角色（超级管理员、总助、运营、财务等）可跨门店回溯任意审批 */
    private boolean isGlobalViewer() {
        return shopScopeService.isGlobal(currentAdmin());
    }

    private com.macro.mall.model.UmsAdmin currentAdmin() {
        org.springframework.security.core.Authentication auth = org.springframework.security.core.context.SecurityContextHolder.getContext().getAuthentication();
        if (auth != null && auth.getPrincipal() instanceof com.macro.mall.bo.AdminUserDetails) {
            return ((com.macro.mall.bo.AdminUserDetails) auth.getPrincipal()).getUmsAdmin();
        }
        return null;
    }

    /**
     * 获取业务类
     *
     * @param approval
     * @return
     */
    private ApprovalRelation getRelationClass(Approval approval) {
        if (ObjectUtils.isEmpty(approval)) {
            return null;
        }
        ApprovalCategory category = approvalCategoryService.findById(approval.getCategoryId());
        if (category == null) {
            return null;
        }

        String beanId = category.getBeanId();
        if (Strings.isBlank(beanId)) {
            return null;
        }
        try {
            Object beanObj = ContextUtil.getBeanByName(beanId);
            return (ApprovalRelation) beanObj;
        } catch (Exception e) {
            e.printStackTrace();
            return null;
        }
    }

    /**
     * 更改关联记录状态
     *
     * @param approval
     * @param state
     */
    private void changeRelateRecordState(Approval approval, FlowState state) {
        ApprovalRelation approvalRelation = getRelationClass(approval);
        if (!ObjectUtils.isEmpty(approvalRelation)) {
            approvalRelation.changeRelateRecordState(approval.getId(), state);
        }
    }

    private void changeRelateRecordState(Approval approval, FlowState state, Integer approvalLevel) {
        ApprovalRelation approvalRelation = getRelationClass(approval);
        if (!ObjectUtils.isEmpty(approvalRelation)) {
            approvalRelation.changeRelateRecordState(approval.getId(), state, approvalLevel);
        }
    }

    private Long currentUserId() {
        org.springframework.security.core.Authentication auth = org.springframework.security.core.context.SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || !(auth.getPrincipal() instanceof com.macro.mall.bo.AdminUserDetails))
            throw new BusinessException("登录状态已失效，请重新登录");
        com.macro.mall.model.UmsAdmin admin = ((com.macro.mall.bo.AdminUserDetails) auth.getPrincipal()).getUmsAdmin();
        if (admin == null || admin.getId() == null) throw new BusinessException("登录状态已失效，请重新登录");
        return admin.getId();
    }

    private Map<String,Object> personalQuery(Map<String,Object> params) {
        Map<String,Object> result = new HashMap<>(params);
        result.remove("target_user_id"); result.remove("shopId"); result.remove("shop_id");
        result.put("targetUserId", currentUserId());
        try {
            result.put("page",Math.max(1,Integer.parseInt(result.getOrDefault("page",1).toString())));
            result.put("size",Math.max(1,Math.min(100,Integer.parseInt(result.getOrDefault("size",10).toString()))));
        } catch (Exception e) { throw new BusinessException("分页参数不正确"); }
        return result;
    }

    /**
     * 列表用的节点摘要：只保留渲染「流转进度」需要的字段，避免把整张审批详情表都吐给列表。
     */
    private ApprovalFlowNodeBrief toFlowNodeBrief(ApprovalDetail node) {
        ApprovalFlowNodeBrief brief = new ApprovalFlowNodeBrief();
        brief.setFlowUserType(node.getFlowUserType());
        brief.setNodeName(node.getNodeName());
        brief.setTargetUserId(node.getTargetUserId());
        brief.setState(node.getState());
        brief.setApproveMode(node.getApproveMode());
        brief.setStartTime(node.getStartTime());
        brief.setFinishTime(node.getFinishTime());
        return brief;
    }

    private void requireAssignedApprover(ApprovalDetail detail) {
        if (detail == null) throw new BusinessException("审批节点不存在");
        if (!currentUserId().equals(detail.getTargetUserId()) || !FlowUserType.APPROVAL.getValue().equals(detail.getFlowUserType()))
            throw new BusinessException("只能处理分配给本人的审批");
    }

    public PageInfo<ApprovalDetail> pageInfo(Map<String, Object> params) {
        PageInfo<ApprovalDetail> page = page(personalQuery(params));
        List<ApprovalDetail> list = page.getList();
        if (CollectionUtils.isEmpty(list)) {
            return page;
        }
        List<Long> approvalIdList = list.stream().map(ApprovalDetail::getApprovalId).filter(Objects::nonNull).distinct().collect(Collectors.toList());
        if (CollectionUtils.isEmpty(approvalIdList)) {
            return page;
        }
        List<Approval> approvalList = approvalService.listByIds(approvalIdList);
        //一次查出这批审批的全部节点：既用于「当前审批人」，也用于列表展示「提交→审批→完成」的流转进度
        List<ApprovalDetail> allNodes = list(new LambdaQueryWrapper<ApprovalDetail>()
                .in(ApprovalDetail::getApprovalId, approvalIdList)
                .orderByAsc(ApprovalDetail::getId));
        Map<Long, Long> idTargetUserIdMap = allNodes.stream()
                .filter(n -> FlowUserType.APPROVAL.getValue().equals(n.getFlowUserType())
                        && FlowState.APPROVING.getValue().equals(n.getState()))
                .collect(Collectors.toMap(ApprovalDetail::getApprovalId, ApprovalDetail::getTargetUserId, (a, b) -> a));
        Map<Long, List<ApprovalFlowNodeBrief>> flowNodeMap = allNodes.stream()
                .filter(n -> !FlowUserType.CC.getValue().equals(n.getFlowUserType()))
                .collect(Collectors.groupingBy(ApprovalDetail::getApprovalId,
                        Collectors.mapping(this::toFlowNodeBrief, Collectors.toList())));
        list.forEach(d -> {
            d.setApprovingUserId(idTargetUserIdMap.get(d.getApprovalId()));
            d.setFlowNodes(flowNodeMap.getOrDefault(d.getApprovalId(), new ArrayList<>()));
        });
        Map<Long, Approval> approvalMap = approvalList.stream().collect(Collectors.toMap(Approval::getId, Function.identity()));
        list.forEach(d -> d.setApproval(approvalMap.get(d.getApprovalId())));
        //待办中心的请假单也标出「当天请假」，审批人一眼能看出需要优先处理
        Map<Long, MassagistLeave> leaveMap = massagistLeaveService.list(new LambdaQueryWrapper<MassagistLeave>()
                        .in(MassagistLeave::getApprovalId, approvalIdList)).stream()
                .collect(Collectors.toMap(MassagistLeave::getApprovalId, Function.identity(), (a, b) -> a));
        list.forEach(d -> {
            MassagistLeave leave = leaveMap.get(d.getApprovalId());
            if (leave != null) d.setLeaveSameDay(massagistLeaveService.isSameDayLeave(leave));
        });
        return page;
    }

    private ApprovalDetail checkAndGet(Long detailId) {
        ApprovalDetail detail = getById(detailId);
        if (ObjectUtils.isEmpty(detail)) {
            throw new BusinessException("审批人不存在");
        }
        return detail;
    }

    @Transactional(rollbackFor = Exception.class)
    public Long reject(Long detailId, String rejectReason) {
        ApprovalDetail detail = checkAndGet(detailId);
        requireAssignedApprover(detail);
        if (rejectReason == null || rejectReason.trim().isEmpty()) throw new BusinessException("请填写拒绝原因");
        Long approvalId = detail.getApprovalId();
        String key = "approvalId" + approvalId;
        synchronized (key.intern()) {
            detail = checkAndGet(detailId);
            requireAssignedApprover(detail);
            if (FlowState.REJECTED.getValue().equals(detail.getState())) return detailId;
            if (!FlowState.APPROVING.getValue().equals(detail.getState())) throw new BusinessException("该节点当前不可审批，请刷新待办");
            Approval approval = approvalService.getById(approvalId);
            if (approval == null || !FlowState.APPROVING.getValue().equals(approval.getState()))
                throw new BusinessException("审批已结束或不存在，请刷新待办");
            detail.setState(FlowState.REJECTED.getValue());
            LocalDateTime now = LocalDateTime.now();
            detail.setFinishTime(now);
            long takingTimeSeconds = DateUtil.diffSeconds(detail.getStartTime(), now);
            detail.setTakingSeconds(takingTimeSeconds);
            if (!updateById(detail)) throw new BusinessException("审批节点状态保存失败");
            // 整单驳回后，其他还在审批中的节点统一跳过，避免继续出现在别人的待办里。
            for (ApprovalDetail sibling : findByApprovalIdAndUserType(approvalId, FlowUserType.APPROVAL)) {
                if (!Objects.equals(sibling.getId(), detail.getId())
                        && (FlowState.APPROVING.getValue().equals(sibling.getState())
                        || FlowState.NOT_SUBMIT.getValue().equals(sibling.getState()))) {
                    sibling.setState(FlowState.SKIPPED.getValue());
                    sibling.setFinishTime(now);
                    if (!updateById(sibling)) throw new BusinessException("审批节点状态保存失败");
                }
            }
            approval = approvalService.rejected(detail.getTargetUserId(), detail.getApprovalId(), FlowState.REJECTED, rejectReason.trim());
            changeRelateRecordState(approval, FlowState.REJECTED);
            captureNotice(approvalId);
            return detailId;
        }
    }

    @Transactional(rollbackFor = Exception.class)
    public void reSubmit(Long approvalId) {
        Approval approval = approvalService.getById(approvalId);
        if (approval == null) {
            throw new BusinessException("审批不存在");
        }
        if (!currentUserId().equals(approval.getCreateUser())) throw new BusinessException("仅原发起人可以重新提交审批");
        if (!approval.ifReSubmit()) {
            throw new BusinessException("审批状态有误，不能重提交");
        }
        approval.setState(FlowState.APPROVING.getValue());
        approval.setTakingSeconds(null);
        if (!approvalService.updateById(approval)) throw new BusinessException("审批主记录保存失败");
        List<Integer> userTypes = Arrays.asList(FlowUserType.APPROVAL.getValue(), FlowUserType.CREATE.getValue());
        List<ApprovalDetail> detailList = findByApprovalIdAndUserTypes(approvalId, userTypes);
        long firstApprovers = detailList.stream().filter(d -> FlowUserType.APPROVAL.getValue().equals(d.getFlowUserType()) && Integer.valueOf(1).equals(d.getLevel()) && d.getTargetUserId() != null && d.getTargetUserId() > 0).count();
        if (firstApprovers < 1) throw new BusinessException("审批流程缺少首位审批人，不能重新提交");
        if (!CollectionUtils.isEmpty(detailList)) {
            detailList.stream().forEach(d -> {
                if (FlowUserType.CREATE.getValue().equals(d.getFlowUserType())) {
                    if (d.getLevel() == 0) {
                        d.setState(FlowState.PASSED.getValue());
                    }
                }
                if (FlowUserType.APPROVAL.getValue().equals(d.getFlowUserType())) {
                    if (d.getLevel() == 1) {
                        d.setState(FlowState.APPROVING.getValue());
                        d.setStartTime(LocalDateTime.now());
                    } else {
                        d.setState(FlowState.NOT_SUBMIT.getValue());
                        d.setStartTime(null);
                    }
                    d.setFinishTime(null);
                    d.setTakingSeconds(null);
                }
            });
            if (!updateBatchById(detailList)) throw new BusinessException("审批节点保存失败");
        }
        changeRelateRecordState(approval, FlowState.APPROVING);
        if (noticeService != null) noticeService.advanceGeneration(approvalId);
        captureNotice(approvalId);
    }
    public PageInfo<ApprovalDetail> pageLeave(Map<String, Object> params) {
        // 请假审批按“人”查询，不按门店过滤：同一账号可能在不同门店都有请假记录。
        List<ApprovalCategory> leaveCategories = approvalCategoryService.list(new LambdaQueryWrapper<ApprovalCategory>()
                .eq(ApprovalCategory::getCode, FlowCategoryCode.ASK_FOR_LEAVE.getCode()));
        if (CollectionUtils.isEmpty(leaveCategories)) {
            return new PageInfo<>(new ArrayList<>());
        }
        Map<String, Object> query = personalQuery(params);
        query.remove("categoryId");
        query.remove("category_id");
        query.put("categoryIds", leaveCategories.stream().map(ApprovalCategory::getId).filter(Objects::nonNull)
                .map(String::valueOf).collect(Collectors.joining(",")));
        PageInfo<ApprovalDetail> page = page(query);
        List<ApprovalDetail> list = page.getList();
        if (CollectionUtils.isEmpty(list)) {
            return page;
        }
        List<Long> approvalIdList = list.stream().map(ApprovalDetail::getApprovalId).distinct().collect(Collectors.toList());
        List<Approval> approvalList = approvalService.listByIds(approvalIdList);
        LambdaQueryWrapper<ApprovalDetail> lqw = new LambdaQueryWrapper<>();
        lqw.in(ApprovalDetail::getApprovalId, approvalIdList);
        lqw.eq(ApprovalDetail::getFlowUserType, FlowUserType.APPROVAL.getValue());
        lqw.eq(ApprovalDetail::getState, FlowState.APPROVING.getValue());
        List<ApprovalDetail> approvalDetails = list(lqw);
        Map<Long, Long> idTargetUserIdMap = approvalDetails.stream().collect(Collectors.toMap(ApprovalDetail::getApprovalId, ApprovalDetail::getTargetUserId, (a, b) -> a));
        list.forEach(d -> d.setApprovingUserId(idTargetUserIdMap.get(d.getApprovalId())));
        Map<Long, Approval> approvalMap = approvalList.stream().collect(Collectors.toMap(Approval::getId, Function.identity(), (a, b) -> a));
        list.forEach(d -> d.setApproval(approvalMap.get(d.getApprovalId())));
        //抄送人：列表直接展示，避免逐行再查
        LambdaQueryWrapper<ApprovalDetail> ccQuery = new LambdaQueryWrapper<>();
        ccQuery.in(ApprovalDetail::getApprovalId, approvalIdList);
        ccQuery.eq(ApprovalDetail::getFlowUserType, FlowUserType.CC.getValue());
        Map<Long, List<Long>> ccMap = list(ccQuery).stream()
                .filter(d -> d.getTargetUserId() != null)
                .collect(Collectors.groupingBy(ApprovalDetail::getApprovalId,
                        Collectors.mapping(ApprovalDetail::getTargetUserId, Collectors.toList())));
        list.forEach(d -> d.setCcUserIdList(ccMap.getOrDefault(d.getApprovalId(), new ArrayList<>())));
        //休息日期与时段：列表直接展示，避免逐行再查
        Map<Long, MassagistLeave> leaveMap = massagistLeaveService.list(new LambdaQueryWrapper<MassagistLeave>()
                        .in(MassagistLeave::getApprovalId, approvalIdList)).stream()
                .collect(Collectors.toMap(MassagistLeave::getApprovalId, Function.identity(), (a, b) -> a));
        for (ApprovalDetail detail : list) {
            MassagistLeave leave = leaveMap.get(detail.getApprovalId());
            if (leave == null) continue;
            detail.setLeaveDates(massagistLeaveService.leaveDates(leave));
            detail.setLeaveStartTime(leave.getStartTime() == null ? null
                    : leave.getStartTime().format(java.time.format.DateTimeFormatter.ofPattern("HH:mm")));
            detail.setLeaveEndTime(leave.getEndTime() == null ? null
                    : leave.getEndTime().format(java.time.format.DateTimeFormatter.ofPattern("HH:mm")));
            detail.setLeaveSameDay(massagistLeaveService.isSameDayLeave(leave));
        }
        return page;
    }
    @Transactional(rollbackFor = Exception.class)
    public void deleteByApprovalId(Long approvalId) {
        LambdaQueryWrapper<ApprovalDetail> lqw = new LambdaQueryWrapper<>();
        lqw.eq(ApprovalDetail::getApprovalId, approvalId);
        remove(lqw);
        approvalService.removeById(approvalId);
    }

    /**
     * 当前审批人的待办数量（到人级别，不区分门店）
     */
    public int countTodo(Long userId) {
        if (userId == null) {
            return 0;
        }
        LambdaQueryWrapper<ApprovalDetail> lqw = new LambdaQueryWrapper<>();
        lqw.eq(ApprovalDetail::getTargetUserId, userId);
        lqw.eq(ApprovalDetail::getFlowUserType, FlowUserType.APPROVAL.getValue());
        lqw.eq(ApprovalDetail::getState, FlowState.APPROVING.getValue());
        return (int) count(lqw);
    }

    /**
     * 待办中心各页签数量：我的待办 / 我的已办 / 我提交的 / 抄送我的
     */
    public Map<String, Object> tabCounts(Long userId) {
        int pending = 0;
        int done = 0;
        int submitted = 0;
        int cc = 0;
        if (userId != null) {
            LambdaQueryWrapper<ApprovalDetail> pendingQw = new LambdaQueryWrapper<>();
            pendingQw.eq(ApprovalDetail::getTargetUserId, userId)
                    .eq(ApprovalDetail::getFlowUserType, FlowUserType.APPROVAL.getValue())
                    .eq(ApprovalDetail::getState, FlowState.APPROVING.getValue());
            pending = (int) count(pendingQw);

            QueryWrapper<ApprovalDetail> doneQw = new QueryWrapper<>();
            doneQw.select("count(distinct approval_id) as cnt")
                    .eq("target_user_id", userId)
                    .eq("flow_user_type", FlowUserType.APPROVAL.getValue())
                    .in("state", FlowState.PASSED.getValue(), FlowState.REJECTED.getValue());
            Map<String, Object> doneRow = getMap(doneQw);
            if (doneRow != null && doneRow.get("cnt") != null) {
                done = ((Number) doneRow.get("cnt")).intValue();
            }

            LambdaQueryWrapper<ApprovalDetail> ccQw = new LambdaQueryWrapper<>();
            ccQw.eq(ApprovalDetail::getTargetUserId, userId)
                    .eq(ApprovalDetail::getFlowUserType, FlowUserType.CC.getValue());
            cc = (int) count(ccQw);

            LambdaQueryWrapper<Approval> submittedQw = new LambdaQueryWrapper<>();
            submittedQw.eq(Approval::getCreateUser, userId);
            submitted = (int) approvalService.count(submittedQw);
        }
        Map<String, Object> counts = new LinkedHashMap<>();
        counts.put("pending", pending);
        counts.put("done", done);
        counts.put("submitted", submitted);
        counts.put("cc", cc);
        return counts;
    }

    /**
     * 我提交的审批：按发起人查询审批主记录（任意状态）
     */
    public PageInfo<Approval> pageSubmitted(Long userId, Map<String, Object> params) {
        QueryWrapper<Approval> queryWrapper = new QueryWrapper<>();
        if (userId == null) {
            queryWrapper.eq("create_user", -1L);
        } else {
            queryWrapper.eq("create_user", userId);
        }
        Object state = params == null ? null : params.get("state");
        if (state != null && Strings.isNotBlank(state.toString())) {
            queryWrapper.in("state", Arrays.asList(state.toString().split(",")));
        }
        queryWrapper.orderByDesc("id");
        int page = params == null || params.get("page") == null ? 1 : Integer.parseInt(params.get("page").toString());
        int size = params == null || params.get("size") == null ? 10 : Integer.parseInt(params.get("size").toString());
        PageHelper.startPage(page, size);
        PageInfo<Approval> pageInfo = new PageInfo<>(approvalService.list(queryWrapper));
        //「我提交的」直接展示流转进度，避免前端逐行再查节点
        List<Approval> submittedList = pageInfo.getList();
        if (!CollectionUtils.isEmpty(submittedList)) {
            List<Long> approvalIdList = submittedList.stream().map(Approval::getId).filter(Objects::nonNull)
                    .distinct().collect(Collectors.toList());
            Map<Long, List<ApprovalFlowNodeBrief>> flowNodeMap = flowNodesByApproval(approvalIdList);
            submittedList.forEach(a -> a.setFlowNodes(flowNodeMap.getOrDefault(a.getId(), new ArrayList<>())));
        }
        return pageInfo;
    }

    /**
     * 批量构建审批的流转节点摘要：按提交顺序（含发起人节点，排除抄送人）。
     */
    private Map<Long, List<ApprovalFlowNodeBrief>> flowNodesByApproval(List<Long> approvalIdList) {
        if (CollectionUtils.isEmpty(approvalIdList)) {
            return java.util.Collections.emptyMap();
        }
        return list(new LambdaQueryWrapper<ApprovalDetail>()
                .in(ApprovalDetail::getApprovalId, approvalIdList)
                .orderByAsc(ApprovalDetail::getId)).stream()
                .filter(n -> !FlowUserType.CC.getValue().equals(n.getFlowUserType()))
                .collect(Collectors.groupingBy(ApprovalDetail::getApprovalId,
                        Collectors.mapping(this::toFlowNodeBrief, Collectors.toList())));
    }

    public int getApprovalState(Long approvalId) {
        LambdaQueryWrapper<Approval> lqw = new LambdaQueryWrapper<>();
        lqw.eq(Approval::getId, approvalId);
        Approval detail =approvalService.getOne(lqw);
        if (detail == null) {
            return 0;
        }
        return detail.getState();
    }
}