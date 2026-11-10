package com.macro.mall.service;

import cn.hutool.core.util.ObjUtil;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.github.pagehelper.PageInfo;
import com.macro.mall.common.exception.BusinessException;
import com.macro.mall.dto.MassagistRateDto;
import com.macro.mall.entity.Massagist;
import com.macro.mall.entity.MassagistRate;
import com.macro.mall.entity.Order;
import com.macro.mall.entity.OrderDetail;
import com.macro.mall.enums.AppointmentState;
import com.macro.mall.enums.FlowState;
import com.macro.mall.enums.OrderState;
import com.macro.mall.enums.approval.FlowCategoryCode;
import com.macro.mall.mapper.MassagistRateMapper;
import com.macro.mall.model.UmsAdmin;
import com.macro.mall.service.base.BaseService;
import com.macro.mall.service.base.WrapperBuilder;
import com.macro.mall.service.impl.UmsAdminServiceImpl;
import com.macro.mall.utils.CustomUtil;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.CollectionUtils;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * 疗愈师评分 服务类
 *
 * @author ST
 * @date 2025/06/04
 */
@Service
public class MassagistRateService extends BaseService<MassagistRateMapper, MassagistRate> {
    @Autowired
    OrderService orderService;
    @Autowired
    MassagistService massagistService;
    @Autowired
    @Lazy
    OrderDetailService orderDetailService;
    @Autowired
    @Lazy
    ApprovalDetailService approvalDetailService;
    @Autowired
    ApprovalCategoryService approvalCategoryService;

    @Autowired
    @Lazy
    UmsAdminServiceImpl umsAdminService;

    @Override
    protected QueryWrapper<MassagistRate> buildWrapper(Map<String, Object> params, QueryWrapper<MassagistRate> queryWrapper) {
        Object rating = params.get("rating");
        if (rating != null) {

            if (rating.toString().equals("4")) {
                queryWrapper.in("rating", 1,2,3,4);
            } else {
                queryWrapper.eq("rating", 5);
            }
        }
        return WrapperBuilder.init(queryWrapper, params)
                .equal("order_id")
                .equal("customer_id")
                .equal("massagist_id")
                .getQueryWrapper();
    }

    /**
     * 添加评分并更改订单状态
     *
     * @param massagistRateDto
     */
    @Transactional(rollbackFor = Exception.class)
    public void createRateList(MassagistRateDto massagistRateDto, Long customerId) {
        if (customerId == null || massagistRateDto == null || massagistRateDto.getOrderId() == null
                || CollectionUtils.isEmpty(massagistRateDto.getTherapistRatings())) {
            throw new BusinessException("请选择要评价的订单与疗愈师");
        }
        // 数据库行锁覆盖校验、评分写入与审批关联，避免多实例重复提交。
        Order order = orderService.getOne(new LambdaQueryWrapper<Order>()
                .eq(Order::getId, massagistRateDto.getOrderId()).last("FOR UPDATE"));
        if (order == null || !customerId.equals(order.getCustomerId())) {
            throw new BusinessException("订单不存在或不属于当前客户");
        }
        if (!OrderState.PAID_NOT_COMMENT.getValue().equals(order.getState())
                || !AppointmentState.FINISHED.getValue().equals(order.getAppointmentState())) {
            throw new BusinessException("仅已完成且未评价的订单可以评价");
        }
        Set<Long> assigned = orderDetailService.listByOrderId(order.getId()).stream()
                .map(OrderDetail::getMassagistId).collect(Collectors.toSet());
        Set<Long> seen = new HashSet<>();
        List<MassagistRate> massagistRateList = new ArrayList<>();
        for (MassagistRate input : massagistRateDto.getTherapistRatings()) {
            if (input == null || input.getMassagistId() == null || !assigned.contains(input.getMassagistId())
                    || !seen.add(input.getMassagistId())) {
                throw new BusinessException("请选择订单实际服务的疗愈师，不可重复评价");
            }
            BigDecimal rating = input.getRating();
            if (rating == null || rating.compareTo(BigDecimal.ONE) < 0
                    || rating.compareTo(BigDecimal.valueOf(5)) > 0) {
                throw new BusinessException("评分需在1到5之间");
            }
            // 仅复制客户可填写字段，不接收记录id、审批id或处理状态。
            MassagistRate record = new MassagistRate();
            record.setMassagistId(input.getMassagistId()); record.setRating(rating);
            record.setOrderId(order.getId()); record.setCustomerId(customerId);
            record.setComment(massagistRateDto.getComment());
            record.setPeopleScore(massagistRateDto.getPeopleScore());
            record.setServiceScore(massagistRateDto.getServiceScore());
            if (rating.compareTo(BigDecimal.valueOf(4)) <= 0) record.setReviewState(FlowState.NOT_SUBMIT.getValue());
            massagistRateList.add(record);
        }
        if (!saveBatch(massagistRateList)) throw new BusinessException("评价保存失败，请重试");
        order.setState(OrderState.PAID_COMMENTED.getValue());
        if (!orderService.updateById(order)) throw new BusinessException("订单评价状态保存失败");
        enqueueLowRatings(order.getId());
    }

    /** 配置未就绪时保留反馈，定时任务配置就绪后补入待办。一个订单只建一条流程。 */
    @Transactional(rollbackFor = Exception.class)
    public void enqueueLowRatings(Long orderId) {
        Order order = orderService.getOne(new LambdaQueryWrapper<Order>()
                .eq(Order::getId, orderId).last("FOR UPDATE"));
        if (order == null) return;
        List<MassagistRate> records = list(new LambdaQueryWrapper<MassagistRate>()
                .eq(MassagistRate::getOrderId, orderId).last("FOR UPDATE"));
        if (records.stream().anyMatch(record -> record.getApprovalId() != null)) return;
        List<MassagistRate> pending = records.stream()
                .filter(record -> record.getRating() != null && record.getRating().compareTo(BigDecimal.valueOf(4)) <= 0)
                .filter(record -> FlowState.NOT_SUBMIT.getValue().equals(record.getReviewState()))
                .collect(Collectors.toList());
        if (pending.isEmpty() || approvalCategoryService.findByCode(FlowCategoryCode.LOW_RATING, null) == null) return;
        // 发起者0仅表示系统，客户ID仍单独记录，绝不伪装成同ID后台账号。
        Long approvalId = approvalDetailService.add(orderId, order.getCustomerId(), null, FlowCategoryCode.LOW_RATING, 0L);
        if (approvalId == null) throw new BusinessException("反馈处理流程保存失败");
        pending.forEach(record -> {
            record.setApprovalId(approvalId); record.setReviewState(FlowState.APPROVING.getValue());
        });
        if (!updateBatchById(pending)) throw new BusinessException("反馈处理关联保存失败");
    }

    public PageInfo pageInfoComent(Map<String, Object> params) {
        PageInfo<Massagist> page = massagistService.page(params);
        List<Massagist> list = page.getList();
        buildUmsAdminUsernameNew(list);
        return page;
    }
    public void buildUmsAdminUsernameNew(List<Massagist> massagistList) {
        if (!CollectionUtils.isEmpty(massagistList)) {
            List<Long> umsAdminIds = massagistList.stream().filter(e -> !ObjUtil.isEmpty(e.getUmsAdminId())).map(Massagist::getUmsAdminId).collect(Collectors.toList());
            List<UmsAdmin> umsAdminList = umsAdminService.listByIds(umsAdminIds);
            Map<Long, String> umsAdminUserNameMap = umsAdminList.stream().collect(Collectors.toMap(UmsAdmin::getId, UmsAdmin::getUsername));
            massagistList.forEach(e -> {
                e.setUmsAdminUsername(umsAdminUserNameMap.get(e.getUmsAdminId()));
                //评分人数

                List<MassagistRate> massagistRateList=  list(new LambdaQueryWrapper<MassagistRate>().eq(MassagistRate::getMassagistId, e.getId()));
                if(CollectionUtils.isEmpty(massagistRateList)){
                   e.setAverageScore( BigDecimal.valueOf(0));
                   e.setPeopleCount(0);
                }else{
                    e.setPeopleCount(massagistRateList.size());
                    Double average = massagistRateList.stream()
                            .collect(Collectors.averagingDouble(item -> item.getRating().doubleValue()));
                    e.setAverageScore(BigDecimal.valueOf(average).setScale(2, BigDecimal.ROUND_HALF_UP));
                }
                //平均分
            });
            massagistList.sort(
                    Comparator.comparing(Massagist::getAverageScore, Comparator.reverseOrder())
            );
        }
    }

    public PageInfo pageMassagistApiRating(Map<String, Object> params) {

        PageInfo<MassagistRate> page = page(params);
        List<MassagistRate> list = page.getList();
        if (!CollectionUtils.isEmpty(list)) {
            list.forEach(e -> {
                e.setMassagistName(massagistService.findNameById(e.getMassagistId()));
            });
        }
        return  page;
    }

}