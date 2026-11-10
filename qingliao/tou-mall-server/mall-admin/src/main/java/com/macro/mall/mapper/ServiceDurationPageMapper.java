package com.macro.mall.mapper;

import com.macro.mall.entity.OrderDetail;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import java.util.List;
import java.util.Map;

/** 服务时长按“月份、疗愈师”分页，先取键，再只加载该页明细。完成口径沿用原工时统计。 */
@Mapper
public interface ServiceDurationPageMapper {
    String FROM = " FROM oms_order_detail d JOIN s_massagist m ON m.id=d.massagist_id "
            + " WHERE d.state=2 AND d.end_time BETWEEN #{startTime} AND #{endTime} "
            + "<if test=\"shopId != null\"> AND d.shop_id=#{shopId} </if>"
            + "<if test=\"massagistId != null\"> AND d.massagist_id=#{massagistId} </if>"
            + "<if test=\"status != null and status >= 0\"> AND m.status=#{status} </if>";
    String GROUP = " GROUP BY DATE_FORMAT(d.end_time,'%Y-%m'),d.massagist_id ";
    @Select("<script>SELECT COUNT(*) FROM (SELECT d.massagist_id" + FROM + GROUP + ") periods</script>")
    long countPeriods(@Param("shopId") Long shopId,@Param("startTime") String startTime,@Param("endTime") String endTime,
                      @Param("massagistId") Long massagistId,@Param("status") Integer status);

    @Select("<script>SELECT d.massagist_id AS massagistId,DATE_FORMAT(d.end_time,'%Y-%m') AS periodCode"
            + FROM + GROUP + " ORDER BY periodCode DESC,massagistId ASC LIMIT #{offset},#{size}</script>")
    List<Map<String,Object>> periodKeys(@Param("shopId") Long shopId,@Param("startTime") String startTime,@Param("endTime") String endTime,
                                       @Param("massagistId") Long massagistId,@Param("status") Integer status,
                                       @Param("offset") int offset,@Param("size") int size);

    @Select("<script>SELECT d.*" + FROM
            + "<choose><when test=\"keys != null and !keys.isEmpty()\"> AND ("
            + "<foreach collection=\"keys\" item=\"key\" separator=\" OR \">"
            + "(d.massagist_id=#{key.massagistId} AND DATE_FORMAT(d.end_time,'%Y-%m')=#{key.periodCode})"
            + "</foreach>)</when><otherwise> AND 1=0 </otherwise></choose>"
            + " ORDER BY d.end_time,d.id</script>")
    List<OrderDetail> detailsForPeriods(@Param("shopId") Long shopId,@Param("startTime") String startTime,@Param("endTime") String endTime,
                                       @Param("massagistId") Long massagistId,@Param("status") Integer status,
                                       @Param("keys") List<Map<String,Object>> keys);
}
