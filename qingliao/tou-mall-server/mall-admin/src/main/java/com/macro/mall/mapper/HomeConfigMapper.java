package com.macro.mall.mapper;

import org.apache.ibatis.annotations.*;
import java.util.List;
import java.util.Map;

/**
 * 首页角色区块配置：一个角色一行，config_json 存 {blocks:[],links:[]}。
 */
@Mapper
public interface HomeConfigMapper {
    @Select("SELECT config_json FROM ums_home_config WHERE role_id=#{roleId}")
    String config(@Param("roleId") Long roleId);

    @Select("SELECT role_id AS roleId,config_json AS configJson,update_time AS updateTime FROM ums_home_config")
    List<Map<String,Object>> all();

    @Insert("INSERT INTO ums_home_config(role_id,config_json,update_time) VALUES(#{roleId},#{json},NOW()) " +
            "ON DUPLICATE KEY UPDATE config_json=VALUES(config_json),update_time=NOW()")
    int save(@Param("roleId") Long roleId, @Param("json") String json);

    @Delete("DELETE FROM ums_home_config WHERE role_id=#{roleId}")
    int delete(@Param("roleId") Long roleId);
}