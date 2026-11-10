package com.macro.mall.service;


import com.macro.mall.enums.FlowState;

/**
 * @author jinlong
 * @date 2022/01/13
 */
public interface ApprovalRelation {
    /**
     * 最终审批通过时，更改关联数据状态
     *
     * @param approvalId
     * @param state
     */
    void changeRelateRecordState(Long approvalId, FlowState state);

    /**
     * 中间审批通过
     *
     * @param approvalId
     * @param state
     * @param approvalLevel
     */
    default void changeRelateRecordState(Long approvalId, FlowState state, Integer approvalLevel) {

    }

    /**
     * 删除审批关联数据
     *
     * @param approvalId
     */
    void deleteByApprovalId(Long approvalId);

    /**
     * 获取审批关联的业务详情
     *
     * @param approvalId
     * @return
     */
    Object detail(Long approvalId);
}
