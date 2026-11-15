package com.macro.mall.incentive.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.macro.mall.incentive.dto.AdminRecipient;
import com.macro.mall.incentive.entity.AdminMessage;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.util.List;

/**
 * 站内消息 Mapper，含接收人解析。
 */
@Mapper
public interface AdminMessageMapper extends BaseMapper<AdminMessage> {

    @Select("SELECT DISTINCT a.id, a.shop_id AS shopId, a.shop_id_arr AS shopIdArr " +
            "FROM ums_admin a " +
            "JOIN ums_admin_role_relation ar ON ar.admin_id = a.id " +
            "JOIN ums_role r ON r.id = ar.role_id " +
            "WHERE a.status = 1 AND r.name = #{roleName}")
    List<AdminRecipient> selectAdminsByRoleName(@Param("roleName") String roleName);

    @Select("<script>" +
            "SELECT DISTINCT a.id, a.shop_id AS shopId, a.shop_id_arr AS shopIdArr " +
            "FROM ums_admin a " +
            "JOIN ums_admin_role_relation ar ON ar.admin_id = a.id " +
            "JOIN ums_role r ON r.id = ar.role_id " +
            "WHERE a.status = 1 AND r.name IN " +
            "<foreach collection='roleNames' item='name' open='(' separator=',' close=')'>#{name}</foreach>" +
            "</script>")
    List<AdminRecipient> selectAdminsByRoleNames(@Param("roleNames") List<String> roleNames);

    @Select("SELECT a.id FROM ums_admin a " +
            "JOIN s_massagist m ON m.id = #{massagistId} " +
            "WHERE a.status = 1 AND TRIM(m.phone) <> '' AND TRIM(a.username) = TRIM(m.phone)")
    List<Long> selectAdminIdsByMassagistPhone(@Param("massagistId") Long massagistId);

    @Select("SELECT ums_admin_id FROM s_massagist WHERE id = #{massagistId} AND ums_admin_id IS NOT NULL")
    Long selectAdminIdByMassagistBind(@Param("massagistId") Long massagistId);
}