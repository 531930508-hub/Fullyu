package com.macro.mall.mapper;

import com.macro.mall.dto.TherapistStatsSource;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.util.List;
import java.util.Map;

/** 疗愈师统计：按疗愈师分页（只含区间内有已完成服务的人），再加载该页明细。完成口径同服务时长（state=2、按 end_time）。 */
@Mapper
public interface TherapistStatsMapper {
    String FROM = " FROM oms_order_detail d JOIN s_massagist m ON m.id=d.massagist_id "
            + " WHERE d.state=2 AND d.end_time BETWEEN #{startTime} AND #{endTime} "
            + "<if test=\"shopId != null\"> AND d.shop_id=#{shopId} </if>"
            + "<if test=\"status != null and status >= 0\"> AND m.status=#{status} </if>"
            + "<if test=\"ids != null and !ids.isEmpty()\"> AND d.massagist_id IN "
            + "<foreach collection=\"ids\" item=\"id\" open=\"(\" separator=\",\" close=\")\">#{id}</foreach></if>";

    @Select("<script>SELECT COUNT(DISTINCT d.massagist_id)" + FROM + "</script>")
    long countTherapists(@Param("shopId") Long shopId, @Param("startTime") String startTime,
                         @Param("endTime") String endTime, @Param("ids") List<Long> ids,
                         @Param("status") Integer status);

    @Select("<script>SELECT d.massagist_id AS massagistId, MAX(m.name) AS name, MAX(m.status) AS status,"
            + " COUNT(DISTINCT d.order_id) AS orders" + FROM
            + " GROUP BY d.massagist_id ORDER BY orders DESC, massagistId ASC"
            + "<if test=\"size > 0\"> LIMIT #{offset},#{size}</if></script>")
    List<Map<String, Object>> therapistKeys(@Param("shopId") Long shopId, @Param("startTime") String startTime,
                                            @Param("endTime") String endTime, @Param("ids") List<Long> ids,
                                            @Param("status") Integer status,
                                            @Param("offset") int offset, @Param("size") int size);

    @Select("<script>SELECT d.id AS detailId, d.massagist_id AS massagistId, d.order_id AS orderId,"
            + " d.customer_id AS customerId, d.specify_type AS specifyType, d.start_time AS startTime,"
            + " o.pay_type AS payType, o.parts AS parts, c.gender AS gender"
            + " FROM oms_order_detail d JOIN s_massagist m ON m.id=d.massagist_id"
            + " LEFT JOIN s_order o ON o.id=d.order_id LEFT JOIN c_customer c ON c.id=d.customer_id"
            + " WHERE d.state=2 AND d.end_time BETWEEN #{startTime} AND #{endTime} "
            + "<if test=\"shopId != null\"> AND d.shop_id=#{shopId} </if>"
            + "<if test=\"status != null and status >= 0\"> AND m.status=#{status} </if>"
            + " AND d.massagist_id IN "
            + "<foreach collection=\"ids\" item=\"id\" open=\"(\" separator=\",\" close=\")\">#{id}</foreach>"
            + " ORDER BY d.start_time, d.id</script>")
    List<TherapistStatsSource> sources(@Param("shopId") Long shopId, @Param("startTime") String startTime,
                                       @Param("endTime") String endTime, @Param("ids") List<Long> ids,
                                       @Param("status") Integer status);

    /** 每位顾客与该疗愈师历史上首次点钟的开始时间（不限门店、不限区间）。 */
    @Select("<script>SELECT d.massagist_id AS massagistId, d.customer_id AS customerId, MIN(d.start_time) AS firstTime"
            + " FROM oms_order_detail d WHERE d.state=2 AND d.specify_type IN (1,2) AND d.customer_id IS NOT NULL"
            + " AND d.massagist_id IN "
            + "<foreach collection=\"ids\" item=\"id\" open=\"(\" separator=\",\" close=\")\">#{id}</foreach>"
            + " GROUP BY d.massagist_id, d.customer_id</script>")
    List<Map<String, Object>> firstSpecify(@Param("ids") List<Long> ids);
}
