package com.macro.mall.service;

import com.alibaba.fastjson2.JSONArray;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.github.pagehelper.PageInfo;
import com.macro.mall.common.exception.BusinessException;
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

    private void captureNotice(Long approvalId) {
        if (noticeService != null) noticeService.capture(approvalId);
    }

    @Override
    protected QueryWrapper<ApprovalDetail> buildWrapper(Map<String, Object> params, QueryWrapper<ApprovalDetail> queryWrapper) {
        if (params.get("approval_ids") != null) {
            queryWrapper.in("approval_id", params.get("approval_ids").toString().split(","));
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
     * 请假审批入口。number 为历史参数（当天请假传 2），审批人一律以流程节点配置为准。
     */
    @Transactional(rollbackFor = Exception.class)
    public Long addLeave(Long orderId, Long customerId, Long shopId, FlowCategoryCode categoryCode, Long createUser, int number) {
        return add(orderId, customerId, shopId, categoryCode, createUser);
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
        List<ApprovalFlowNode> nodes = approvalFlowNodeService.listByCategoryId(category.getId());
        List<ApprovalResolvedNode> resolved = approvalFlowNodeService.resolveNodes(nodes, shopId, createUser);
        if (!nodes.isEmpty()) {
            if (resolved.isEmpty()) {
                throw new BusinessException("审批流程中的审批人当前都不可用（可能已离职或停用），请联系管理员调整审批设置");
            }
            return resolved;
        }
        for (Long adminId : ApprovalCategoryService.parseUsers(category.getApprovalIds(), true)) {
            if (adminId.equals(createUser)) continue;
            ApprovalResolvedNode legacy = new ApprovalResolvedNode();
            legacy.setNodeName(null);
            legacy.setApproveMode(ApprovalNodeMode.ANY.getCode());
            legacy.setAdminIds(new ArrayList<>(Collections.singletonList(adminId)));
            resolved.add(legacy);
        }
        if (resolved.isEmpty()) {
            throw new BusinessException("审批流程未配置审批人，请联系管理员在审批设置中配置");
        }
        return resolved;
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
        ApprovalCategory flowCategory = approvalCategoryService.findByCode(categoryCode, shopId);
        if (flowCategory == null) {
            throw new BusinessException("审批流程未配置");
        }
        List<ApprovalResolvedNode> nodes = resolveNodes(flowCategory, shopId, createUser);
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
        Long userId = currentUserId();
        Approval approval = approvalService.getById(approvalId);
        if (approval == null) throw new BusinessException("审批不存在");
        if (!userId.equals(approval.getCreateUser()) && count(new LambdaQueryWrapper<ApprovalDetail>()
                .eq(ApprovalDetail::getApprovalId, approvalId).eq(ApprovalDetail::getTargetUserId, userId)) == 0)
            throw new BusinessException("无权查看该审批的业务详情");
        ApprovalRelation approvalRelation = getRelationClass(approval);
        if (!ObjectUtils.isEmpty(approvalRelation)) {
            return approvalRelation.detail(approvalId);
        }
        return new Object();
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
        List<Long> approvalIdList = list.stream().map(ApprovalDetail::getApprovalId).distinct().collect(Collectors.toList());
        List<Approval> approvalList = approvalService.listByIds(approvalIdList);
        LambdaQueryWrapper<ApprovalDetail> lqw = new LambdaQueryWrapper<>();
        lqw.in(ApprovalDetail::getApprovalId, approvalIdList);
        lqw.eq(ApprovalDetail::getFlowUserType, FlowUserType.APPROVAL.getValue());
        lqw.eq(ApprovalDetail::getState, FlowState.APPROVING.getValue());
        List<ApprovalDetail> approvalDetails = list(lqw);
        Map<Long, Long> idTargetUserIdMap = approvalDetails.stream().collect(Collectors.toMap(ApprovalDetail::getApprovalId, ApprovalDetail::getTargetUserId, (a, b) -> a));
        list.forEach(d -> d.setApprovingUserId(idTargetUserIdMap.get(d.getApprovalId())));
        Map<Long, Approval> approvalMap = approvalList.stream().collect(Collectors.toMap(Approval::getId, Function.identity()));
        list.forEach(d -> d.setApproval(approvalMap.get(d.getApprovalId())));
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
    public PageInfo<ApprovalDetail>  pageLeave(Map<String, Object> params) {
        PageInfo<ApprovalDetail> page = page(personalQuery(params));
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
        Map<Long, Approval> approvalMap = approvalList.stream().filter(s -> "请假审批".equals(s.getCategoryTitle())).collect(Collectors.toMap(Approval::getId, Function.identity()));
        list.forEach(d -> d.setApproval(approvalMap.get(d.getApprovalId())));
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