package com.macro.mall.mapper;

import com.macro.mall.entity.GiftCardPrepaidLog;
import org.apache.ibatis.annotations.*;

import java.util.List;
import java.util.Map;

/** 礼品卡预收台账。写入依赖唯一键 (gift_card_id,event_type) + INSERT IGNORE 实现按卡+事件幂等。 */
@Mapper
public interface GiftCardPrepaidLogMapper {
    @Insert("<script>INSERT IGNORE INTO s_gift_card_prepaid_log"
            + "(gift_card_id,code,activity_id,shop_id,event_type,amount,operator,create_time) VALUES "
            + "<foreach collection=\"list\" item=\"e\" separator=\",\">"
            + "(#{e.giftCardId},#{e.code},#{e.activityId},#{e.shopId},#{e.eventType},#{e.amount},#{e.operator},NOW())"
            + "</foreach></script>")
    int insertIgnore(@Param("list") List<GiftCardPrepaidLog> list);

    String WHERE = " WHERE 1=1"
            + "<if test=\"startTime != null and startTime != ''\"> AND l.create_time &gt;= #{startTime}</if>"
            + "<if test=\"endTime != null and endTime != ''\"> AND l.create_time &lt;= #{endTime}</if>"
            + "<if test=\"eventType != null and eventType != ''\"> AND l.event_type=#{eventType}</if>"
            + "<if test=\"code != null and code != ''\"> AND l.code LIKE CONCAT('%',#{code},'%')</if>"
            + "<if test=\"activityId != null\"> AND l.activity_id=#{activityId}</if>";

    @Select("<script>SELECT COUNT(*) AS total, COALESCE(SUM(CASE WHEN l.amount&gt;0 THEN l.amount ELSE 0 END),0) AS distributeAmount,"
            + " COALESCE(SUM(CASE WHEN l.amount&lt;0 THEN l.amount ELSE 0 END),0) AS voidAmount,"
            + " COALESCE(SUM(l.amount),0) AS netAmount FROM s_gift_card_prepaid_log l" + WHERE + "</script>")
    Map<String, Object> summary(Map<String, Object> params);

    @Select("<script>SELECT l.id, l.gift_card_id AS giftCardId, l.code, l.activity_id AS activityId, a.title AS activityName,"
            + " l.shop_id AS shopId, l.event_type AS eventType, l.amount, l.operator, u.nick_name AS operatorName,"
            + " DATE_FORMAT(l.create_time,'%Y-%m-%d %H:%i:%s') AS createTime"
            + " FROM s_gift_card_prepaid_log l LEFT JOIN s_activity a ON a.id=l.activity_id"
            + " LEFT JOIN ums_admin u ON u.id=l.operator" + WHERE
            + " ORDER BY l.create_time DESC, l.id DESC LIMIT #{offset},#{size}</script>")
    List<Map<String, Object>> page(Map<String, Object> params);
}
