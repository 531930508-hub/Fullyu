package com.macro.mall.incentive.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.macro.mall.incentive.entity.MassagistTrainingAssessment;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.time.LocalDateTime;
import java.util.List;

public interface MassagistTrainingAssessmentMapper extends BaseMapper<MassagistTrainingAssessment> {

    @Select("SELECT * FROM s_massagist_training_assessment "
            + "WHERE massagist_id=#{massagistId} AND project_key=#{projectKey} AND voided=0 "
            + "ORDER BY submitted_at DESC, id DESC")
    List<MassagistTrainingAssessment> latestVotes(@Param("massagistId") Long massagistId,
                                                  @Param("projectKey") String projectKey);

    @Select("SELECT id FROM s_massagist WHERE id=#{id} FOR UPDATE")
    Long lockMassagist(@Param("id") Long id);

    @Select("SELECT COUNT(*) FROM s_massagist_training_assessment "
            + "WHERE trainer_massagist_id=#{trainerId} AND massagist_id=#{massagistId} "
            + "AND project_key=#{projectKey} AND voided=0 AND submitted_at>=#{since}")
    int countRecent(@Param("trainerId") Long trainerId,
                    @Param("massagistId") Long massagistId,
                    @Param("projectKey") String projectKey,
                    @Param("since") LocalDateTime since);
}
