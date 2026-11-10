package com.macro.mall.mapper;

import org.apache.ibatis.annotations.*;
import java.util.*;

@Mapper
public interface AdminApprovalNoticeMapper {
    // 代际随重新提交在业务事务内递增，不依赖DATETIME秒级精度。
    @Insert("INSERT INTO n_admin_approval_generation(approval_id,generation) VALUES(#{approvalId},1) ON DUPLICATE KEY UPDATE generation=generation+1")
    int advanceGeneration(@Param("approvalId") Long approvalId);
    // 同一业务事务内捕获当前处理人/抄送/结果。每代抄送一次，禁止门店条件。
    @Insert("INSERT INTO n_admin_approval_notice(event_key,approval_id,detail_id,admin_id,kind,approval_state,generation,activation_at,state,attempts,next_attempt_at,create_time) " +
        "SELECT CONCAT(d.id,':',IF(d.flow_user_type=2,'PENDING',IF(a.state=2,'CC','RESULT')),':',a.state,':',COALESCE(g.generation,0)), " +
        "a.id,d.id,d.target_user_id,IF(d.flow_user_type=2,'PENDING',IF(a.state=2,'CC','RESULT')),a.state,COALESCE(g.generation,0),COALESCE(d.start_time,a.create_time),'PENDING',0,NOW(),NOW() " +
        "FROM f_approval a JOIN f_approval_detail d ON d.approval_id=a.id LEFT JOIN n_admin_approval_generation g ON g.approval_id=a.id " +
        "WHERE a.id=#{approvalId} AND a.state IN(0,2,3,4) AND d.target_user_id>0 " +
        "AND ((d.flow_user_type=2 AND d.state=2 AND a.state=2) OR d.flow_user_type=3 OR (d.flow_user_type=1 AND a.state IN(0,3,4))) " +
        "ON DUPLICATE KEY UPDATE event_key=event_key")
    int capture(@Param("approvalId") Long approvalId);
    @Select("SELECT id FROM n_admin_approval_notice WHERE state IN('PENDING','NOT_CONFIGURED','NOT_BOUND') AND next_attempt_at<=NOW() ORDER BY id LIMIT 100")
    List<Long> due();
    @Select("SELECT id,admin_id AS adminId,state,attempts,create_time AS createTime FROM n_admin_approval_notice WHERE id=#{id} AND state IN('PENDING','NOT_CONFIGURED','NOT_BOUND') AND next_attempt_at<=NOW() FOR UPDATE")
    Map<String,Object> lock(@Param("id") Long id);
    @Select("SELECT COUNT(*) FROM n_admin_approval_notice n JOIN f_approval a ON a.id=n.approval_id JOIN f_approval_detail d ON d.id=n.detail_id " +
        "WHERE n.id=#{id} AND d.target_user_id=n.admin_id AND a.state=n.approval_state " +
        "AND n.generation=COALESCE((SELECT g.generation FROM n_admin_approval_generation g WHERE g.approval_id=a.id),0) " +
        "AND ((n.kind='PENDING' AND d.flow_user_type=2 AND d.state=2 AND a.state=2) OR (n.kind='CC' AND d.flow_user_type=3 AND a.state=2) OR (n.kind='RESULT' AND d.flow_user_type IN(1,3) AND a.state IN(0,3,4)))")
    int current(@Param("id") Long id);
    @Select("SELECT COUNT(*) FROM ums_admin WHERE id=#{adminId} AND status=1")
    int activeAdmin(@Param("adminId") Long adminId);
    @Select("SELECT COUNT(*) FROM n_admin_mp_binding WHERE admin_id=#{adminId} AND app_id=#{appId} AND open_id IS NOT NULL AND following=1")
    int boundAndFollowing(@Param("adminId") Long adminId,@Param("appId") String appId);
    @Insert("INSERT INTO n_admin_approval_notice_attempt(notice_id,attempt_no,status,template_id,create_time) VALUES(#{id},#{attempt},#{status},#{templateId},NOW())")
    int attempt(@Param("id") Long id,@Param("attempt") int attempt,@Param("status") String status,@Param("templateId") String templateId);
    // 缺配置/缺绑定按1/2/4/6小时退避重评估，30天后由process结束为EXPIRED。
    // MySQL从左到右赋值：next_attempt_at必须在attempts+1之前，才能用旧次数算退避。
    @Update("UPDATE n_admin_approval_notice SET state=#{state},next_attempt_at=DATE_ADD(NOW(),INTERVAL LEAST(6,POW(2,attempts)) HOUR),attempts=attempts+1 WHERE id=#{id} AND state IN('PENDING','NOT_CONFIGURED','NOT_BOUND')")
    int defer(@Param("id") Long id,@Param("state") String state);
    @Update("UPDATE n_admin_approval_notice SET state=#{state},attempts=attempts+1,finish_time=NOW() WHERE id=#{id} AND state IN('PENDING','NOT_CONFIGURED','NOT_BOUND')")
    int finish(@Param("id") Long id,@Param("state") String state);
    @Select("SELECT n.id,n.approval_id AS approvalId,n.kind,n.state,n.create_time AS createTime,n.finish_time AS finishTime FROM n_admin_approval_notice n WHERE n.admin_id=#{adminId} ORDER BY n.id DESC LIMIT #{size} OFFSET #{offset}")
    List<Map<String,Object>> logs(@Param("adminId") Long adminId,@Param("offset") int offset,@Param("size") int size);
    @Select("SELECT COUNT(*) FROM n_admin_approval_notice WHERE admin_id=#{adminId}")
    long count(@Param("adminId") Long adminId);
}
