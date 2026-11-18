package com.macro.mall.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.macro.mall.dto.SchedulingParam;
import com.macro.mall.entity.OrderDetail;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.time.LocalDateTime;
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
    @Select("SELECT d.* from s_order o LEFT JOIN  oms_order_detail d on d.order_id = o.id where o.type in (0,2) and o.state in (0,1,2) and d.state in(0,1,2) and DATE(d.start_time) = #{startDate} and d.shop_id = #{shopId};")
    List<OrderDetail> findSimpleListByStartDateAndShopId(String startDate,long shopId);
    @Select("SELECT d.* from s_order o LEFT JOIN  oms_order_detail d on d.order_id = o.id where o.type in (0,2) and o.state in (0,1,2) and d.state in(0,1,2) and DATE(d.start_time) = #{startDate};")
    List<OrderDetail> findSimpleListByStartDate(String startDate);

    @Select("SELECT d.* from s_order o LEFT JOIN  oms_order_detail d on d.order_id = o.id where o.type in (0,2) and o.state in (0,1,2) and d.state in(0,1,2) and DATE(d.start_time) = #{startDate} and  o.shop_id = #{shopId} and d.project_id = #{projectId}")
    List<OrderDetail> findSimpleListByStartDateAndShopAndProject(String startDate, Long shopId, Long projectId);

    @Select("SELECT d.* from s_order o LEFT JOIN  oms_order_detail d on d.order_id = o.id where o.type in (0,2) and o.state in (0,1,2) and d.state in(0,1,2) and DATE(d.start_time) = #{startDate} and  o.shop_id = #{shopId}")
    List<OrderDetail> findSimpleListByStartDateAndShop(String startDate, Long shopId);

    /**
     * 与 [startTime, endTime) 有交集的门店占用明细（状态口径与当天查询一致）。
     * 按时段查而不是按 DATE(start_time) 查：跨零点单（23:30→00:30）次日凌晨那段在次日列表里，
     * 只查当天会漏掉，同一疗愈师/床位在 00:00 之后会被重复预约。
     */
    @Select("SELECT d.* from s_order o JOIN oms_order_detail d on d.order_id = o.id " +
            "where o.type in (0,2) and o.state in (0,1,2) and d.state in(0,1,2) " +
            "and o.shop_id = #{shopId} and d.start_time < #{endTime} and d.end_time > #{startTime}")
    List<OrderDetail> findOverlapListByShopAndTime(@Param("shopId") Long shopId,
                                                   @Param("startTime") LocalDateTime startTime,
                                                   @Param("endTime") LocalDateTime endTime);

    List<OrderDetail> listBySchedulingParam(SchedulingParam schedulingParam);

    @Select("SELECT d.* from s_order o JOIN  oms_order_detail d on d.order_id = o.id where o.type in (0,2) and o.state not in(0,3,4) and d.state in(0,1) and d.massagist_id is NOT null and d.end_time <= #{nowTime}")
    List<OrderDetail> findListByEndDate(String nowTime);

    @Select("SELECT d.* from s_order o LEFT JOIN  oms_order_detail d on d.order_id = o.id where o.type = 2 and DATE(d.start_time) = #{startDate} and  o.shop_id = #{shopId}")
    List<OrderDetail> findReceptionListByStartDateAndShop(String startDate, Long shopId);
}
