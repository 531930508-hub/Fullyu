package com.macro.mall.service.approval;

import cn.hutool.core.util.ObjUtil;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.macro.mall.common.exception.BusinessException;
import com.macro.mall.entity.*;
import com.macro.mall.enums.*;
import com.macro.mall.enums.approval.FlowCategoryCode;
import com.macro.mall.mapper.RefundApplyMapper;
import com.macro.mall.service.*;
import com.macro.mall.service.base.BaseService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.stream.Collectors;

/**
 * 服务类
 *
 * @author zkl
 * @date 2025/06/10
 */
@Service
public class RefundApplyService extends BaseService<RefundApplyMapper, RefundApply> implements ApprovalRelation {
    @Autowired
    ApprovalDetailService approvalDetailService;
    @Autowired
    @Lazy
    OrderService orderService;
    @Autowired
    @Lazy
    OrderDetailService orderDetailService;
    @Autowired
    @Lazy
    CustomerCouponService customerCouponService;
    @Autowired
    @Lazy
    GiveGiftService giveGiftService;

    @Transactional(rollbackFor = Exception.class)
    public void add(RefundApply refundApply) {
        Long orderId = refundApply.getOrderId();
        String lockKey = "orderLock:" + orderId;
        synchronized (lockKey.intern()) {
            //改变订单状态为退款中
            Order order = orderService.getById(orderId);

            //确保取消订单状态一旦确定不可以修改
            if (!ObjUtil.isEmpty(order) && (order.getCancelOrderType()==null||order.getCancelOrderType()==5)) {
                order.setCancelOrderType(refundApply.getCancelOrderType());
                orderService.updateById(order);
            }
            if (OrderState.NOT_PAY.getValue().equals(order.getState())) {
                orderService.cancelOrder(orderId, refundApply.getRefundReason());
                return;
            }

            if (OrderState.REFUNDING.getValue().equals(order.getState()) || OrderState.REFUNDED.getValue().equals(order.getState())) {
                throw new BusinessException("已存在退款，无法再次退款");
            }
            if (OrderState.APPROVAL_REFUNDING.getValue().equals(order.getState())) {
                throw new BusinessException("已存在退款审批，无需重复提交");
            }

            if (OrderState.TIMEOUT.getValue().equals(order.getState()) || OrderState.CANCELED.getValue().equals(order.getState())) {
                throw new BusinessException("订单已取消，无法再次退款");
            }
            //开始前30分钟取消订单的。不需要走审批
            if (RefundType.CANCEL.getValue().equals(refundApply.getType())) {
                List<OrderDetail> orderDetails = orderDetailService.listByOrderId(order.getId());
                LocalDateTime startTime = orderDetails.get(0).getStartTime();
                if (LocalDateTime.now().isBefore(startTime.minusMinutes(30)) || OrderState.NOT_PAY.getValue().equals(order.getState())) {
                    orderService.cancelOrder(orderId, refundApply.getRefundReason());
                    return;
                }
            }
            refundApply.setOrderState(order.getState());
            refundApply.setAppointmentState(order.getAppointmentState());
            refundApply.setCustomerId(order.getCustomerId());

            // 取消订单（同时退款）
            if (RefundType.CANCEL.getValue().equals(refundApply.getType())) {
                refundApply.setRefundReason(refundApply.getRefundReason());
                refundApply.setRefundAmount(order.getPayAmount());
                order.setAppointmentState(AppointmentState.CANCELED.getValue());
                orderDetailService.refundOrder(orderId, true);
            }

            order.setState(OrderState.APPROVAL_REFUNDING.getValue());
            if (OrderType.COUPON.getValue().equals(order.getType())) {//卡卷订单
                List<CustomerCoupon> customerCoupons = customerCouponService.listByOrderId(order.getId());
                List<CustomerCoupon> customerCouponList = customerCoupons.stream().filter(e -> e.getState().equals(CouponState.EFFECTIVE.getValue())).collect(Collectors.toList());
                customerCouponList.forEach(e -> e.setState(CouponState.REFUND_CANCEL.getValue()));
                customerCouponService.updateBatchById(customerCouponList);
                GiveGift giveGift = giveGiftService.getByOrderId(order.getId());
                if (!ObjUtil.isEmpty(giveGift) && (giveGift.getState().equals(GiveGiftState.NO_SEND.getValue()) || giveGift.getState().equals(GiveGiftState.DOING.getValue()))) {
                    giveGift.setState(GiveGiftState.CANCELED.getValue());
                    giveGiftService.updateById(giveGift);
                }
                order.setAppointmentState(AppointmentState.CANCELED.getValue());
            }
            orderService.updateById(order);
            if (refundApply.getId() == null) {
                //增加退款申请
                Long flowApprovalId = approvalDetailService.addRelationOrderId(refundApply.getOrderId(), refundApply.getShopId(), FlowCategoryCode.REFUND, refundApply.getCreateUser());
                refundApply.setApprovalId(flowApprovalId);
                refundApply.setRefundStatus(FlowState.APPROVING.getValue());
                save(refundApply);
            } else {
                //重提逻辑
                refundApply.setRefundStatus(FlowState.APPROVING.getValue());
                updateById(refundApply);
                approvalDetailService.reSubmit(refundApply.getApprovalId());
            }
        }
    }


    @Override
    @Transactional(rollbackFor = Exception.class)
    public void changeRelateRecordState(Long approvalId, FlowState state) {
        RefundApply refundApply = getRefundApply(approvalId);
        Long orderId = refundApply.getOrderId();
        if (FlowState.PASSED.equals(state)) {
            //改变订单状态
            refundApply.setPassTime(LocalDateTime.now());
            orderService.refundOrder(orderId, refundApply.getRefundAmount(), refundApply.getType());
            Order order = orderService.getById(orderId);
            order.setCancelReason(refundApply.getRefundReason());
            orderService.updateById(order);
        } else if (FlowState.REJECTED.equals(state)) {
            Order order = orderService.getById(orderId);
            order.setState(refundApply.getOrderState());
            order.setAppointmentState(refundApply.getAppointmentState());
            if (OrderType.COUPON.getValue().equals(order.getType())) {
                List<CustomerCoupon> customerCoupons = customerCouponService.listByOrderId(order.getId());
                List<CustomerCoupon> customerCouponList = customerCoupons.stream().filter(e -> e.getState().equals(CouponState.REFUND_CANCEL.getValue())).collect(Collectors.toList());
                customerCouponService.verifyEndTime(customerCouponList);
                //order.setAppointmentState(AppointmentState.FINISHED.getValue());
            } else {
                //order.setAppointmentState(AppointmentState.DOING.getValue());
                orderDetailService.changeCancel2Doing(orderId);
            }
            GiveGift giveGift = giveGiftService.getByOrderId(order.getId());
            if (!ObjUtil.isEmpty(giveGift) && GiveGiftState.CANCELED.getValue().equals(giveGift.getState())) {
                giveGift.setState(GiveGiftState.NO_SEND.getValue());
                giveGiftService.updateById(giveGift);
            }
            orderService.updateById(order);
        }
        refundApply.setRefundStatus(state.getValue());
        updateById(refundApply);
    }

    @Override
    public void deleteByApprovalId(Long approvalId) {
        LambdaQueryWrapper<RefundApply> lqw = new LambdaQueryWrapper<>();
        lqw.eq(RefundApply::getApprovalId, approvalId);
        remove(lqw);
    }

    @Override
    public RefundApply detail(Long approvalId) {
        RefundApply refundApply = getRefundApply(approvalId);
        if (refundApply.getOrderId() != null) {
            Order order = orderService.getById(refundApply.getOrderId());
            String code = order.getCode();
            refundApply.setOrderCode(code);
        }
        return refundApply;
    }

    private RefundApply getRefundApply(Long approvalId) {
        LambdaQueryWrapper<RefundApply> lqw = new LambdaQueryWrapper<>();
        lqw.eq(RefundApply::getApprovalId, approvalId);
        RefundApply onlyOne = getOnlyOne(lqw);
        return onlyOne;
    }

    public RefundApply getByOrderId(Long orderId) {
        LambdaQueryWrapper<RefundApply> lqw = new LambdaQueryWrapper<>();
        lqw.eq(RefundApply::getOrderId, orderId);
        RefundApply onlyOne = getOnlyOne(lqw);
        return onlyOne;
    }
}