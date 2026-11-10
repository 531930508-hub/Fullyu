package com.macro.mall.incentive.mapper;

import com.macro.mall.entity.Massagist;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.util.List;

/** 培训人员先在数据库分页；姓名查询按字面匹配，不将 %/_ 当作通配符。 */
public interface TrainingRecordPageMapper {
    String FILTER = "<where>"
            + " <if test='shopId != null'>m.shop_id=#{shopId}</if>"
            + " <if test='status != null'>AND m.status=#{status}</if>"
            + " <if test='keyword != null and keyword != &quot;&quot;'>AND INSTR(m.name,#{keyword}) &gt; 0</if>"
            + " </where>";

    @Select("<script>SELECT COUNT(*) FROM s_massagist m " + FILTER + "</script>")
    long countPeople(@Param("shopId") Long shopId, @Param("status") Integer status,
                     @Param("keyword") String keyword);

    @Select("<script>SELECT m.id,m.name,m.shop_id,m.status,m.entry_day FROM s_massagist m "
            + "LEFT JOIN s_shop s ON s.id=m.shop_id " + FILTER
            + " ORDER BY s.name IS NULL,s.name,m.name IS NULL,m.name,m.id LIMIT #{offset},#{size}</script>")
    List<Massagist> selectPeople(@Param("shopId") Long shopId, @Param("status") Integer status,
                                @Param("keyword") String keyword, @Param("offset") int offset,
                                @Param("size") int size);
}
