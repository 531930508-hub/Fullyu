package com.macro.mall.mapper;

import org.apache.ibatis.annotations.*;
import java.time.LocalDateTime;
import java.util.Map;

@Mapper
public interface AdminNoticeBindingMapper {
    @Select("SELECT COUNT(*) FROM ums_admin WHERE id=#{adminId} AND status=1")
    int activeAdmin(@Param("adminId") Long adminId);
    @Select("SELECT status FROM ums_admin WHERE id=#{adminId} FOR UPDATE")
    Integer lockAdmin(@Param("adminId") Long adminId);
    @Select("SELECT open_id AS openId,following,bound_at AS boundAt FROM n_admin_mp_binding WHERE admin_id=#{adminId} AND app_id=#{appId}")
    Map<String,Object> binding(@Param("adminId") Long adminId,@Param("appId") String appId);
    @Update("UPDATE n_admin_mp_challenge SET expires_at=NOW(),candidate_open_id=NULL,candidate_following=0 WHERE admin_id=#{adminId} AND consumed_at IS NULL")
    int expireChallenges(@Param("adminId") Long adminId);
    @Insert("INSERT INTO n_admin_mp_challenge(token_hash,admin_id,app_id,expires_at,create_time) VALUES(#{hash},#{adminId},#{appId},#{expires},NOW())")
    int insertChallenge(@Param("hash") String hash,@Param("adminId") Long adminId,@Param("appId") String appId,@Param("expires") LocalDateTime expires);
    @Select("SELECT admin_id AS adminId,app_id AS appId,expires_at AS expiresAt,consumed_at AS consumedAt,candidate_open_id AS candidateOpenId,candidate_following AS candidateFollowing,event_at AS eventAt FROM n_admin_mp_challenge WHERE token_hash=#{hash} FOR UPDATE")
    Map<String,Object> lockChallenge(@Param("hash") String hash);
    @Update("UPDATE n_admin_mp_challenge SET candidate_open_id=#{openId},candidate_following=1,event_at=#{eventAt} WHERE token_hash=#{hash} AND consumed_at IS NULL")
    int candidate(@Param("hash") String hash,@Param("openId") String openId,@Param("eventAt") LocalDateTime eventAt);
    @Update("UPDATE n_admin_mp_challenge SET consumed_at=NOW(),candidate_open_id=NULL,candidate_following=0 WHERE token_hash=#{hash} AND consumed_at IS NULL")
    int consume(@Param("hash") String hash);
    // 不用双唯一键upsert，避免同一openid冲突时误更新另一位管理员。
    @Insert("INSERT INTO n_admin_mp_binding(admin_id,app_id,open_id,following,bound_at,event_at) VALUES(#{adminId},#{appId},#{openId},1,NOW(),#{eventAt})")
    int insertBinding(@Param("adminId") Long adminId,@Param("appId") String appId,@Param("openId") String openId,@Param("eventAt") LocalDateTime eventAt);
    @Update("UPDATE n_admin_mp_binding SET open_id=#{openId},following=1,bound_at=NOW(),event_at=#{eventAt} WHERE admin_id=#{adminId} AND app_id=#{appId}")
    int updateBinding(@Param("adminId") Long adminId,@Param("appId") String appId,@Param("openId") String openId,@Param("eventAt") LocalDateTime eventAt);
    @Update("UPDATE n_admin_mp_challenge SET candidate_following=0,event_at=#{eventAt} WHERE app_id=#{appId} AND candidate_open_id=#{openId} AND consumed_at IS NULL AND (event_at IS NULL OR event_at <= #{eventAt})")
    int revokeCandidates(@Param("appId") String appId,@Param("openId") String openId,@Param("eventAt") LocalDateTime eventAt);
    @Update("UPDATE n_admin_mp_binding SET following=#{following},event_at=#{eventAt} WHERE app_id=#{appId} AND open_id=#{openId} AND (event_at IS NULL OR event_at <= #{eventAt})")
    int following(@Param("appId") String appId,@Param("openId") String openId,@Param("following") int following,@Param("eventAt") LocalDateTime eventAt);
    @Update("UPDATE n_admin_mp_binding SET open_id=NULL,following=0,bound_at=NULL WHERE admin_id=#{adminId} AND app_id=#{appId}")
    int unlink(@Param("adminId") Long adminId,@Param("appId") String appId);
    @Insert("INSERT INTO n_admin_mp_binding_audit(admin_id,action,create_time) VALUES(#{adminId},#{action},NOW())")
    int audit(@Param("adminId") Long adminId,@Param("action") String action);
    // 过期一天后的绑定凭证（含已消费）分批删除；单次上限避免长事务。
    @Delete("DELETE FROM n_admin_mp_challenge WHERE expires_at < DATE_SUB(NOW(),INTERVAL 1 DAY) LIMIT 500")
    int purgeExpiredChallenges();
}
