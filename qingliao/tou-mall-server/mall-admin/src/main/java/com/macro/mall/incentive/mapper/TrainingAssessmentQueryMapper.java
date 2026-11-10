package com.macro.mall.incentive.mapper;

import com.macro.mall.incentive.dto.TrainingAssessmentRow;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.time.LocalDate;
import java.util.List;

/**
 * 考核记录/分析/导出只读查询。默认排除作废票；详情单独查询含作废票。
 */
public interface TrainingAssessmentQueryMapper {

    String SELECT = "SELECT a.id,a.massagist_id,m.name AS massagist_name,a.shop_id,s.name AS shop_name,"
            + "a.project_key,a.project_name,a.assess_date,a.result,a.trainer_massagist_id,"
            + "a.trainer_name,a.trainer_shop_id,ts.name AS trainer_shop_name,a.remark,a.submitted_at,"
            + "a.voided,a.void_reason FROM s_massagist_training_assessment a "
            + "JOIN s_massagist m ON m.id=a.massagist_id "
            + "LEFT JOIN s_shop s ON s.id=a.shop_id "
            + "LEFT JOIN s_shop ts ON ts.id=a.trainer_shop_id ";

    String FILTER = "<where> "
            + "<choose><when test='voided != null'>AND a.voided=#{voided} </when>"
            + "<otherwise>AND a.voided=0 </otherwise></choose>"
            + "<if test='start != null'>AND a.assess_date &gt;= #{start} </if>"
            + "<if test='end != null'>AND a.assess_date &lt;= #{end} </if>"
            + "<if test='shopId != null'>AND a.shop_id=#{shopId} </if>"
            + "<if test='shopIds != null and shopIds.size() > 0'>AND a.shop_id IN "
            + "<foreach collection='shopIds' item='sid' open='(' separator=',' close=')'>#{sid}</foreach> </if>"
            + "<if test='trainerId != null'>AND a.trainer_massagist_id=#{trainerId} </if>"
            + "<if test='massagistId != null'>AND a.massagist_id=#{massagistId} </if>"
            + "<if test='projectKey != null and projectKey != &quot;&quot;'>AND a.project_key=#{projectKey} </if>"
            + "<if test='result != null'>AND a.result=#{result} </if>"
            + "</where>";

    @Select("<script>SELECT COUNT(*) FROM s_massagist_training_assessment a " + FILTER + "</script>")
    long count(@Param("start") LocalDate start, @Param("end") LocalDate end,
               @Param("shopId") Long shopId, @Param("shopIds") List<Long> shopIds,
               @Param("trainerId") Long trainerId,
               @Param("massagistId") Long massagistId, @Param("projectKey") String projectKey,
               @Param("result") Integer result, @Param("voided") Integer voided);

    @Select("<script>" + SELECT + FILTER
            + " ORDER BY a.submitted_at DESC,a.id DESC LIMIT #{offset},#{size}</script>")
    List<TrainingAssessmentRow> page(@Param("start") LocalDate start, @Param("end") LocalDate end,
                                     @Param("shopId") Long shopId, @Param("shopIds") List<Long> shopIds,
                                     @Param("trainerId") Long trainerId,
                                     @Param("massagistId") Long massagistId,
                                     @Param("projectKey") String projectKey,
                                     @Param("result") Integer result, @Param("voided") Integer voided,
                                     @Param("offset") int offset, @Param("size") int size);

    @Select("<script>" + SELECT + FILTER
            + " ORDER BY a.submitted_at DESC,a.id DESC LIMIT #{cap}</script>")
    List<TrainingAssessmentRow> allForAnalytics(@Param("start") LocalDate start,
                                                @Param("end") LocalDate end,
                                                @Param("shopId") Long shopId,
                                                @Param("shopIds") List<Long> shopIds,
                                                @Param("trainerId") Long trainerId,
                                                @Param("massagistId") Long massagistId,
                                                @Param("projectKey") String projectKey,
                                                @Param("result") Integer result,
                                                @Param("voided") Integer voided,
                                                @Param("cap") int cap);

    @Select(SELECT + "WHERE a.massagist_id=#{massagistId} AND a.project_key=#{projectKey} "
            + "ORDER BY a.submitted_at DESC,a.id DESC")
    List<TrainingAssessmentRow> history(@Param("massagistId") Long massagistId,
                                        @Param("projectKey") String projectKey);
}
