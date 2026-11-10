package com.macro.mall.mapper;

import com.macro.mall.entity.MassagistSchedules;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Select;

import java.util.List;

/**
 * 疗愈师排班 Mapper 接口
 * @author zkl
 * @date 2025/06/05
 */
@Mapper
public interface MassagistSchedulesMapper extends BaseMapper<MassagistSchedules> {
    @Select("SELECT d.shop_id,d.target_shop_id,d.massagist_id,d.day,d.start_time,d.end_time,d.schedules_type,o.project_arr from s_massagist o LEFT JOIN  s_massagist_schedules d on d.massagist_id = o.id where o.project_arr like #{projectId} and  ((d.shop_id in(#{shopId}) and d.target_shop_id=0) or d.target_shop_id in(#{shopId}))   and DATE(d.day) = #{date} ORDER BY d.schedules_type ASC;")
    List<MassagistSchedules> findListByProjectIdAndShopId(long shopId, String projectId, String date);

}
