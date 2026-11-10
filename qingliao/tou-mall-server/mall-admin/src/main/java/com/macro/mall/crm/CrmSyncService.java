package com.macro.mall.crm;

import com.macro.mall.common.exception.BusinessException;
import com.macro.mall.entity.Customer;
import com.macro.mall.mapper.CustomerWxMapper;
import com.macro.mall.service.IntegrationService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * 轻疗客户与会员中心的身份映射。
 *
 * <p>只上传 CRM 需要的字段：本地 id、手机号、昵称、性别、小程序 openId 与 unionId。
 * 手机号是会员唯一身份，大陆号码与带国家码的境外号码都原样上传，由 CRM 统一归一化。</p>
 */
@Service
@Slf4j
public class CrmSyncService {
    /** 与轻疗原“新客奖励”规则一致的积分值 */
    private static final long WELCOME_POINTS = 66L;
    private static final int NAME_MAX = 20;
    private static final int AVATAR_MAX = 500;

    @Autowired
    private CrmClient crmClient;

    @Autowired
    private CustomerWxMapper customerWxMapper;

    @Autowired
    @Lazy
    private IntegrationService integrationService;

    public boolean isActive() {
        return crmClient.isActive();
    }

    /** 登录 / 个人中心读取 CRM 余额；未同步时顺带补建身份。 */
    public long balanceOf(Customer customer) {
        if (!isActive() || customer == null || customer.getId() == null) {
            return 0L;
        }
        CrmMember known = crmClient.getByLocalUser(String.valueOf(customer.getId()));
        if (known != null) {
            return known.getBalance();
        }
        return crmClient.resolve(identityOf(customer)).getBalance();
    }

    /**
     * 登录成功后确认 CRM 身份，返回 CRM 余额。CRM 故障时抛出业务异常。
     * 仅对“本次才在 CRM 新建”的会员发放新客奖励，避免每次登录重复判断。
     */
    public long ensureIdentity(Customer customer) {
        return ensure(customer).getBalance();
    }

    /** 写积分前先确认身份存在；本次新建的会员按原规则补发 66 分新客奖励。 */
    private CrmMember ensure(Customer customer) {
        CrmMember member = crmClient.resolve(identityOf(customer));
        if (member.isCreated()) {
            member = crmClient.earn(String.valueOf(customer.getId()), WELCOME_POINTS,
                    "新客奖励", "welcome:" + customer.getId());
        }
        return member;
    }

    /** CRM 入账；ref 由调用方给出，重复请求按 ref 幂等，返回入账后余额。 */
    public long earn(Customer customer, long points, String reason, String ref) {
        ensure(customer);
        return crmClient.earn(String.valueOf(customer.getId()), points, reason, ref).getBalance();
    }

    /** CRM 扣减；余额不足时抛 status=422 的业务异常，返回扣减后余额。 */
    public long consume(Customer customer, long points, String reason, String ref) {
        ensure(customer);
        return crmClient.consume(String.valueOf(customer.getId()), points, reason, ref).getBalance();
    }

    /**
     * 历史积分迁移：把轻疗本地有效积分一次性写入 CRM，ref 固定为 migrate:{id}，重复执行不重复入账。
     * 返回迁移后的 CRM 余额；本地积分为 0 时不调用。
     */
    public long migrateBalance(Customer customer, long localBalance) {
        if (localBalance > 0) {
            CrmMember member = crmClient.earn(String.valueOf(customer.getId()), localBalance,
                    "历史积分迁移（轻疗本地账本）", "migrate:" + customer.getId());
            return member.getBalance();
        }
        CrmMember known = crmClient.getByLocalUser(String.valueOf(customer.getId()));
        return known == null ? 0L : known.getBalance();
    }

    public CrmIdentity identityOf(Customer customer) {
        CrmIdentity identity = new CrmIdentity();
        identity.setLocalUserId(String.valueOf(customer.getId()));
        // 手机号是 CRM 跨端唯一身份：大陆 11 位和境外 +国家码都要传，交给 CRM 统一归一化。
        String phone = trim(customer.getPhone());
        if (phone != null) {
            identity.setPhone(phone);
        }
        String name = trim(customer.getNickname());
        if (name != null) {
            identity.setName(truncateCodePoints(name, NAME_MAX));
        }
        Integer gender = customer.getGender();
        if (gender != null && (gender == 1 || gender == 2)) {
            identity.setGender(gender);
        }
        String openId = trim(customer.getOpenId());
        if (openId != null) {
            identity.setOpenId(openId);
            String unionId = unionIdOf(openId);
            if (unionId != null) {
                identity.setUnionId(unionId);
            }
        }
        String avatar = trim(customer.getAvatar());
        if (avatar != null && avatar.length() <= AVATAR_MAX
                && (avatar.startsWith("http://") || avatar.startsWith("https://"))) {
            identity.setAvatarUrl(avatar);
        }
        return identity;
    }

    /** 批量导入（调用方负责按 id 升序分页，单批不超过 500）。 */
    public CrmImportResult importBatch(List<Customer> customers, boolean includeBalance) {
        if (customers == null || customers.isEmpty()) {
            return new CrmImportResult();
        }
        List<CrmIdentity> identities = new ArrayList<>(customers.size());
        for (Customer customer : customers) {
            identities.add(identityOf(customer));
        }
        CrmImportResult result = crmClient.importMembers(identities);
        if (includeBalance) {
            migrateBalances(customers, result);
        }
        log.info("会员中心导入批次完成，提交 {} 条，新建 {}，绑定 {}，已存在 {}，迁移积分 {} 人/{} 分，失败 {}",
                identities.size(), result.getCreated(), result.getBound(), result.getUnchanged(),
                result.getMigratedMembers(), result.getMigratedPoints(), result.getFailed().size());
        return result;
    }

    /** 身份导入成功后迁移本地积分；身份导入失败的成员跳过，避免把失败原因再叠加一遍。 */
    private void migrateBalances(List<Customer> customers, CrmImportResult result) {
        Set<String> failedIds = new HashSet<>();
        for (CrmImportResult.Failure failure : result.getFailed()) {
            failedIds.add(failure.getLocalUserId());
        }
        for (Customer customer : customers) {
            String localUserId = String.valueOf(customer.getId());
            if (failedIds.contains(localUserId)) {
                continue;
            }
            // 迁移源必须是本地账本，不能走已切到 CRM 的余额读取
            long localBalance = integrationService.getLocalIntegrationByCustomerId(customer.getId());
            if (localBalance <= 0) {
                continue;
            }
            try {
                migrateBalance(customer, localBalance);
                result.setMigratedMembers(result.getMigratedMembers() + 1);
                result.setMigratedPoints(result.getMigratedPoints() + localBalance);
            } catch (BusinessException e) {
                CrmImportResult.Failure failure = new CrmImportResult.Failure();
                failure.setLocalUserId(localUserId);
                failure.setReason("积分迁移失败：" + e.getMessage());
                result.getFailed().add(failure);
                log.warn("历史积分迁移失败，customerId={}，原因={}", customer.getId(), e.getMessage());
            }
        }
    }

    private String unionIdOf(String openId) {
        try {
            return trim(customerWxMapper.findUnionIdByMaOpenId(openId));
        } catch (RuntimeException e) {
            // 微信关注记录缺失不应阻断登录，只是少一个跨业务匹配维度
            log.warn("查询微信 unionId 失败，openId 记录可能尚未同步");
            return null;
        }
    }

    /** CRM 昵称上限 20 字，按码点截断避免把 emoji 截成半个代理对。 */
    private static String truncateCodePoints(String text, int maxCodePoints) {
        if (text.codePointCount(0, text.length()) <= maxCodePoints) {
            return text;
        }
        return text.substring(0, text.offsetByCodePoints(0, maxCodePoints));
    }

    private static String trim(String value) {
        if (!StringUtils.hasText(value)) {
            return null;
        }
        return value.trim();
    }
}
