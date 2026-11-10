package com.macro.mall.service;

import cn.hutool.core.util.ObjUtil;
import com.alibaba.fastjson2.JSON;
import com.alibaba.fastjson2.JSONArray;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.macro.mall.common.exception.BusinessException;
import com.macro.mall.entity.ApprovalCategory;
import com.macro.mall.entity.ApprovalFlowNode;
import com.macro.mall.enums.approval.FlowCategoryCode;
import com.macro.mall.mapper.ApprovalCategoryMapper;
import com.macro.mall.service.base.BaseService;
import com.macro.mall.service.base.WrapperBuilder;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;

/**
 * 审批类型 服务类
 *
 * @author zkl
 * @date 2025/06/10
 */
@Service
public class ApprovalCategoryService extends BaseService<ApprovalCategoryMapper, ApprovalCategory> {

    @Autowired
    @Lazy
    ApprovalFlowNodeService approvalFlowNodeService;

    @Override
    protected QueryWrapper<ApprovalCategory> buildWrapper(Map<String, Object> params, QueryWrapper<ApprovalCategory> queryWrapper) {
        Object shopId = params.get("shop_id");
        if (shopId != null && !shopId.toString().trim().isEmpty()) {
            queryWrapper.and(scope -> scope.isNull("shop_id").or().eq("shop_id", shopId.toString().trim()));
        }
        return queryWrapper;
    }

    public ApprovalCategory findByCode(FlowCategoryCode categoryCode, Long shopId) {
        ApprovalCategory global = getOnlyOne(new LambdaQueryWrapper<ApprovalCategory>()
                .eq(ApprovalCategory::getCode, categoryCode.getCode()).isNull(ApprovalCategory::getShopId));
        if (global != null || shopId == null) return global;
        // 保留旧门店配置的兼容路径，绝不拿另一门店的配置充当全局流程。
        return getOnlyOne(new LambdaQueryWrapper<ApprovalCategory>()
                .eq(ApprovalCategory::getCode, categoryCode.getCode()).eq(ApprovalCategory::getShopId, shopId));
    }

    /**
     * 通过id查找审批分类（有缓存）
     *
     * @param categoryId
     * @return
     */
    public ApprovalCategory findById(Long categoryId) {
        return getById(categoryId);
        /*String key = RedisKey.APPROVAL_CATEGORY + categoryId;
        ApprovalCategory approvalCategory = redisUtil.getObj(key, ApprovalCategory.class);
        if (approvalCategory != null) {
            return approvalCategory;
        }
        approvalCategory = getById(categoryId);
        if (approvalCategory != null) {
            redisUtil.setObj(key, approvalCategory, 60, TimeUnit.DAYS);
            return approvalCategory;
        }
        return null;*/
    }

    public void update(ApprovalCategory input) {
        ApprovalCategory existing = input == null || input.getId() == null ? null : getById(input.getId());
        if (existing == null) throw new BusinessException("审批配置不存在");
        // 客户端只能改处理人配置，不能改业务bean、类别、原始门店归属。
        boolean hasNodes = input.getNodes() != null && !input.getNodes().isEmpty();
        existing.setBeanId(beanFor(existing.getCode()));
        existing.setApprovalIds(JSON.toJSONString(normalizeUsers(input.getApprovalIdList(), !hasNodes)));
        existing.setCcIds(JSON.toJSONString(normalizeUsers(input.getCcIdList(), false)));
        existing.setProcessingTime(input.getProcessingTime());
        if (!updateById(existing)) throw new BusinessException("审批配置保存失败");
        if (input.getNodes() != null) approvalFlowNodeService.replaceNodes(existing.getId(), input.getNodes());
    }

    public void add(ApprovalCategory config) {
        if (config == null) throw new BusinessException("审批配置不能为空");
        boolean hasNodes = config.getNodes() != null && !config.getNodes().isEmpty();
        config.setBeanId(beanFor(config.getCode()));
        config.setApprovalIds(JSON.toJSONString(normalizeUsers(config.getApprovalIdList(), !hasNodes)));
        config.setCcIds(JSON.toJSONString(normalizeUsers(config.getCcIdList(), false)));
        LambdaQueryWrapper<ApprovalCategory> query = new LambdaQueryWrapper<>();
        query.eq(ApprovalCategory::getCode, config.getCode());
        if (config.getShopId() == null) query.isNull(ApprovalCategory::getShopId);
        else query.eq(ApprovalCategory::getShopId, config.getShopId());
        if (getOnlyOne(query) != null) throw new BusinessException("该范围已存在同类审批配置，请编辑原配置");
        config.setId(null);
        if (!save(config)) throw new BusinessException("审批配置保存失败");
        if (config.getNodes() != null) approvalFlowNodeService.replaceNodes(config.getId(), config.getNodes());
    }

    private String beanFor(String code) {
        if ("refund".equals(code)) return "refundApplyService";
        if ("giftCoupon".equals(code)) return "giftCustomerCouponService";
        if ("askForLeave".equals(code)) return "massagistLeaveService";
        if ("lowRating".equals(code)) return "lowRatingApprovalRelationService";
        throw new BusinessException("不支持的审批类别");
    }

    static List<Long> normalizeUsers(List<Long> ids, boolean required) {
        if (ids == null) ids = Collections.emptyList();
        if (ids.stream().anyMatch(id -> id == null || id <= 0)) throw new BusinessException("请选择有效的后台处理人");
        List<Long> users = new ArrayList<>(new LinkedHashSet<>(ids));
        if (required && users.isEmpty()) throw new BusinessException("请配置至少一位审批人");
        return users;
    }

    static List<Long> parseUsers(String json, boolean required) {
        try {
            return normalizeUsers(json == null ? null : JSONArray.parseArray(json, Long.class), required);
        } catch (BusinessException e) {
            throw e;
        } catch (Exception e) {
            throw new BusinessException("审批处理人配置格式有误，请重新配置");
        }
    }
    public List<ApprovalCategory> listNoPageNew(Map<String, Object> params,String shopIdArr) {
        List<ApprovalCategory> listApprovalCategory = listNoPage(params);
        // shop_id_arr 为 null / 空串 / "null" 时按全部门店处理，避免审批列表整体 500
        JSONArray jsonArray = null;
        if (shopIdArr != null) {
            String value = shopIdArr.trim();
            if (!value.isEmpty() && !"null".equalsIgnoreCase(value) && !"undefined".equalsIgnoreCase(value)) {
                try {
                    jsonArray = JSON.parseArray(value.replace(" ", ""));
                } catch (Exception ignored) {
                    jsonArray = null;
                }
            }
        }
        if (jsonArray == null || jsonArray.isEmpty()) {
            return attachNodes(listApprovalCategory);
        }
        List<ApprovalCategory> result = new ArrayList<>();
        for (ApprovalCategory item : listApprovalCategory) {
            if (item.getShopId() == null || jsonArray.contains(item.getShopId())
                    || jsonArray.toJavaList(Long.class).contains(item.getShopId())) result.add(item);
        }
        return attachNodes(result);
    }

    /**
     * 列表页一并返回流程节点，前端无需逐条再查。
     */
    private List<ApprovalCategory> attachNodes(List<ApprovalCategory> list) {
        if (list == null || list.isEmpty()) return list;
        Map<Long, List<ApprovalFlowNode>> nodeMap = approvalFlowNodeService.byCategoryIds(
                list.stream().map(ApprovalCategory::getId).collect(java.util.stream.Collectors.toList()));
        list.forEach(category -> category.setNodes(nodeMap.getOrDefault(category.getId(), new ArrayList<>())));
        return list;
    }
}