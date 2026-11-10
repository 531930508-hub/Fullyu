package com.macro.mall.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.macro.mall.dto.SchedulingParam;
import com.macro.mall.entity.OrderDetail;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Select;

import java.util.List;

/**
 * 订单详情 Mapper 接口
 *
 * @author ST
 * @date 2025/05/30
 */
@Mapper
public interface OrderDetailMapper extends BaseMapper<OrderDetail> {

    /**
     * 根据开始日期查找预约订单(只含门店、床位、疗愈师和起止时间)
     *
     * @param startDate
     * @return
     */
    //luxin新增
    @Select("SELECT d.* from s_order o LEFT JOIN  oms_order_detail d on d.order_id = o.id where o.type in (0,2) and o.state not in(3,4) and d.state in(0,1,2) and DATE(d.start_time) = #{startDate} and d.shop_id = #{shopId};")
    List<OrderDetail> findSimpleListByStartDateAndShopId(String startDate,long shopId);
    @Select("SELECT d.* from s_order o LEFT JOIN  oms_order_detail d on d.order_id = o.id where o.type in (0,2) and o.state not in(3,4) and d.state in(0,1,2) and DATE(d.start_time) = #{startDate};")
    List<OrderDetail> findSimpleListByStartDate(String startDate);

    @Select("SELECT d.* from s_order o LEFT JOIN  oms_order_detail d on d.order_id = o.id where o.type in (0,2) and o.state not in(3,4) and d.state in(0,1,2) and DATE(d.start_time) = #{startDate} and  o.shop_id = #{shopId} and d.project_id = #{projectId}")
    List<OrderDetail> findSimpleListByStartDateAndShopAndProject(String startDate, Long shopId, Long projectId);

    @Select("SELECT d.* from s_order o LEFT JOIN  oms_order_detail d on d.order_id = o.id where o.type in (0,2) and o.state not in(3,4) and d.state in(0,1,2) and DATE(d.start_time) = #{startDate} and  o.shop_id = #{shopId}")
    List<OrderDetail> findSimpleListByStartDateAndShop(String startDate, Long shopId);

    List<OrderDetail> listBySchedulingParam(SchedulingParam schedulingParam);

    @Select("SELECT d.* from s_order o JOIN  oms_order_detail d on d.order_id = o.id where o.type in (0,2) and o.state not in(0,3,4) and d.state in(0,1) and d.massagist_id is NOT null and d.end_time <= #{nowTime}")
    List<OrderDetail> findListByEndDate(String nowTime);

    @Select("SELECT d.* from s_order o LEFT JOIN  oms_order_detail d on d.order_id = o.id where o.type = 2 and DATE(d.start_time) = #{startDate} and  o.shop_id = #{shopId}")
    List<OrderDetail> findReceptionListByStartDateAndShop(String startDate, Long shopId);
}
