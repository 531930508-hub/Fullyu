package com.macro.mall.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.macro.mall.dto.MassagistServedCount;
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

    /**
     * 与 [startTime, endTime) 有交集的「系统占位接待」明细（就是 {@code ReceptionScheduled} 每 15 分钟补的
     * 空岗块）。真实接待单落在同一时段时要把它们收掉，人让给真实接待。
     *
     * <p>只认备注标记：{@code is_update_sort = 0} 且订单备注是「系统占位接待」。刻意不带老单
     * {@code code LIKE '%null%'} 那条——这条查询的结果会被删单，宁可漏认一张旧占位，也不误删历史真接待。</p>
     */
    @Select("SELECT d.* from s_order o JOIN oms_order_detail d on d.order_id = o.id " +
            "where o.type = 2 and o.state in (0,1,2) and d.state in(0,1,2) and o.shop_id = #{shopId} " +
            "and COALESCE(d.is_update_sort, 0) = 0 and COALESCE(o.comment, '') = '系统占位接待' " +
            "and d.start_time < #{endTime} and d.end_time > #{startTime}")
    List<OrderDetail> findOverlapPlaceholderReceptions(@Param("shopId") Long shopId,
                                                       @Param("startTime") LocalDateTime startTime,
                                                       @Param("endTime") LocalDateTime endTime);

    List<OrderDetail> listBySchedulingParam(SchedulingParam schedulingParam);

    @Select("SELECT d.* from s_order o JOIN  oms_order_detail d on d.order_id = o.id where o.type in (0,2) and o.state not in(0,3,4) and d.state in(0,1) and d.massagist_id is NOT null and d.end_time <= #{nowTime}")
    List<OrderDetail> findListByEndDate(String nowTime);

    @Select("SELECT d.* from s_order o LEFT JOIN  oms_order_detail d on d.order_id = o.id where o.type = 2 and DATE(d.start_time) = #{startDate} and  o.shop_id = #{shopId}")
    List<OrderDetail> findReceptionListByStartDateAndShop(String startDate, Long shopId);

    /**
     * 当天每人已接了几单（服务单 / 接待单分开算），给看板疗愈师卡片用。
     *
     * <p>口径与看板列表一致：订单在 (0,1,2)、明细在 (1,2)——已到店和已完成才算接过，
     * 未到店和已取消不算；窗口按明细起止时间落在 [startTime, endTime] 内，跨零点的单跟着前一天走。</p>
     *
     * <p>接待单要剔掉「没人用的系统占位」。占位单是 {@code ReceptionScheduled} 每 15 分钟补的 45 分钟
     * 占位块，没客户也会到点自动完成，不能当接待：识别见下（新单靠备注标记，老单的 code 里还留着
     * 落库前拼出来的 "null"）。但占位单一旦被前台改过（改时长 / 换人 / 加人），
     * {@code is_update_sort} 会从 0 变 1——那张单就是真接待了（2026-11-22 柠萌 15:15、16:15
     * 两场各 60 分钟的接待就是这种，曾被误剔）。所以只在 {@code is_update_sort} 仍为 0 时才剔。
     * 前台新建的接待单不带这些标记，一律算接过。</p>
     */
    @Select("SELECT d.massagist_id AS massagistId, " +
            "SUM(CASE WHEN o.type = 2 THEN 1 ELSE 0 END) AS receptionCount, " +
            "SUM(CASE WHEN o.type = 0 THEN 1 ELSE 0 END) AS serviceCount " +
            "FROM s_order o JOIN oms_order_detail d ON d.order_id = o.id " +
            "WHERE o.type IN (0,2) AND o.state IN (0,1,2) AND d.state IN (1,2) " +
            "AND d.massagist_id IS NOT NULL AND d.shop_id = #{shopId} " +
            "AND d.start_time >= #{startTime} AND d.end_time <= #{endTime} " +
            "AND NOT (o.type = 2 AND COALESCE(d.is_update_sort, 0) = 0 " +
            "AND (COALESCE(o.comment, '') = '系统占位接待' OR COALESCE(o.code, '') LIKE '%null%')) " +
            "GROUP BY d.massagist_id")
    List<MassagistServedCount> countServedByMassagist(@Param("shopId") Long shopId,
                                                      @Param("startTime") LocalDateTime startTime,
                                                      @Param("endTime") LocalDateTime endTime);
}
