package com.macro.mall.service;

import cn.hutool.core.util.StrUtil;
import com.alibaba.fastjson2.JSON;
import com.alibaba.fastjson2.JSONArray;
import com.alibaba.fastjson2.JSONObject;
import com.macro.mall.entity.Approval;
import com.macro.mall.common.exception.BusinessException;
import com.macro.mall.enums.FlowState;
import com.macro.mall.mapper.ApprovalMapper;
import com.macro.mall.service.base.BaseService;
import com.macro.mall.utils.DateUtil;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;

/**
 * 服务类
 *
 * @author zkl
 * @date 2025/06/10
 */
@Service
public class ApprovalService extends BaseService<ApprovalMapper, Approval> {
    public Approval rejected(Long targetUserId, Long id, FlowState state, String rejectReason) {
        Approval approval = getById(id);
        if (approval == null) throw new BusinessException("审批不存在");
        approval.setState(state.getValue());
        if (StrUtil.isNotBlank(approval.getRejectReason())) {
            JSONArray jsonArray = JSONArray.parseArray(approval.getRejectReason());
            JSONObject jsonObject = new JSONObject();
            jsonObject.put("rejectReason", rejectReason);
            jsonObject.put("userId", targetUserId);
            jsonArray.add(jsonObject);
            approval.setRejectReason(JSON.toJSONString(jsonArray));
        } else {
            JSONArray jsonArray = new JSONArray();
            JSONObject jsonObject = new JSONObject();
            jsonObject.put("rejectReason", rejectReason);
            jsonObject.put("userId", targetUserId);
            jsonArray.add(jsonObject);
            approval.setRejectReason(JSON.toJSONString(jsonArray));
        }
        if (!updateById(approval)) throw new BusinessException("审批主记录状态保存失败");
        return approval;
    }

    public Approval changeState(Approval approval, FlowState state) {
        approval.setState(state.getValue());
        if (FlowState.PASSED.equals(state)) {
            long takingSeconds = DateUtil.diffSeconds(approval.getCreateTime(), LocalDateTime.now());
            approval.setTakingSeconds(takingSeconds);
        }
        if (!updateById(approval)) throw new BusinessException("审批主记录状态保存失败");
        return approval;
    }
}