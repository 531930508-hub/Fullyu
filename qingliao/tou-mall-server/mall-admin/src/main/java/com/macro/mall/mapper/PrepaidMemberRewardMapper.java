package com.macro.mall.mapper;

import org.apache.ibatis.annotations.*;
import java.util.List;

/** 完成消费事务只写任务；评估者在提交后读取最新已提交的券/订单状态。 */
@Mapper
public interface PrepaidMemberRewardMapper {
    @Insert("INSERT INTO n_prepaid_member_reward_task(source_order_id,state,attempts,next_attempt_at,create_time,update_time) " +
        "SELECT DISTINCT c.order_id,'PENDING',0,NOW(),NOW(),NOW() FROM sms_customer_coupon c " +
        "JOIN s_order source ON source.id=c.order_id JOIN s_order usage_order ON usage_order.id=c.use_order " +
        "WHERE c.use_order=#{orderId} AND c.use_type=0 AND source.reward_member_months>0 " +
        "AND source.state IN(1,2) AND COALESCE(source.is_gift,0)=0 AND source.pay_amount>0 " +
        "AND usage_order.state IN(1,2) AND usage_order.appointment_state=2 " +
        "ON DUPLICATE KEY UPDATE state='PENDING',next_attempt_at=NOW(),update_time=NOW()")
    int queue(@Param("orderId") Long orderId);

    @Select("SELECT source_order_id FROM n_prepaid_member_reward_task WHERE state='PENDING' AND next_attempt_at<=NOW() ORDER BY next_attempt_at,source_order_id LIMIT 100")
    List<Long> due();

    @Select("SELECT state FROM n_prepaid_member_reward_task WHERE source_order_id=#{sourceOrderId} FOR UPDATE")
    String lock(@Param("sourceOrderId") Long sourceOrderId);

    @Update("UPDATE n_prepaid_member_reward_task SET state='DONE',update_time=NOW() WHERE source_order_id=#{sourceOrderId} AND state='PENDING'")
    int finish(@Param("sourceOrderId") Long sourceOrderId);

    @Update("UPDATE n_prepaid_member_reward_task SET attempts=attempts+1,next_attempt_at=DATE_ADD(NOW(),INTERVAL 1 MINUTE),update_time=NOW() WHERE source_order_id=#{sourceOrderId} AND state='PENDING'")
    int defer(@Param("sourceOrderId") Long sourceOrderId);
}
