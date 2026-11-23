package com.macro.mall.service;

import cn.binarywang.wx.miniapp.api.WxMaQrcodeService;
import cn.binarywang.wx.miniapp.api.WxMaService;
import cn.hutool.core.io.IoUtil;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.github.pagehelper.PageInfo;
import com.macro.mall.bo.AdminUserDetails;
import com.macro.mall.common.exception.BusinessException;
import com.macro.mall.common.service.RedisService;
import com.macro.mall.config.wx.WxMaConfiguration;
import com.macro.mall.consts.RedisKey;
import com.macro.mall.dto.CustomerExportDto;
import com.macro.mall.crm.brand.BrandMemberProfileSync;
import com.macro.mall.entity.Customer;
import com.macro.mall.entity.CustomerMemberCard;
import com.macro.mall.entity.CustomerTag;
import com.macro.mall.entity.Integration;
import com.macro.mall.entity.MemberCardConfig;
import com.macro.mall.enums.CustomerCouponType;
import com.macro.mall.mapper.CustomerMapper;
import com.macro.mall.security.util.JwtTokenUtil;
import com.macro.mall.service.base.BaseService;
import com.macro.mall.service.base.WrapperBuilder;
import com.macro.mall.service.impl.OssServiceImpl;
import com.macro.mall.utils.*;
import lombok.extern.slf4j.Slf4j;
import me.chanjar.weixin.common.error.WxErrorException;
import org.apache.logging.log4j.util.Strings;
import org.jetbrains.annotations.NotNull;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Lazy;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.util.CollectionUtils;
import org.springframework.util.ObjectUtils;
import org.springframework.util.StringUtils;

import javax.servlet.http.HttpServletResponse;
import java.io.BufferedOutputStream;
import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.stream.Collectors;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

/**
 * 客户 服务类
 *
 * @author ST
 * @date 2025/06/04
 */
@Service
@Slf4j
public class CustomerService extends BaseService<CustomerMapper, Customer> implements RequestUtil {
    @Value("${jwt.tokenHead}")
    private String tokenHead;
    @Value("${jwt.expiration}")
    private Long expiration;
    @Autowired
    private JwtTokenUtil jwtTokenUtil;
    @Autowired
    private RedisService redisService;
    @Autowired
    @Lazy
    CustomerCouponService customerCouponService;
    @Autowired
    @Lazy
    IntegrationService integrationService;
    @Autowired
    OssServiceImpl ossService;
    @Autowired
    @Lazy
    CustomerTagService customerTagService;
    @Autowired
    @Lazy
    ActivityService activityService;
    @Autowired
    @Lazy
    com.macro.mall.crm.CrmSyncService crmSyncService;
    @Autowired
    @Lazy
    com.macro.mall.crm.brand.BrandMemberProfileSync brandMemberProfileSync;
    @Autowired
    @Lazy
    com.macro.mall.mapper.CustomerMemberCardMapper customerMemberCardMapper;
    @Autowired
    @Lazy
    com.macro.mall.mapper.MemberCardConfigMapper memberCardConfigMapper;

    /** 读不到会员卡配置时的兜底提醒天数（与年卡默认配置一致） */
    private static final int DEFAULT_BRAND_CARD_REMIND_DAYS = 30;

    @Override
    protected QueryWrapper<Customer> buildWrapper(Map<String, Object> params, QueryWrapper<Customer> queryWrapper) {
        Object customerTag = params.get("customer_tag");
        if (customerTag != null) {
            Set<Long> customerIdSet = customerTagService.findCustomerIdByTagIdList(CustomUtil.string2LongList(customerTag.toString()));
            if (!CollectionUtils.isEmpty(customerIdSet)) {
                queryWrapper.in("id", customerIdSet);
            } else {
                queryWrapper.eq("id", -1);
            }
        }
        return WrapperBuilder.init(queryWrapper, params)
                .like("phone")
                .like("comment")
                .equal("gender")
                .like("nickname")
                .between("create_time", params.get("start_create_time"), params.get("end_create_time"))
                .between("update_time", params.get("start_update_time"), params.get("end_update_time"))
                .getQueryWrapper();
    }

    /**
     * 小程序获取token
     *
     * @param params
     * @return
     */
    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> login(Map<String, String> params) {
        String phone = params.get("phone");
        if (phone == null) {
            throw new BusinessException("手机号码为空");
        }
        String openId = params.get("openId");
        String invitationCode = params.get("invitationCode");
        System.out.println("小程序登录，手机号=" + phone);
        System.out.println("小程序登录，好友邀请码=" + invitationCode);
        String activityCode = params.get("activityCode");
        String token;
        String lockKey = "phoneLock:" + phone;
        Customer customer = null;
        synchronized (lockKey.intern()) {
            try {
                customer = getByPhone(phone);
                if (customer == null) {
                    log.warn("新客户，phone={}", phone);
                    customer = initCustomer(phone, openId, invitationCode);
                    save(customer);
                    /*if (Strings.isNotBlank(invitationCode)) {
                        customerCouponService.giveCoupon(1, customer.getId(), CustomerCouponType.NEW_CUSTOMER);
                    }*/
                    //新客登录奖励66积分；会员中心开启时改由 CRM 账本发放，避免两地重复记分
                    if (!crmSyncService.isActive()) {
                        integrationService.addIntegration(66L, null, customer.getId(), "新客奖励");
                    }
                } else {
                    if (ObjectUtils.isEmpty(customer.getOpenId())) {
                        customer.setOpenId(openId);
                        updateById(customer);
                    }
                    //customer 客户如果是4月9号之后注册的会员（会员中心开启时由 CRM 侧去重发放）
                    if (!crmSyncService.isActive()
                            && customer.getCreateTime().isAfter(LocalDateTime.of(2026, 4, 10, 0, 0, 0))) {
                        Integration integration= integrationService.checkIntegrationExist66(66L,customer.getId(),"新客奖励");
                        if (integration==null){
                            integrationService.addIntegration(66L, null, customer.getId(), "新客奖励");
                        }
                    }

                }
            } catch (Exception e) {
                log.error("登录异常:{}", e.getMessage());
            }
        }
        if (customer == null) {
            throw new BusinessException("登录异常:" + phone);
        }
        if (Strings.isNotBlank(activityCode)) {
            saveCustomerTagByActivityCode(activityCode, customer.getId());
        }

        // 会员中心开启时以 CRM 为唯一积分账本。
        // CRM 故障不能挡住登录：降级为「本地登录成功 + memberSync=degraded」，
        // 小程序按「卡面保留、积分/卡期打码、显示同步中」展示，恢复后下一次请求自动回到实时数据。
        Long crmBalance = null;
        boolean memberSyncDegraded = false;
        if (crmSyncService.isActive()) {
            try {
                crmBalance = crmSyncService.ensureIdentity(customer);
            } catch (BusinessException e) {
                // 身份冲突（409）必须让顾客看到并联系客服：带着冲突档案继续下单只会更乱。
                if (e.getStatus() != 409) {
                    memberSyncDegraded = true;
                    log.warn("会员中心暂不可用，登录降级继续，customerId={} status={} message={}",
                            customer.getId(), e.getStatus(), e.getMessage());
                } else {
                    throw e;
                }
            } catch (Exception e) {
                memberSyncDegraded = true;
                log.warn("会员中心调用异常，登录降级继续，customerId={} error={}",
                        customer.getId(), e.getClass().getSimpleName());
            }
        }
        // 登录后确认过会员身份，顺手把 CRM 的称呼/头像/性别/生日拉回本地；
        // 先拉再发 token，小程序端拿到的登录态就是最新资料。
        brandMemberProfileSync.refreshQuietly(customer);

        try {
            AdminUserDetails adminUserDetails = new AdminUserDetails(customer, Collections.emptyList());
            UsernamePasswordAuthenticationToken authentication = new UsernamePasswordAuthenticationToken(customer, null, adminUserDetails.getAuthorities());
            SecurityContextHolder.getContext().setAuthentication(authentication);
            token = jwtTokenUtil.generateToken(adminUserDetails);
        } catch (AuthenticationException e) {
            throw new BusinessException("登录异常:" + phone);
        }
        if (token == null) {
            throw new BusinessException("登录异常:" + phone);
        }
        buildCustomerDetail(customer);
        if (crmBalance != null) {
            customer.setIntegration(crmBalance);
        }
        Map<String, Object> tokenMap = new HashMap<>();
        tokenMap.put("token", token);
        tokenMap.put("customer", customer);
        tokenMap.put("tokenHead", tokenHead);
        // 前端据此决定卡面数据是否可信：degraded 时保留卡面结构、打码积分与卡期、显示「同步中」。
        tokenMap.put("memberSync", memberSyncDegraded ? "degraded" : "live");

        String key = RedisKey.AUTH_KEY + token;
        redisService.set(key, customer.getId(), expiration);
        return tokenMap;
    }

    /**
     * 批量添加客户
     *
     * @param phoneList
     * @return
     */
    public List<Customer> saveBatchByPhoneList(List<String> phoneList) {
        LambdaQueryWrapper<Customer> lqw = new LambdaQueryWrapper();
        lqw.in(Customer::getPhone, phoneList);
        lqw.select(Customer::getPhone);
        List<Customer> list = list(lqw);
        if (!CollectionUtils.isEmpty(list)) {
            List<String> customerPhoneList = list.stream().map(Customer::getPhone).collect(Collectors.toList());
            phoneList = phoneList.stream().filter(s -> !customerPhoneList.contains(s)).collect(Collectors.toList());
        }
        List<Customer> customerList = phoneList.stream().map(this::initCustomer).collect(Collectors.toList());
        saveBatch(customerList);
        return customerList;
    }

    /**
     * 建号即建档：后台建单、批量导入、发券等通道都走 save/saveBatch 落库，
     * 统一在事务提交后补一次会员中心身份确认，避免“轻疗有客户、会员中心查无此人”。
     * 建档失败只记日志，不影响主流程，夜间任务会重试。
     */
    @Override
    public boolean save(Customer entity) {
        boolean saved = super.save(entity);
        if (saved) {
            ensureCrmIdentityAfterCommit(entity);
        }
        return saved;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public boolean saveBatch(Collection<Customer> entityList) {
        boolean saved = super.saveBatch(entityList);
        if (saved) {
            for (Customer customer : entityList) {
                ensureCrmIdentityAfterCommit(customer);
            }
        }
        return saved;
    }

    private void ensureCrmIdentityAfterCommit(Customer customer) {
        if (customer == null || customer.getId() == null || !crmSyncService.isActive()) {
            return;
        }
        if (!TransactionSynchronizationManager.isSynchronizationActive()) {
            crmSyncService.ensureIdentityQuietly(customer);
            return;
        }
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCommit() {
                crmSyncService.ensureIdentityQuietly(customer);
            }
        });
    }

    /**
     * 兜底补扫：把近 days 天新建的客户再确认一次会员中心身份。
     * resolve 幂等，已建档的直接 unchanged，覆盖建号时会员中心不可用或走旁路落库的客户。
     */
    public int backfillCrmIdentities(int days) {
        if (!crmSyncService.isActive()) {
            return 0;
        }
        LambdaQueryWrapper<Customer> lqw = new LambdaQueryWrapper<>();
        lqw.ge(Customer::getCreateTime, LocalDateTime.now().minusDays(days));
        List<Customer> customers = list(lqw);
        for (Customer customer : customers) {
            crmSyncService.ensureIdentityQuietly(customer);
        }
        log.info("会员中心身份补扫完成，窗口 {} 天，候选 {} 条", days, customers.size());
        return customers.size();
    }

    /**
     * 创建客户
     *
     * @param phone
     * @return
     */
    public Customer initCustomer(String phone) {
        return initCustomer(phone, null, null);
    }

    @NotNull
    public Customer initCustomer(String phone, String openId, String invitationCode) {
        if (phone == null || phone.trim().isEmpty()) {
            throw new BusinessException("手机号码不能为空");
        }
        phone = phone.trim().replaceAll("\\s+", "");
        String chinaPattern = "^1[3-9]\\d{9}$";
        String internationalPattern = "^\\+\\d{1,3}\\d{7,14}$";
        if (!(phone.matches(chinaPattern) || phone.matches(internationalPattern))) {
            throw new BusinessException("手机号码格式错误，请提供：11位中国大陆号码或国际号码（以'+'开头）");
        }
        Customer customer = new Customer();
        //默认昵称「用户+手机号后四位」，店员凭后四位认人；手机号脏数据（取不到后四位）退回随机昵称
        customer.setNickname(NicknameGenerator.defaultNickname(phone));
        customer.setPhone(phone);
        customer.setOpenId(openId);
        customer.setInvitationCode(invitationCode());
        if (Strings.isNotBlank(invitationCode)) {
            System.out.println("含邀请码，phone=" + phone);
            Long referrerCustomerId = findIdByInvitationCode(invitationCode);
            if (referrerCustomerId == null) {
                System.out.println("根据邀请码没有找到推荐人，phone=" + phone + ",invitationCode=" + invitationCode);
            }
            customer.setReferrerCustomerId(referrerCustomerId);
        } else {
            System.out.println("没有邀请码，phone=" + phone);
        }
        return customer;
    }

    private Long findIdByInvitationCode(String invitationCode) {
        LambdaQueryWrapper<Customer> queryWrapper = new LambdaQueryWrapper();
        queryWrapper.eq(Customer::getInvitationCode, invitationCode);
        queryWrapper.select(Customer::getId);
        Customer customer = getOnlyOne(queryWrapper);
        if (customer != null) {
            return customer.getId();
        }
        return null;
    }

    public String invitationCode() {
        while (true) {
            String code = CustomUtil.generateInvitationCode();
            LambdaQueryWrapper<Customer> queryWrapper = new LambdaQueryWrapper();
            queryWrapper.eq(Customer::getInvitationCode, code);
            if (count(queryWrapper) == 0) {
                return code;
            }
        }
    }

    /**
     * 根据手机号获取
     *
     * @param phone
     * @return
     */
    public Customer getByPhone(String phone) {
        LambdaQueryWrapper<Customer> lqw = new LambdaQueryWrapper<>();
        lqw.eq(Customer::getPhone, phone);
        return getOnlyOne(lqw);
    }

    /**
     * 更新头像
     *
     * @param id
     * @param avatar
     */
    public Customer updateAvatar(Long id, String avatar) {
        return updateProfile(id, profile -> profile.setAvatar(avatar));
    }

    /**
     * 更新昵称
     *
     * @param id
     * @param nickname
     */
    public Customer updateNickname(Long id, String nickname) {
        String value = nickname == null ? null : nickname.trim();
        if (value == null || value.isEmpty()
                || value.codePointCount(0, value.length()) > BrandMemberProfileSync.NICKNAME_MAX) {
            throw new BusinessException("昵称需在 1-" + BrandMemberProfileSync.NICKNAME_MAX + " 个字之间");
        }
        return updateProfile(id, profile -> profile.setNickname(value));
    }

    /**
     * 顾客个人中心统一改资料（昵称/头像/性别/生日）。
     *
     * <p>资料以 CRM 为唯一归档：CRM 推成功才落本地，推失败（版本冲突 / 服务不可用）
     * 直接把异常抛给前端，绝不让顾客以为改好了而实际两边不一致。</p>
     */
    public Customer updateProfile(Long id, java.util.function.Consumer<Customer> editor) {
        Customer customer = getById(id);
        if (customer == null) {
            throw new BusinessException("客户不存在");
        }
        editor.accept(customer);
        if (brandMemberProfileSync.isActive()) {
            // CRM 是唯一归档：先推成功（版本号同步回来）再结束请求
            brandMemberProfileSync.pushOrThrow(customer);
        } else {
            super.updateById(customer);
        }
        buildCustomerDetail(customer);
        return customer;
    }

    /**
     * 个人中心读取资料：先从 CRM 拉一次（CRM 版本更新则覆盖本地），CRM 不可用时保留本地。
     */
    public Customer getProfile(Long id) {
        Customer customer = getById(id);
        if (customer == null) {
            throw new BusinessException("客户不存在");
        }
        brandMemberProfileSync.refreshQuietly(customer);
        buildCustomerDetail(customer);
        return customer;
    }

    /**
     * 个人中心回包把头像换成可直出的地址：库里存的是 OSS key，
     * 小程序 image 组件拿到 key 显示不出头像，这里统一转成公共读地址。
     */
    private Customer displayAvatar(Customer customer) {
        if (customer != null) {
            customer.setAvatar(ossService.publicUrl(customer.getAvatar()));
        }
        return customer;
    }

    /**
     * 后台改客户资料：本地照常保存，CRM 同步失败只提示、不阻塞。
     *
     * @return 同步失败时的提示语；成功或未开会员中心返回 null
     */
    public String updateWithProfileSync(Customer customer) {
        Customer before = customer.getId() == null ? null : getById(customer.getId());
        super.updateById(customer);
        return brandMemberProfileSync.afterLocalChangeStrict(before, customer);
    }

    /**
     * 资料写入口的兜底同步：后台预约、品牌卡开通等顺带改了称呼/性别/生日时，
     * 只要资料四项有变化就尽力推一次 CRM；本地保存不受影响。
     */
    @Override
    public boolean updateById(Customer entity) {
        Customer before = entity != null && entity.getId() != null ? getById(entity.getId()) : null;
        boolean updated = super.updateById(entity);
        if (updated && before != null) {
            brandMemberProfileSync.afterLocalChange(before, entity);
        }
        return updated;
    }

    /**
     * 获取客户积分
     *
     * @param id
     * @return
     */
    public Long getIntegration(Long id) {
        if (id == null) {
            return 0L;
        }
        if (crmSyncService.isActive()) {
            Customer customer = getById(id);
            if (customer == null) {
                return 0L;
            }
            return crmSyncService.balanceOf(customer);
        }
        return integrationService.getIntegrationByCustomerId(id);
    }

    /**
     * 查找推荐人id
     *
     * @param customerId
     * @return
     */
    public Long findReferrerCustomerId(Long customerId) {
        Customer customer = getById(customerId);
        if (customer == null) {
            return null;
        }
        return customer.getReferrerCustomerId();
    }

    /**
     * 查找推荐人id
     *
     * @param customerIdList
     * @return
     */
    public Map<Long, Long> findReferrerCustomerId(List<Long> customerIdList) {
        List<Customer> customerList = listByIds(customerIdList);
        if (CollectionUtils.isEmpty(customerList)) {
            return Collections.emptyMap();
        }
        return customerList.stream().filter(s -> s.getReferrerCustomerId() != null).collect(Collectors.toMap(Customer::getId, Customer::getReferrerCustomerId));
    }

    public String findNameById(Long customerId) {
        Customer customer = getById(customerId);
        if (customer == null) {
            return null;
        }
        return findCustomerNickname(customer);
    }

    public PageInfo<Customer> pageInfo(Map<String, Object> params) {
        PageInfo<Customer> page = page(params);
        List<Customer> list = page.getList();
        if (!CollectionUtils.isEmpty(list)) {
            List<Long> referrerCustomerIds = list.stream().filter(e -> !ObjectUtils.isEmpty(e.getReferrerCustomerId())).map(Customer::getReferrerCustomerId).collect(Collectors.toList());
            if (!CollectionUtils.isEmpty(referrerCustomerIds)) {
                List<Customer> customers = listByIds(referrerCustomerIds);
                Map<Long, String> stringMap = findCustomerNicknameNew(customers);
                page.getList().forEach(e -> {
                    if (!ObjectUtils.isEmpty(e.getReferrerCustomerId())) {
                        String nickName = stringMap.get(e.getReferrerCustomerId());
                        e.setReferrerCustomerName(nickName);
                    }
                });
            }
        }
        buildCustomerDetail(list);
        return page;
    }

    /**
     * 获取客户的小程序邀请码图片地址
     *
     * @param id
     * @return
     */
    public String findInvitationQrImage(Long id) {
        Customer customer = getById(id);
        if (customer == null) {
            throw new BusinessException("客户不存在");
        }
        String invitationQrImage = customer.getInvitationQrImage();
        if (Strings.isNotBlank(invitationQrImage)) {
            return invitationQrImage;
        }
        String invitationCode = customer.getInvitationCode();
        if (Strings.isBlank(invitationCode)) {
            invitationCode = invitationCode();
            customer.setInvitationCode(invitationCode);
        }
        WxMaService wxService = WxMaConfiguration.getMaService();
        WxMaQrcodeService qrcodeService = wxService.getQrcodeService();
        try {
            File wxaCodeUnlimit = qrcodeService.createWxaCodeUnlimit(invitationCode, "pages/login/login");
            if (wxaCodeUnlimit != null) {
                File finalFile = ImageUtil.merge(wxaCodeUnlimit);
                if (finalFile != null) {
                    String customerQrImage = ossService.uploadImage(finalFile);
                    wxaCodeUnlimit.delete();
                    finalFile.delete();
                    customer.setInvitationQrImage(customerQrImage);
                    updateById(customer);
                }
            }
        } catch (WxErrorException e) {
            log.error("获取客户的小程序邀请码图片地址失败，id={},message={}", id, e.getMessage());
            e.printStackTrace();
        }
        return customer.getInvitationQrImage();
    }

    /**
     * 构建用户详情
     *
     * @param customerList
     */
    private void buildCustomerDetail(List<Customer> customerList) {
        if (CollectionUtils.isEmpty(customerList)) {
            return;
        }
        List<Long> idList = customerList.stream().map(Customer::getId).collect(Collectors.toList());
        Map<Long, Integer> couponCountMap = customerCouponService.getCouponCountMap(idList);
        Map<Long, String> customerVipLevelMap = customerCouponService.getCustomerVipLevelMap(idList);
        Map<Long, List<CustomerTag>> tagMap = customerTagService.mapByCustomerIdList(idList);
        Map<Long, Long> integrationMap = integrationService.getIntegrationByCustomerList(idList);
        customerList.forEach(s -> {
            if (!CollectionUtils.isEmpty(couponCountMap)) {
                s.setCouponCount(couponCountMap.getOrDefault(s.getId(), 0));
            }
            if (!CollectionUtils.isEmpty(customerVipLevelMap)) {
                s.setVipLevel(customerVipLevelMap.getOrDefault(s.getId(), null));
            }
            if (!CollectionUtils.isEmpty(integrationMap)) {
                s.setIntegration(integrationMap.getOrDefault(s.getId(), 0L));
            } else {
                s.setIntegration(0L);
            }
            s.setCustomerTagList(tagMap.get(s.getId()));
        });
        customerList.forEach(this::displayAvatar);
    }

    public String getCustomerVipLevel(Long customerId) {
        if (customerId == null) {
            return null;
        }
        Customer customer = getById(customerId);
        buildCustomerVipLevel(Collections.singletonList(customer));
        return customer.getVipLevel();
    }

    public void buildCustomerVipLevel(List<Customer> customerList) {
        if (CollectionUtils.isEmpty(customerList)) {
            return;
        }
        List<Long> idList = customerList.stream().map(Customer::getId).collect(Collectors.toList());
        Map<Long, String> customerVipLevelMap = customerCouponService.getCustomerVipLevelMap(idList);
        customerList.forEach(s -> {
            if (!CollectionUtils.isEmpty(customerVipLevelMap)) {
                s.setVipLevel(customerVipLevelMap.getOrDefault(s.getId(), null));
            }
        });
    }

    /**
     * 批量补「大会员」权益期，供看板/接诊处显示会员标识。
     *
     * <p>判定口径与结算比价一致：status 不是已退款、且当前时间落在 [startTime, endTime) 内。
     * 按时间判定而不是看 status 有没有被定时任务刷成「生效」，否则会出现看板说会员、
     * 结算却不给会员价。同一客户叠加多张卡时取结束时间最晚的那张——权益延续到最后一张到期为止。</p>
     */
    public void buildCustomerMemberCard(List<Customer> customerList) {
        if (CollectionUtils.isEmpty(customerList)) {
            return;
        }
        List<Long> idList = customerList.stream()
                .map(Customer::getId)
                .filter(Objects::nonNull)
                .distinct()
                .collect(Collectors.toList());
        if (CollectionUtils.isEmpty(idList)) {
            return;
        }

        LocalDateTime now = LocalDateTime.now();
        LambdaQueryWrapper<CustomerMemberCard> lqw = new LambdaQueryWrapper<>();
        lqw.in(CustomerMemberCard::getCustomerId, idList);
        lqw.ne(CustomerMemberCard::getStatus, CustomerMemberCard.STATUS_REFUNDED);
        lqw.le(CustomerMemberCard::getStartTime, now);
        lqw.gt(CustomerMemberCard::getEndTime, now);
        lqw.orderByDesc(CustomerMemberCard::getEndTime);
        List<CustomerMemberCard> cardList = customerMemberCardMapper.selectList(lqw);
        if (CollectionUtils.isEmpty(cardList)) {
            return;
        }

        //已按结束时间倒序，每个客户的第一张就是还在生效、到期最晚的那张
        Map<Long, CustomerMemberCard> cardMap = new HashMap<>();
        cardList.forEach(card -> cardMap.putIfAbsent(card.getCustomerId(), card));

        Map<String, Integer> remindDaysMap = brandCardRemindDaysMap();
        LocalDate today = now.toLocalDate();
        customerList.forEach(customer -> {
            CustomerMemberCard card = cardMap.get(customer.getId());
            if (card == null || card.getEndTime() == null) {
                return;
            }
            LocalDate endDate = card.getEndTime().toLocalDate();
            long daysLeft = ChronoUnit.DAYS.between(today, endDate);
            customer.setBrandCardType(card.getCardType());
            customer.setBrandCardEndDate(endDate);
            customer.setBrandCardDaysLeft((int) Math.max(daysLeft, 0));
            customer.setBrandCardRemindDays(remindDaysMap.getOrDefault(card.getCardType(), DEFAULT_BRAND_CARD_REMIND_DAYS));
        });
    }

    /**
     * 续费提醒窗口跟着会员卡配置走：年卡默认 30 天、月卡默认 7 天。
     * 月卡有效期只有 30 天，若统一按 30 天提醒，等于月卡客户天天挂一个「剩 N 天」。
     * 配置读不到时退回兜底值，不影响看板展示。
     */
    private Map<String, Integer> brandCardRemindDaysMap() {
        try {
            List<MemberCardConfig> configList = memberCardConfigMapper.selectList(null);
            if (CollectionUtils.isEmpty(configList)) {
                return Collections.emptyMap();
            }
            Map<String, Integer> remindDaysMap = new HashMap<>();
            configList.forEach(config -> {
                if (config.getCardType() != null && config.getRenewalRemindDays() != null) {
                    remindDaysMap.put(config.getCardType(), config.getRenewalRemindDays());
                }
            });
            return remindDaysMap;
        } catch (Exception e) {
            log.warn("读取会员卡续费提醒天数失败，按兜底天数展示", e);
            return Collections.emptyMap();
        }
    }

    /**
     * 构建用户详情
     *
     * @param customer
     */
    private void buildCustomerDetail(Customer customer) {
        buildCustomerDetail(Collections.singletonList(customer));
    }

    public List<Long> findIdListByPhoneOrName(String keyword) {
        LambdaQueryWrapper<Customer> queryWrapper = new LambdaQueryWrapper();
        queryWrapper.like(Customer::getPhone, keyword);
        queryWrapper.or().like(Customer::getComment, keyword);
        queryWrapper.or().like(Customer::getNickname, keyword);
        queryWrapper.select(Customer::getId);
        List<Customer> list = list(queryWrapper);
        if (CollectionUtils.isEmpty(list)) {
            return Arrays.asList(0L);
        }
        return list.stream().map(Customer::getId).collect(Collectors.toList());
    }

    /**
     * 活动进入添加客户标签
     *
     * @param activityCode
     * @param customerId
     */
    public void saveCustomerTagByActivityCode(String activityCode, Long customerId) {
        activityService.saveCustomerTagByCode(activityCode, customerId);
    }

    /**
     * 导出客户
     *
     * @param params
     * @throws IOException
     */
    public void exportCustomer(Map<String, Object> params) {
        params.put("all", true);
        List<Customer> customerList = listNoPage(params);
        Object exportTypeObj = params.getOrDefault("exportType", "");
        if ("vcf".equals(exportTypeObj)) {
            HttpServletResponse response = response();
            response.setContentType("application/octet-stream");
            response.setHeader("Content-disposition", "attachment; filename=导出客户信息.zip");

            try (BufferedOutputStream bos = new BufferedOutputStream(response.getOutputStream());
                 ZipOutputStream zipOut = new ZipOutputStream(bos, StandardCharsets.UTF_8)) {
                for (Customer customer : customerList) {
                    ZipEntry entry = new ZipEntry(getSafeFileName(customer) + ".vcf");
                    zipOut.putNextEntry(entry);
                    String vcfContent = generateVCard(customer);
                    byte[] vcfBytes = vcfContent.getBytes(StandardCharsets.UTF_8);
                    try (ByteArrayInputStream inputStream = new ByteArrayInputStream(vcfBytes)) {
                        IoUtil.copy(inputStream, zipOut);
                    }
                    zipOut.closeEntry();
                }
                zipOut.finish();
                bos.flush();
            } catch (Exception e) {
                e.printStackTrace();
            }
        } else {
            List<CustomerExportDto> dtoList = customerList.stream().map(customer -> {
                CustomerExportDto dto = new CustomerExportDto();
                dto.setNickname(findCustomerNickname(customer));
                dto.setPhone(customer.getPhone());
                dto.setNote(customer.getNote());
                dto.setUpdateTime(DateUtil.toStandString(customer.getUpdateTime()));
                dto.setCreateTime(DateUtil.toStandString(customer.getCreateTime()));
                return dto;
            }).collect(Collectors.toList());
            ExcelUtil.export(dtoList, CustomerExportDto.class, "导出客户信息.xlsx");
        }
    }

    /**
     * 生成vcf文件
     *
     * @param customer
     * @return
     */
    private String generateVCard(Customer customer) {
        StringBuilder vcard = new StringBuilder();
        vcard.append("BEGIN:VCARD\n");
        vcard.append("VERSION:3.0\n");
        String customerNickname = findCustomerNickname(customer);
        if (StringUtils.hasText(customerNickname)) {
            vcard.append("FN:").append(customerNickname).append("\n");
            ;
        }
        vcard.append("TEL;TYPE=CELL:").append(customer.getPhone()).append("\n");
        vcard.append("END:VCARD\n");

        return vcard.toString();
    }

    /**
     * 将姓名转换为安全的文件名（移除非法字符）
     *
     * @param customer
     * @return
     */
    private String getSafeFileName(Customer customer) {
        if (customer == null) {
            return "customer";
        }
        String customerNickname = findCustomerComment(customer);
        String fileName;
        if (StringUtils.hasText(customerNickname)) {
            fileName = customerNickname + "_" + customer.getPhone();
        } else {
            fileName = customer.getPhone();
        }
        return fileName.replaceAll("[\\\\/:*?\"<>|\\n\\r]", "_");
    }

    /**
     * 根据客户id获取手机号
     *
     * @param idList
     * @return
     */
    public Map<Long, Customer> getCustomerMapByIdList(List<Long> idList) {
        if (CollectionUtils.isEmpty(idList)) {
            return new HashMap<>();
        }
        List<Customer> customerList = listByIds(idList);
        return customerList.stream().collect(Collectors.toMap(Customer::getId, s -> s));
    }

    /**
     * 获取客户信息
     *
     * @param phone
     * @return
     */
    public String findCustomerComment(String phone) {
        Customer customer = getByPhone(phone);
        return findCustomerComment(customer);
    }

    /**
     * 获取客户称呼
     *
     * @param customers
     * @return
     */
    public Map<Long, String> findCustomerNickname(List<Customer> customers) {
        return customers.stream().collect(Collectors.toMap(Customer::getId, s -> {
            String customerNickname = findCustomerComment(s);
            if (customerNickname != null) {
                return customerNickname;
            }
            return s.getNickname();
        }));
    }
    public Map<Long, String> findCustomerNicknameNew(List<Customer> customers) {
        return customers.stream().collect(Collectors.toMap(Customer::getId, s -> {
            /*String customerNickname = findCustomerComment(s);
            if (customerNickname != null) {
                return customerNickname;
            }*/
            return s.getPhone();
        }));
    }


    /**
     * 获取客户称呼
     *
     * @param customer
     * @return
     */
    public String findCustomerNickname(Customer customer) {
        Map<Long, String> map = findCustomerNickname(Collections.singletonList(customer));
        return map.getOrDefault(customer.getId(), null);
    }

    /**
     * 获取客户称呼
     *
     * @param customer
     * @return
     */
    public String findCustomerComment(Customer customer) {
        if (customer == null) {
            return null;
        }
        String comment = customer.getComment();
        if (StringUtils.hasText(comment) && customer.getGender() != null) {
            comment += (customer.getGender() == 1 ? "先生" : "女士");
        } else {
            comment = null;
        }
        return comment;
    }

    //获取客户几年即将失效的积分
    public long getInvalidIntegration(Long id) {
        if (id == null) {
            return 0L;
        }
        return integrationService.getInvalidIntegration(id);
    }
}