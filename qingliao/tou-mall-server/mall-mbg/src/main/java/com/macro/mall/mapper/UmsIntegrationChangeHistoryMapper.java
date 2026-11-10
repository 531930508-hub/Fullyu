package com.macro.mall.mapper;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;

import com.macro.mall.model.UmsIntegrationChangeHistory;
import com.macro.mall.model.UmsIntegrationChangeHistoryExample;
import java.util.List;
import org.apache.ibatis.annotations.Param;

public interface UmsIntegrationChangeHistoryMapper  extends BaseMapper<UmsIntegrationChangeHistory >{
    long countByExample(UmsIntegrationChangeHistoryExample example);

    int deleteByExample(UmsIntegrationChangeHistoryExample example);

    int deleteByPrimaryKey(Long id);

    int insert(UmsIntegrationChangeHistory record);

    int insertSelective(UmsIntegrationChangeHistory record);

    List<UmsIntegrationChangeHistory> selectByExample(UmsIntegrationChangeHistoryExample example);

    UmsIntegrationChangeHistory selectByPrimaryKey(Long id);

    int updateByExampleSelective(@Param("record") UmsIntegrationChangeHistory record, @Param("example") UmsIntegrationChangeHistoryExample example);

    int updateByExample(@Param("record") UmsIntegrationChangeHistory record, @Param("example") UmsIntegrationChangeHistoryExample example);

    int updateByPrimaryKeySelective(UmsIntegrationChangeHistory record);

    int updateByPrimaryKey(UmsIntegrationChangeHistory record);
}
