package com.macro.mall.crm.brand;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.macro.mall.entity.Order;
import com.macro.mall.mapper.OrderMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.regex.Pattern;

/**
 * 把轻疗已付款订单的实付、会员优惠与累计退款上报给 Full愈 CRM。
 *
 * <p>用途：每满 ¥300 得一颗愈行之旅骰子、累计“会员已享优惠”（7 天后退卡试算要扣除）。</p>
 * <ul>
 *   <li>订单表是唯一持久来源：只扫最近 7 天、有顾客、实付 &gt; 0 的已付款/退款中/已退款/审批中订单；</li>
 *   <li>只算真实收款：扫码、微信、现金。卡券核销（payType=2）在购卡时已计过，不重复；
 *       美团（payType=3）是否计入待经营确认，暂不上报；</li>
 *   <li>CRM 按 orderRef 幂等（同额重放成功、改额 409），退款按累计金额上报，重启后重放不会多发骰子；
 *       内存指纹只用来省掉无变化的请求；</li>
 *   <li>任一失败都不记指纹，下一轮继续；服务不可用时整批停下，不把失败当成功；</li>
 *   <li>默认关闭：需显式配置 {@code brand-crm.order-report-enabled=1}，且品牌会员客户端已启用。
 *       开卖品牌卡前必须打开，否则 7 天后退卡试算拿不到轻疗的会员优惠。</li>
 * </ul>
 *
 * @date 2026/11/09
 */
@Slf4j
@Component
public class BrandOrderReporter {
    static final int WINDOW_DAYS = 7;
    static final int BATCH = 50;
    static final int SCAN_LIMIT = 500;
    /** 顾客在 CRM 尚无档案（未同步/未建档）时先退避一小时，避免每分钟重复打扰。 */
    static final long MEMBER_MISSING_BACKOFF_MINUTES = 60;

    private static final Pattern ORDER_REF = Pattern.compile("^[A-Za-z0-9._:-]{1,80}$");
    private static final DateTimeFormatter CRM_TIME = DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss'+08:00'");
    private static final int STATE_PAID_NOT_COMMENT = 1;
    private static final int STATE_PAID_COMMENTED = 2;
    private static final int STATE_REFUNDING = 5;
    private static final int STATE_REFUNDED = 6;
    private static final int STATE_APPROVAL = 7;
    private static final int PAY_QR = 0;
    private static final int PAY_WECHAT = 1;
    private static final int PAY_CASH = 4;

    private final OrderMapper orderMapper;
    private final BrandMemberClient client;
    private final boolean switchedOn;

    private final AtomicBoolean running = new AtomicBoolean(false);
    private final Map<Long, String> sent = new HashMap<>();
    private final Map<String, LocalDateTime> backoff = new HashMap<>();

    public BrandOrderReporter(OrderMapper orderMapper, BrandMemberClient client,
                              @Value("${brand-crm.order-report-enabled:}") String enabled) {
        this.orderMapper = orderMapper;
        this.client = client;
        this.switchedOn = isOn(enabled);
    }

    static boolean isOn(String value) {
        if (value == null) {
            return false;
        }
        String flag = value.trim().toLowerCase(Locale.ROOT);
        return "1".equals(flag) || "true".equals(flag) || "on".equals(flag) || "yes".equals(flag);
    }

    public boolean isEnabled() {
        return switchedOn && client.isActive();
    }

    @Scheduled(cron = "30 * * * * ?")
    public void tick() {
        if (!isEnabled() || !running.compareAndSet(false, true)) {
            return;
        }
        try {
            Result result = runOnce(LocalDateTime.now());
            if (result.reported > 0 || result.refunded > 0 || result.failed > 0) {
                log.info("品牌会员订单上报：新增 {}、退款 {}、失败 {}", result.reported, result.refunded, result.failed);
            }
        } catch (Exception e) {
            log.error("品牌会员订单上报失败", e);
        } finally {
            running.set(false);
        }
    }

    /** 单轮上报；测试直接调用。 */
    public synchronized Result runOnce(LocalDateTime now) {
        Result result = new Result();
        if (!isEnabled()) {
            return result;
        }
        QueryWrapper<Order> query = new QueryWrapper<>();
        query.select("id AS id", "code AS code", "customer_id AS customerId", "pay_amount AS payAmount",
                "pay_time AS payTime", "state AS state", "has_refund_amount AS hasRefundAmount",
                "benefit_amount AS benefitAmount");
        query.in("state", STATE_PAID_NOT_COMMENT, STATE_PAID_COMMENTED, STATE_REFUNDING,
                STATE_REFUNDED, STATE_APPROVAL);
        query.in("pay_type", PAY_QR, PAY_WECHAT, PAY_CASH);
        query.isNotNull("customer_id");
        query.gt("pay_amount", 0);
        query.ge("pay_time", now.minusDays(WINDOW_DAYS));
        query.orderByAsc("pay_time");
        query.last("LIMIT " + SCAN_LIMIT);
        List<Map<String, Object>> rows = orderMapper.selectMaps(query);

        Set<Long> live = new HashSet<>();
        int attempts = 0;
        if (rows != null) {
            for (Map<String, Object> row : rows) {
                Row order = Row.of(row);
                if (order == null) {
                    result.skipped++;
                    continue;
                }
                live.add(order.id);
                if (attempts >= BATCH) {
                    continue;
                }
                if (order.fingerprint().equals(sent.get(order.id))) {
                    result.skipped++;
                    continue;
                }
                LocalDateTime until = backoff.get(order.localUserId);
                if (until != null && until.isAfter(now)) {
                    result.skipped++;
                    continue;
                }
                attempts++;
                try {
                    client.reportOrder(order.localUserId, order.orderRef, order.paidCents, order.savedCents,
                            CRM_TIME.format(order.paidAt));
                    result.reported++;
                    if (order.refundCents > 0) {
                        client.refundOrder(order.localUserId, order.orderRef, order.refundCents, CRM_TIME.format(now));
                        result.refunded++;
                    }
                    sent.put(order.id, order.fingerprint());
                    backoff.remove(order.localUserId);
                } catch (BrandMemberException e) {
                    result.failed++;
                    if (e.is("MEMBER_NOT_FOUND")) {
                        backoff.put(order.localUserId, now.plusMinutes(MEMBER_MISSING_BACKOFF_MINUTES));
                        continue;
                    }
                    if (e.getStatus() >= 400 && e.getStatus() < 500) {
                        // 契约类错误（如金额冲突）逐单记录，不阻塞其他订单；下一轮仍会重试。
                        log.warn("订单 {} 上报被拒：HTTP {} {}", order.orderRef, e.getStatus(), e.getCode());
                        continue;
                    }
                    log.warn("品牌会员 CRM 暂不可用，本轮订单上报中止（{}）", e.getCode());
                    break;
                } catch (RuntimeException e) {
                    result.failed++;
                    log.warn("品牌会员 CRM 调用异常，本轮订单上报中止：{}", e.getMessage());
                    break;
                }
            }
        }
        // 窗口外的订单不会再被扫描，清理指纹与过期退避，避免内存无限增长。
        sent.keySet().retainAll(live);
        backoff.values().removeIf(until -> !until.isAfter(now));
        return result;
    }

    static String orderRef(Long id, String code) {
        if (code != null && ORDER_REF.matcher(code.trim()).matches()) {
            return code.trim();
        }
        return "id:" + id;
    }

    static long cents(Object value) {
        if (value == null) {
            return 0;
        }
        try {
            return new BigDecimal(value.toString()).multiply(BigDecimal.valueOf(100))
                    .setScale(0, RoundingMode.HALF_UP).longValue();
        } catch (NumberFormatException e) {
            return 0;
        }
    }

    private static Long longValue(Object value) {
        if (value == null) {
            return null;
        }
        try {
            return Long.valueOf(value.toString().trim());
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private static LocalDateTime dateTime(Object value) {
        if (value instanceof LocalDateTime) {
            return (LocalDateTime) value;
        }
        if (value instanceof java.sql.Timestamp) {
            return ((java.sql.Timestamp) value).toLocalDateTime();
        }
        if (value instanceof java.util.Date) {
            return new java.sql.Timestamp(((java.util.Date) value).getTime()).toLocalDateTime();
        }
        return null;
    }

    static final class Row {
        Long id;
        String orderRef;
        String localUserId;
        long paidCents;
        long savedCents;
        long refundCents;
        LocalDateTime paidAt;

        static Row of(Map<String, Object> map) {
            if (map == null) {
                return null;
            }
            Long id = longValue(map.get("id"));
            Long customerId = longValue(map.get("customerId"));
            LocalDateTime paidAt = dateTime(map.get("payTime"));
            long paid = cents(map.get("payAmount"));
            if (id == null || customerId == null || paidAt == null || paid <= 0) {
                return null;
            }
            Row row = new Row();
            row.id = id;
            row.orderRef = orderRef(id, map.get("code") == null ? null : map.get("code").toString());
            row.localUserId = String.valueOf(customerId);
            row.paidCents = paid;
            row.savedCents = Math.max(0, cents(map.get("benefitAmount")));
            long refunded = cents(map.get("hasRefundAmount"));
            Integer state = longValue(map.get("state")) == null ? null : longValue(map.get("state")).intValue();
            if (refunded <= 0 && state != null && state == STATE_REFUNDED) {
                // 早期已退款订单没有记录退款金额，按整单退回处理。
                refunded = paid;
            }
            row.refundCents = Math.min(Math.max(0, refunded), paid);
            row.paidAt = paidAt;
            return row;
        }

        String fingerprint() {
            return paidCents + ":" + savedCents + ":" + refundCents;
        }
    }

    public static final class Result {
        public int reported;
        public int refunded;
        public int skipped;
        public int failed;
    }
}
