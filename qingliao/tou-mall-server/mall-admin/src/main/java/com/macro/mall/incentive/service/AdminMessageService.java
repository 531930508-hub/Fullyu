package com.macro.mall.incentive.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.macro.mall.common.exception.BusinessException;
import com.macro.mall.incentive.dto.AdminRecipient;
import com.macro.mall.incentive.entity.AdminMessage;
import com.macro.mall.incentive.entity.MonthlySettlement;
import com.macro.mall.incentive.mapper.AdminMessageMapper;
import com.macro.mall.service.base.BaseService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 后台站内消息：结算单草稿/确认/发布三类动作的收件箱提醒。
 *
 * <p>投递口径：运营/财务/超管等全局角色永远可见全部门店；
 * 店长只收自己门店的消息；疗愈师只收自己那张结算单的消息。
 * 幂等键 (bizKey, adminId) 保证同一动作重复执行不会重复提醒。</p>
 */
@Service
public class AdminMessageService extends BaseService<AdminMessageMapper, AdminMessage> {

    private static final Logger LOGGER = LoggerFactory.getLogger(AdminMessageService.class);

    @Value("${incentive.global-roles:超级管理员,总助,运营,财务,admin}")
    private String globalRoles;

    @Value("${incentive.shop-manager-roles:店长}")
    private String shopManagerRole;

    @Autowired
    private IncentiveAccessService accessService;

    public long unreadCount() {
        Long adminId = accessService.currentAdmin().getId();
        return count(new LambdaQueryWrapper<AdminMessage>()
                .eq(AdminMessage::getAdminId, adminId)
                .isNull(AdminMessage::getReadTime));
    }

    public Map<String, Object> page(Integer page, Integer size, Boolean unreadOnly) {
        Long adminId = accessService.currentAdmin().getId();
        int pageNo = page == null || page < 1 ? 1 : page;
        int pageSize = size == null || size < 1 ? 20 : Math.min(size, 100);
        LambdaQueryWrapper<AdminMessage> lqw = new LambdaQueryWrapper<AdminMessage>()
                .eq(AdminMessage::getAdminId, adminId);
        if (Boolean.TRUE.equals(unreadOnly)) {
            lqw.isNull(AdminMessage::getReadTime);
        }
        lqw.orderByDesc(AdminMessage::getCreateTime).orderByDesc(AdminMessage::getId);
        Page<AdminMessage> result = page(new Page<>(pageNo, pageSize), lqw);
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("list", result.getRecords());
        map.put("total", result.getTotal());
        map.put("unread", unreadCount());
        return map;
    }

    @Transactional(rollbackFor = Exception.class)
    public boolean markRead(Long id) {
        AdminMessage message = getById(id);
        if (message == null) {
            throw new BusinessException("消息不存在");
        }
        Long adminId = accessService.currentAdmin().getId();
        if (!adminId.equals(message.getAdminId())) {
            throw new BusinessException("无权操作该消息");
        }
        if (message.getReadTime() == null) {
            message.setReadTime(LocalDateTime.now());
            updateById(message);
        }
        return true;
    }

    @Transactional(rollbackFor = Exception.class)
    public int markAllRead() {
        Long adminId = accessService.currentAdmin().getId();
        List<AdminMessage> unread = list(new LambdaQueryWrapper<AdminMessage>()
                .eq(AdminMessage::getAdminId, adminId)
                .isNull(AdminMessage::getReadTime));
        LocalDateTime now = LocalDateTime.now();
        for (AdminMessage message : unread) {
            message.setReadTime(now);
        }
        if (!unread.isEmpty()) {
            updateBatchById(unread);
        }
        return unread.size();
    }

    /**
     * 结算单动作汇总消息。toGlobal 投给运营/财务/超管；toManagers 投给对应门店店长。
     */
    public void notifySettlementSummary(String type, String month, Long shopId, String shopName,
                                        int count, BigDecimal totalNet,
                                        boolean toGlobal, boolean toManagers) {
        if (count <= 0) {
            return;
        }
        String scope = shopId == null ? "全部门店" : (shopName == null ? "门店" + shopId : shopName);
        String actionText = actionText(type);
        String title = month + " 月度结算单" + actionText;
        String content = scope + "共 " + count + " 人，应发合计 ¥" + money(totalNet) + "，" + actionText + "。";
        String link = "/salary/incentive?tab=settlement&month=" + month
                + (shopId == null ? "" : "&shopId=" + shopId);
        String bizKey = type + ":" + month + ":" + (shopId == null ? "all" : shopId);
        Set<Long> recipients = new LinkedHashSet<>();
        if (toGlobal) {
            recipients.addAll(globalAdminIds());
        }
        if (toManagers && shopId != null) {
            recipients.addAll(shopManagerIds(shopId));
        }
        deliver(type, month, shopId, title, content, link, bizKey, recipients);
    }

    /**
     * 发布通知：投给疗愈师本人绑定的后台账号。
     */
    public void notifySettlementPublishedToTherapist(MonthlySettlement row) {
        if (row == null || row.getMassagistId() == null) {
            return;
        }
        Set<Long> recipients = new LinkedHashSet<>(getBaseMapper().selectAdminIdsByMassagistPhone(row.getMassagistId()));
        Long bound = getBaseMapper().selectAdminIdByMassagistBind(row.getMassagistId());
        if (bound != null && bound > 0) {
            recipients.add(bound);
        }
        if (recipients.isEmpty()) {
            return;
        }
        String title = row.getMonthCode() + " 结算单已发布";
        String content = "本月应发 ¥" + money(row.getNet())
                + "（税前 ¥" + money(row.getPreTax()) + "，个税 ¥" + money(row.getTax())
                + "）。可在「我的接单奖励」查看明细。";
        String link = "/my-rewards?month=" + row.getMonthCode();
        String bizKey = AdminMessage.TYPE_SETTLEMENT_PUBLISHED + ":" + row.getMonthCode()
                + ":m" + row.getMassagistId();
        deliver(AdminMessage.TYPE_SETTLEMENT_PUBLISHED, row.getMonthCode(), row.getShopId(),
                title, content, link, bizKey, recipients);
    }

    private void deliver(String type, String month, Long shopId, String title, String content,
                         String link, String bizKey, Collection<Long> adminIds) {
        if (adminIds == null || adminIds.isEmpty()) {
            return;
        }
        for (Long adminId : adminIds) {
            if (adminId == null) {
                continue;
            }
            long exists = count(new LambdaQueryWrapper<AdminMessage>()
                    .eq(AdminMessage::getBizKey, bizKey)
                    .eq(AdminMessage::getAdminId, adminId));
            if (exists > 0) {
                continue;
            }
            AdminMessage message = new AdminMessage();
            message.setType(type);
            message.setTitle(title);
            message.setContent(content);
            message.setLink(link);
            message.setShopId(shopId);
            message.setMonthCode(month);
            message.setAdminId(adminId);
            message.setBizKey(bizKey);
            try {
                save(message);
            } catch (Exception e) {
                // 并发下唯一键冲突视为已投递，不影响主流程。
                LOGGER.warn("站内消息投递失败 bizKey={} adminId={}", bizKey, adminId, e);
            }
        }
    }

    private List<Long> globalAdminIds() {
        List<String> roles = split(globalRoles);
        if (roles.isEmpty()) {
            return new ArrayList<>();
        }
        List<AdminRecipient> recipients = getBaseMapper().selectAdminsByRoleNames(roles);
        List<Long> ids = new ArrayList<>();
        for (AdminRecipient recipient : recipients) {
            ids.add(recipient.getId());
        }
        return ids;
    }

    private List<Long> shopManagerIds(Long shopId) {
        List<String> roles = split(shopManagerRole);
        List<Long> ids = new ArrayList<>();
        for (String role : roles) {
            for (AdminRecipient recipient : getBaseMapper().selectAdminsByRoleName(role)) {
                if (coversShop(recipient, shopId)) {
                    ids.add(recipient.getId());
                }
            }
        }
        return ids;
    }

    private boolean coversShop(AdminRecipient recipient, Long shopId) {
        if (recipient == null || shopId == null) {
            return false;
        }
        if (shopId.equals(recipient.getShopId())) {
            return true;
        }
        String raw = recipient.getShopIdArr();
        if (raw == null || raw.trim().isEmpty()) {
            return false;
        }
        String cleaned = raw.replace("[", "").replace("]", "").replace(" ", "");
        for (String part : cleaned.split(",")) {
            if (part.isEmpty()) {
                continue;
            }
            try {
                if (shopId.equals(Long.valueOf(part))) {
                    return true;
                }
            } catch (NumberFormatException ignored) {
                // 历史脏数据直接跳过
            }
        }
        return false;
    }

    private String actionText(String type) {
        if (AdminMessage.TYPE_SETTLEMENT_DRAFT.equals(type)) {
            return "草稿待确认";
        }
        if (AdminMessage.TYPE_SETTLEMENT_CONFIRMED.equals(type)) {
            return "已确认冻结，待发布";
        }
        if (AdminMessage.TYPE_SETTLEMENT_PUBLISHED.equals(type)) {
            return "已发布";
        }
        return "已更新";
    }

    private String money(BigDecimal value) {
        return (value == null ? BigDecimal.ZERO : value).setScale(2, RoundingMode.HALF_UP).toPlainString();
    }

    private List<String> split(String config) {
        List<String> result = new ArrayList<>();
        if (config == null || config.trim().isEmpty()) {
            return result;
        }
        Arrays.stream(config.split("[,，]"))
                .map(String::trim)
                .filter(s -> !s.isEmpty())
                .forEach(result::add);
        return result;
    }
}