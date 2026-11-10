package com.macro.mall.service;

import com.macro.mall.common.exception.BusinessException;
import com.macro.mall.entity.CustomerCoupon;
import com.macro.mall.mapper.CustomerNoticeMapper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.LocalDate;
import java.util.*;

/** 站内提醒与订阅评估日志。此版本不含真实微信发送器，不消费真实订阅次数。 */
@Service
public class CustomerNoticeService {
    @Autowired CustomerNoticeMapper mapper;
    // 未迁移表时不触发查询，避免现有运行实例受新功能影响。
    @Value("${fullyu.notice.enabled:false}") boolean enabled;
    @Value("${fullyu.notice.coupon-template-id:}") String templateId;
    @Value("${fullyu.notice.mode:mock}") String mode;

    public boolean isEnabled() { return enabled; }
    public Map<String,Object> config() {
        Map<String,Object> result = new LinkedHashMap<>();
        result.put("enabled",enabled);
        result.put("templateId",enabled ? safeTemplate() : "");
        result.put("available",enabled && !safeTemplate().isEmpty());
        result.put("realDeliveryEnabled",false);
        return result;
    }
    private String safeTemplate() { return templateId == null ? "" : templateId.trim(); }
    private void requireCustomer(Long customerId) {
        if (customerId == null || customerId <= 0) throw new BusinessException("请先登录");
    }
    private void requireEnabled() {
        if (!enabled) throw new BusinessException("提醒功能暂未开启");
    }
    @Transactional(rollbackFor = Exception.class)
    public void notifyCoupon(CustomerCoupon candidate,LocalDate today) {
        if (!enabled || CouponExpiryPolicy.plan(candidate,today) == null) return;
        // 锁定券并重新检查，消费/转赠/回收已发生时不能用扫描所得旧快照提醒。
        CustomerCoupon current = mapper.lockCoupon(candidate.getId());
        Map<String,Object> notice = CouponExpiryPolicy.plan(current,today);
        if (notice == null) return;
        mapper.insertNotice(notice);
        String key = (String) notice.get("noticeKey");
        // 调度会重扫当天到期券；已评估过的事件不再消耗授权、不追加日志。
        if (mapper.loggedSubscription(key) != null) return;
        String template = safeTemplate();
        String status;
        if (template.isEmpty()) status = "NOT_CONFIGURED";
        else if (!"mock".equals(mode)) status = "LIVE_BLOCKED";
        else {
            Long consent = mapper.claimableConsent(current.getCustomerId(),template);
            if (consent == null) status = "NO_CONSENT";
            else if (mapper.claimConsent(consent,key) != 1) throw new BusinessException("订阅授权已被占用，稍后重试");
            else status = "MOCK";
        }
        // 与站内通知同一事务，唯一键保护多实例重复调度；MOCK不是送达，不调用外部SDK。
        mapper.logSubscription(key,current.getCustomerId(),status,template);
    }
    public Map<String,Object> page(Long customerId,int page,int size) {
        requireCustomer(customerId);
        if (page < 1 || page > 100000 || size < 1 || size > 100) throw new BusinessException("分页参数不正确");
        Map<String,Object> result = new LinkedHashMap<>();
        result.put("list",enabled ? mapper.page(customerId,(page-1)*size,size) : Collections.emptyList());
        result.put("total",enabled ? mapper.count(customerId) : 0L);
        result.put("unreadCount",unread(customerId));
        result.put("page",page); result.put("size",size);
        return result;
    }
    public long unread(Long customerId) {
        requireCustomer(customerId); return enabled ? mapper.unread(customerId) : 0L;
    }
    @Transactional(rollbackFor = Exception.class)
    public void read(Long customerId,Long id) {
        requireCustomer(customerId); requireEnabled();
        if (id == null || id <= 0 || mapper.ownedNotice(customerId,id) == null)
            throw new BusinessException("消息不存在或无权查看");
        mapper.markRead(customerId,id);
    }
    @Transactional(rollbackFor = Exception.class)
    public void readAll(Long customerId) {
        requireCustomer(customerId); requireEnabled(); mapper.readAll(customerId);
    }
    @Transactional(rollbackFor = Exception.class)
    public void consent(Long customerId,String requestedTemplate,String decision,String requestId) {
        requireCustomer(customerId); requireEnabled();
        if (safeTemplate().isEmpty() || !safeTemplate().equals(requestedTemplate))
            throw new BusinessException("提醒模板尚未配置或已变更");
        if (!Arrays.asList("accept","reject","ban").contains(decision)
                || requestId == null || !requestId.matches("[A-Za-z0-9_-]{8,80}"))
            throw new BusinessException("授权结果或请求标识不正确");
        // 记录的是客户端授权回执，不是服务端已发送或微信已送达证明。
        mapper.insertConsent(customerId,safeTemplate(),decision,requestId);
    }
}
