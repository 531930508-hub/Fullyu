package com.macro.mall.mapper;

import com.macro.mall.entity.CustomerCoupon;
import org.apache.ibatis.annotations.*;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;

@Mapper
public interface CustomerNoticeMapper {
    @Select("SELECT * FROM sms_customer_coupon WHERE id=#{id} FOR UPDATE")
    CustomerCoupon lockCoupon(@Param("id") Long id);

    @Select("SELECT * FROM sms_customer_coupon WHERE id > #{afterId} AND state=1 "
            + "AND use_order IS NULL AND use_time IS NULL AND customer_id IS NOT NULL "
            // end_time/start_time 为 DATETIME：按自然日区间匹配，避免非零点到期券被漏扫。
            + "AND (start_time IS NULL OR start_time < DATE_ADD(#{today}, INTERVAL 1 DAY)) "
            + "AND ((end_time >= #{fiveDays} AND end_time < DATE_ADD(#{fiveDays}, INTERVAL 1 DAY)) "
            + "OR (end_time >= #{threeDays} AND end_time < DATE_ADD(#{threeDays}, INTERVAL 1 DAY))) "
            + "ORDER BY id LIMIT #{size}")
    List<CustomerCoupon> dueCoupons(@Param("afterId") Long afterId, @Param("today") LocalDate today,
            @Param("fiveDays") LocalDate fiveDays, @Param("threeDays") LocalDate threeDays, @Param("size") int size);

    @Insert("INSERT INTO c_customer_notice (notice_key,customer_id,coupon_id,end_time,days,title,body,create_time) "
            + "VALUES (#{noticeKey},#{customerId},#{couponId},#{endTime},#{days},#{title},#{body},NOW()) "
            + "ON DUPLICATE KEY UPDATE notice_key=notice_key")
    int insertNotice(Map<String,Object> notice);

    @Select("SELECT id,title,body,coupon_id AS couponId,end_time AS endTime,days,read_at AS readAt,create_time AS createTime "
            + "FROM c_customer_notice WHERE customer_id=#{customerId} ORDER BY id DESC LIMIT #{offset},#{size}")
    List<Map<String,Object>> page(@Param("customerId") Long customerId, @Param("offset") int offset, @Param("size") int size);

    @Select("SELECT COUNT(*) FROM c_customer_notice WHERE customer_id=#{customerId}")
    long count(@Param("customerId") Long customerId);
    @Select("SELECT COUNT(*) FROM c_customer_notice WHERE customer_id=#{customerId} AND read_at IS NULL")
    long unread(@Param("customerId") Long customerId);
    @Select("SELECT id FROM c_customer_notice WHERE id=#{id} AND customer_id=#{customerId}")
    Map<String,Object> ownedNotice(@Param("customerId") Long customerId,@Param("id") Long id);
    @Update("UPDATE c_customer_notice SET read_at=COALESCE(read_at,NOW()) WHERE id=#{id} AND customer_id=#{customerId}")
    int markRead(@Param("customerId") Long customerId,@Param("id") Long id);
    @Update("UPDATE c_customer_notice SET read_at=NOW() WHERE customer_id=#{customerId} AND read_at IS NULL")
    int readAll(@Param("customerId") Long customerId);

    @Insert("INSERT INTO c_notice_subscription_consent (customer_id,template_id,decision,request_id,create_time) "
            + "VALUES (#{customerId},#{templateId},#{decision},#{requestId},NOW()) ON DUPLICATE KEY UPDATE request_id=request_id")
    int insertConsent(@Param("customerId") Long customerId,@Param("templateId") String templateId,
            @Param("decision") String decision,@Param("requestId") String requestId);
    // 一次性订阅：每条accept只能对应一次提醒；晚于accept的reject/ban使其失效。
    @Select("SELECT a.id FROM c_notice_subscription_consent a WHERE a.customer_id=#{customerId} AND a.template_id=#{templateId} "
            + "AND a.decision='accept' AND a.used_notice_key IS NULL AND a.create_time >= DATE_SUB(NOW(),INTERVAL 30 DAY) "
            + "AND a.id > COALESCE((SELECT MAX(r.id) FROM c_notice_subscription_consent r WHERE r.customer_id=a.customer_id "
            + "AND r.template_id=a.template_id AND r.decision IN ('reject','ban')),0) ORDER BY a.id LIMIT 1 FOR UPDATE")
    Long claimableConsent(@Param("customerId") Long customerId,@Param("templateId") String templateId);
    @Update("UPDATE c_notice_subscription_consent SET used_notice_key=#{noticeKey} WHERE id=#{id} AND used_notice_key IS NULL")
    int claimConsent(@Param("id") Long id,@Param("noticeKey") String noticeKey);
    @Select("SELECT status FROM c_notice_delivery_log WHERE notice_key=#{noticeKey} AND channel='MINI_COUPON'")
    String loggedSubscription(@Param("noticeKey") String noticeKey);
    @Insert("INSERT INTO c_notice_delivery_log (notice_key,customer_id,channel,status,template_id,create_time) "
            + "VALUES (#{noticeKey},#{customerId},'MINI_COUPON',#{status},#{templateId},NOW()) "
            + "ON DUPLICATE KEY UPDATE notice_key=notice_key")
    int logSubscription(@Param("noticeKey") String noticeKey,@Param("customerId") Long customerId,
            @Param("status") String status,@Param("templateId") String templateId);
}
