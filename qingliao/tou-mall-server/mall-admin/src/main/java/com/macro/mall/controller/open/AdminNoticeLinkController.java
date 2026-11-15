package com.macro.mall.controller.open;

import com.macro.mall.bo.AdminUserDetails;
import com.macro.mall.common.api.CommonResult;
import com.macro.mall.common.exception.BusinessException;
import com.macro.mall.entity.Approval;
import com.macro.mall.entity.ApprovalDetail;
import com.macro.mall.enums.FlowState;
import com.macro.mall.enums.FlowUserType;
import com.macro.mall.mapper.AdminApprovalNoticeMapper;
import com.macro.mall.mapper.UmsAdminMapper;
import com.macro.mall.model.UmsAdmin;
import com.macro.mall.service.AdminNoticeLinkService;
import com.macro.mall.service.ApprovalDetailService;
import com.macro.mall.service.ApprovalService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

import java.util.*;

/**
 * 微信模板消息里的审批深链：凭签名链接展示事项并直接同意/拒绝。
 * 路径位于 /admin/open（安全白名单），但每个请求都必须验签，操作仍以绑定管理员身份走原审批服务。
 */
@RestController
@RequestMapping("/admin/open/admin-notice/link")
public class AdminNoticeLinkController {
    @Autowired AdminNoticeLinkService links;
    @Autowired AdminApprovalNoticeMapper noticeMapper;
    @Autowired ApprovalService approvalService;
    @Autowired ApprovalDetailService detailService;
    @Autowired UmsAdminMapper adminMapper;

    @GetMapping("/detail")
    public CommonResult<?> detail(@RequestParam Long approvalId, @RequestParam Long detailId,
                                  @RequestParam Long adminId, @RequestParam Long exp, @RequestParam String sig) {
        requireValid(approvalId, detailId, adminId, exp, sig);
        Approval approval = approvalService.getById(approvalId);
        ApprovalDetail detail = detailService.getById(detailId);
        if (approval == null || detail == null || !approvalId.equals(detail.getApprovalId()))
            throw new BusinessException("审批不存在或链接已失效");
        if (!adminId.equals(detail.getTargetUserId()) && !adminId.equals(approval.getCreateUser()))
            throw new BusinessException("无权查看该审批");

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("approvalId", approvalId);
        result.put("detailId", detailId);
        result.put("title", approval.getCategoryTitle());
        result.put("applicant", noticeMapper.applicantOfApproval(approvalId));
        result.put("createTime", approval.getCreateTime());
        result.put("state", approval.getState());
        result.put("stateText", FlowState.getDescByCode(approval.getState()));
        result.put("nodeName", detail.getNodeName());
        result.put("detailState", detail.getState());
        result.put("detailStateText", FlowState.getDescByCode(detail.getState()));
        result.put("rejectReason", approval.getRejectReason());
        boolean canHandle = FlowUserType.APPROVAL.getValue().equals(detail.getFlowUserType())
            && adminId.equals(detail.getTargetUserId())
            && FlowState.APPROVING.getValue().equals(detail.getState())
            && FlowState.APPROVING.getValue().equals(approval.getState());
        result.put("canHandle", canHandle);
        try {
            Object business = asAdmin(adminId, () -> detailService.detail(approvalId));
            // 无业务实现的分类会返回裸 Object，序列化会直接 500，这里按“没有详情”处理。
            if (business != null && !Object.class.equals(business.getClass())) result.put("businessDetail", business);
        } catch (Exception e) {
            // 业务详情失败不影响审批动作，页面仍可同意/拒绝。
        }
        return CommonResult.success(result);
    }

    @PostMapping("/pass")
    public CommonResult<?> pass(@RequestParam Long approvalId, @RequestParam Long detailId,
                                @RequestParam Long adminId, @RequestParam Long exp, @RequestParam String sig) {
        requireValid(approvalId, detailId, adminId, exp, sig);
        asAdmin(adminId, () -> detailService.pass(detailId));
        return CommonResult.success("已同意");
    }

    @PostMapping("/reject")
    public CommonResult<?> reject(@RequestParam Long approvalId, @RequestParam Long detailId,
                                  @RequestParam Long adminId, @RequestParam Long exp, @RequestParam String sig,
                                  @RequestParam String reason) {
        requireValid(approvalId, detailId, adminId, exp, sig);
        if (reason == null || reason.trim().isEmpty()) throw new BusinessException("请填写拒绝原因");
        if (reason.trim().length() > 200) throw new BusinessException("拒绝原因不能超过200字");
        asAdmin(adminId, () -> detailService.reject(detailId, reason.trim()));
        return CommonResult.success("已拒绝");
    }

    private void requireValid(Long approvalId, Long detailId, Long adminId, Long exp, String sig) {
        if (!links.verify(approvalId, detailId, adminId, exp, sig))
            throw new BusinessException("链接已失效，请打开待办中心处理");
    }

    /** 以绑定管理员身份执行原审批逻辑，复用节点归属、状态与并发校验。 */
    private <T> T asAdmin(Long adminId, Action<T> action) {
        UmsAdmin admin = adminMapper.selectByPrimaryKey(adminId);
        if (admin == null || !Integer.valueOf(1).equals(admin.getStatus()))
            throw new BusinessException("账号不可用，请打开待办中心处理");
        AdminUserDetails principal = new AdminUserDetails(admin, Collections.emptyList());
        UsernamePasswordAuthenticationToken auth =
            new UsernamePasswordAuthenticationToken(principal, null, principal.getAuthorities());
        SecurityContextHolder.getContext().setAuthentication(auth);
        try {
            return action.run();
        } finally {
            SecurityContextHolder.clearContext();
        }
    }

    @FunctionalInterface
    private interface Action<T> {
        T run();
    }
}