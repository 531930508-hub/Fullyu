package com.macro.mall.crm.brand;

import com.fasterxml.jackson.databind.JsonNode;
import com.macro.mall.service.MemberCardService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * CRM 卡账本对账：把 CRM 下发的会员卡同步成本地权益期（CRM 是卡的唯一真源）。
 *
 * <ul>
 *   <li>按 crmCardId 幂等 upsert，重放、重启、补跑都不会出重复卡；</li>
 *   <li>增量口径是 updatedAt 游标：进程首轮全量回填，之后按「上次成功时间 - 回看窗口」重扫；
 *       只有整轮成功且落库才推进水位，失败、未追平、dryRun 都原地重扫；</li>
 *   <li>本端只做「追平」：CRM 里没有的卡不会被删，卡的有效期与状态以 CRM 为准；</li>
 *   <li>跟随 {@code brand-crm.enabled}，CRM 客户端启用才生效，不另设同步开关；</li>
 *   <li>后台「同步 CRM 卡账本」按钮走 {@link #adminSync(boolean)}，dryRun=true 只算差异不落库。</li>
 * </ul>
 *
 * @date 2026/11/24
 */
@Slf4j
@Component
public class BrandCardSync {
    static final int DEFAULT_PAGE_SIZE = 200;
    static final int DEFAULT_MAX_PAGES = 50;
    static final int DEFAULT_LOOKBACK_DAYS = 2;
    static final int SAMPLE_LIMIT = 50;

    private static final DateTimeFormatter ISO = DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss'Z'");

    private final BrandMemberClient client;
    private final MemberCardService memberCardService;
    private final int pageSize;
    private final int maxPages;
    private final int lookbackDays;

    private final AtomicBoolean running = new AtomicBoolean(false);
    /**
     * 增量起点：只在一轮「整轮成功」后推进到本轮开始时间；失败、未追平、dryRun 都不推进。
     * null 表示进程首轮还未成功对账，下次必须全量回填。
     */
    private volatile LocalDateTime sinceWatermark;

    public BrandCardSync(BrandMemberClient client, MemberCardService memberCardService,
                         @Value("${brand-crm.card-sync-page-size:200}") int pageSize,
                         @Value("${brand-crm.card-sync-max-pages:50}") int maxPages,
                         @Value("${brand-crm.card-sync-lookback-days:2}") int lookbackDays) {
        this.client = client;
        this.memberCardService = memberCardService;
        this.pageSize = pageSize < 1 ? DEFAULT_PAGE_SIZE : Math.min(pageSize, 500);
        this.maxPages = maxPages < 1 ? DEFAULT_MAX_PAGES : Math.min(maxPages, 500);
        this.lookbackDays = lookbackDays < 0 ? DEFAULT_LOOKBACK_DAYS : lookbackDays;
    }

    public boolean isEnabled() {
        return client.isActive();
    }

    /** 每小时第 17 分跑一轮（与订单上报错开）。 */
    @Scheduled(cron = "0 17 * * * ?")
    public void tick() {
        if (!isEnabled() || !running.compareAndSet(false, true)) {
            return;
        }
        try {
            Result result = runOnce(LocalDateTime.now(), true, null);
            if (result.inserted > 0 || result.updated > 0 || result.failed > 0) {
                log.info("CRM 卡账本同步：新增 {}、更新 {}、未变 {}、跳过 {}、失败 {}（{} 页）",
                        result.inserted, result.updated, result.unchanged, result.skipped,
                        result.failed, result.pages);
            }
        } catch (Exception e) {
            log.error("CRM 卡账本同步失败", e);
        } finally {
            running.set(false);
        }
    }

    /**
     * 后台按钮入口：dryRun=true 只算差异不落库；受同一把重入锁保护，重复点击不会并发跑。
     */
    public Map<String, Object> adminSync(boolean dryRun) {
        if (!client.isActive()) {
            throw new IllegalStateException("品牌会员未启用，未配置 brand-crm.base-url");
        }
        if (!running.compareAndSet(false, true)) {
            throw new IllegalStateException("同步正在进行，请稍后再试");
        }
        try {
            Result result = runOnce(LocalDateTime.now(), !dryRun, null);
            Map<String, Object> view = result.toView();
            view.put("dryRun", dryRun);
            return view;
        } finally {
            running.set(false);
        }
    }

    /**
     * 跑一轮对账；测试直接调用。
     *
     * @param apply          false 只算差异
     * @param sinceOverride  指定起点（ISO 时间），为空时首轮全量，之后按「上次成功 - 回看窗口」
     */
    public synchronized Result runOnce(LocalDateTime now, boolean apply, String sinceOverride) {
        Result result = new Result();
        result.apply = apply;
        if (!client.isActive()) {
            return result;
        }
        LocalDateTime since = sinceWatermark;
        if (sinceOverride != null && !sinceOverride.trim().isEmpty()) {
            result.since = sinceOverride.trim();
        } else if (since != null) {
            result.since = ISO.format(since.minusDays(lookbackDays)
                    .atZone(ZoneId.systemDefault()).withZoneSameInstant(ZoneId.of("UTC")));
        }
        String cursor = null;
        for (int page = 0; page < maxPages; page++) {
            JsonNode node;
            try {
                node = client.cards(result.since, cursor, pageSize);
            } catch (BrandMemberException e) {
                result.failed++;
                result.error = "CRM 调用失败：" + e.getCode();
                log.warn("CRM 卡账本拉取失败（{}），本轮中止，下轮重跑", e.getCode());
                return result;
            } catch (RuntimeException e) {
                result.failed++;
                result.error = "CRM 调用异常：" + e.getMessage();
                log.warn("CRM 卡账本拉取异常，本轮中止：{}", e.getMessage());
                return result;
            }
            result.pages++;
            for (JsonNode row : node.path("cards")) {
                result.rows++;
                try {
                    Map<String, Object> one = memberCardService.syncCrmCard(row, apply);
                    count(result, one);
                } catch (RuntimeException e) {
                    result.failed++;
                    log.warn("CRM 卡 {} 同步失败：{}", row.path("cardId").asText(""), e.getMessage());
                }
            }
            String next = node.path("nextCursor").asText("");
            if (next.isEmpty() || next.equals(cursor)) {
                // 追平且没有单卡失败才推进水位；dryRun 不推进，避免演练吃掉真实增量窗口
                if (apply && result.failed == 0) {
                    sinceWatermark = now;
                }
                return result;
            }
            cursor = next;
        }
        result.error = "已连续拉取 " + maxPages + " 页仍未追平，下一轮继续";
        log.warn("CRM 卡账本单轮未追平（{} 页），下一轮继续", maxPages);
        return result;
    }

    private void count(Result result, Map<String, Object> one) {
        String action = String.valueOf(one.get("action"));
        switch (action) {
            case "insert":
                result.inserted++;
                break;
            case "update":
                result.updated++;
                break;
            case "unchanged":
                result.unchanged++;
                break;
            default:
                result.skipped++;
                break;
        }
        if (result.samples.size() < SAMPLE_LIMIT && !"unchanged".equals(action)) {
            result.samples.add(one);
        }
    }

    public static final class Result {
        public boolean apply;
        public String since;
        public int pages;
        public int rows;
        public int inserted;
        public int updated;
        public int unchanged;
        public int skipped;
        public int failed;
        public String error;
        public final List<Map<String, Object>> samples = new ArrayList<>();

        public Map<String, Object> toView() {
            Map<String, Object> view = new LinkedHashMap<>();
            view.put("since", since);
            view.put("pages", pages);
            view.put("rows", rows);
            view.put("inserted", inserted);
            view.put("updated", updated);
            view.put("unchanged", unchanged);
            view.put("skipped", skipped);
            view.put("failed", failed);
            view.put("error", error);
            view.put("samples", samples);
            return view;
        }
    }
}