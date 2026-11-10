package com.macro.mall.service.approval;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.macro.mall.common.exception.BusinessException;
import com.macro.mall.entity.MassagistRate;
import com.macro.mall.entity.Massagist;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.macro.mall.service.MassagistService;
import java.util.Objects;
import java.util.stream.Collectors;
import com.macro.mall.enums.FlowState;
import com.macro.mall.service.ApprovalRelation;
import com.macro.mall.service.MassagistRateService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** 服务反馈的处理状态独立于原评分，拒绝或撤回都不删除顾客评价。 */
@Service
public class LowRatingApprovalRelationService implements ApprovalRelation {
    @Autowired
    @Lazy
    MassagistRateService massagistRateService;
    @Autowired
    @Lazy
    MassagistService massagistService;

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void changeRelateRecordState(Long approvalId, FlowState state) {
        if (approvalId == null || state == null) throw new BusinessException("反馈处理参数不完整");
        if (!massagistRateService.update(new LambdaUpdateWrapper<MassagistRate>()
                .eq(MassagistRate::getApprovalId, approvalId).set(MassagistRate::getReviewState, state.getValue()))) {
            throw new BusinessException("反馈处理状态保存失败");
        }
    }

    @Override
    public void deleteByApprovalId(Long approvalId) {
        changeRelateRecordState(approvalId, FlowState.WITHDRAW);
    }

    @Override
    public Object detail(Long approvalId) {
        List<MassagistRate> ratings = massagistRateService.list(new LambdaQueryWrapper<MassagistRate>()
                .eq(MassagistRate::getApprovalId, approvalId).orderByAsc(MassagistRate::getId));
        List<Long> ids = ratings.stream().map(MassagistRate::getMassagistId)
                .filter(Objects::nonNull).distinct().collect(Collectors.toList());
        if (!ids.isEmpty()) {
            // 只取展示所需姓名，不把手机号、身份证等档案字段带入审批详情。
            Map<Long, String> names = new LinkedHashMap<>();
            for (Massagist person : massagistService.list(new QueryWrapper<Massagist>()
                    .select("id", "name").in("id", ids))) {
                names.put(person.getId(), person.getName());
            }
            ratings.forEach(rate -> rate.setMassagistName(names.get(rate.getMassagistId())));
        }
        Map<String, Object> detail = new LinkedHashMap<>();
        detail.put("businessType", "lowRating");
        detail.put("orderId", ratings.isEmpty() ? null : ratings.get(0).getOrderId());
        detail.put("ratings", ratings);
        return detail;
    }
}
