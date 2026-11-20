package com.macro.mall.service.base;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.macro.mall.bo.AdminUserDetails;
import com.macro.mall.common.exception.BusinessException;
import com.macro.mall.entity.Massagist;
import com.macro.mall.model.UmsAdmin;
import com.macro.mall.model.UmsRole;
import com.macro.mall.service.MassagistSchedulesService;
import com.macro.mall.service.MassagistService;
import com.macro.mall.service.UmsAdminService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Lazy;
import org.springframework.core.env.Environment;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.util.CollectionUtils;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

/**
 * 门店数据权限的统一入口。
 *
 * <p>规则来源：docs/designs/2026-11-11-门店数据权限统一标准-需求设计.md</p>
 * <ul>
 *     <li>全局角色：{@code shop.scope.global-roles}（缺省沿用 {@code incentive.global-roles}）</li>
 *     <li>受限账号：{@code ums_admin.shop_id} + {@code ums_admin.shop_id_arr}</li>
 *     <li>非后台账号（小程序/匿名）：不参与门店作用域</li>
 * </ul>
 *
 * @author shop-scope
 */
@Service
public class ShopScopeService {

    private static final Logger LOGGER = LoggerFactory.getLogger(ShopScopeService.class);

    private static final String DEFAULT_GLOBAL_ROLES = "超级管理员,总助,运营,财务,admin";

    @Autowired
    private Environment environment;

    @Autowired
    @Lazy
    private UmsAdminService adminService;

    @Autowired
    @Lazy
    private MassagistService massagistService;

    @Autowired
    @Lazy
    private MassagistSchedulesService massagistSchedulesService;

    /** 是否拦截越界请求（改为 false 可整体回退到旧的“仅记录日志”行为） */
    public boolean isEnforce() {
        return Boolean.parseBoolean(environment.getProperty("shop.scope.enforce", "true"));
    }

    public boolean isLogOnly() {
        return Boolean.parseBoolean(environment.getProperty("shop.scope.log-only", "true"));
    }

    /**
     * 解析当前请求的门店作用域。
     *
     * @param shopId  请求的单店参数
     * @param shopIds 请求的多店参数
     * @return 非后台账号返回 null，表示不参与门店作用域
     */
    public ShopScope resolve(Long shopId, List<Long> shopIds) {
        UmsAdmin admin = currentAdminOrNull();
        if (admin == null) {
            return null;
        }
        List<Long> requested = new ArrayList<>();
        if (shopId != null && shopId > 0) {
            requested.add(shopId);
        }
        if (shopIds != null) {
            for (Long id : shopIds) {
                if (id != null && id > 0 && !requested.contains(id)) {
                    requested.add(id);
                }
            }
        }
        if (isGlobal(admin)) {
            return new ShopScope(true, null, requested);
        }
        return new ShopScope(false, authorizedShopIds(admin), requested);
    }

    /**
     * 按排班日期给疗愈师临时补一档门店授权。
     *
     * <p>背景：疗愈师的可看门店只来自账号配置，调店记录在排班表里，两套东西不打通，
     * 于是“我 11-14 被调到 B 店”这一天她反而看不到 B 店看板。这里做最小放开：
     * 只有当次的 {@code date} 在该疗愈师排班表里确有记录（原店或调店目标店）时，
     * 才把对应门店并入本次请求的授权范围；不写回账号，也不跨日期生效。</p>
     *
     * <p>调用方需保证只对读请求生效（GET），写操作仍走账号授权。</p>
     *
     * @param scope 已解析的门店作用域
     * @param day   请求里的业务日期；为空时不做任何扩展
     */
    public ShopScope extendForScheduleDate(ShopScope scope, LocalDate day) {
        if (scope == null || scope.isGlobal() || day == null) {
            return scope;
        }
        // 只有“请求了不在授权里的门店”才需要查排班，绝大多数请求在这里直接返回
        List<Long> requested = scope.getRequestedShopIds();
        if (requested == null || requested.isEmpty()) {
            return scope;
        }
        boolean missing = false;
        for (Long shopId : requested) {
            if (!scope.contains(shopId)) {
                missing = true;
                break;
            }
        }
        if (!missing) {
            return scope;
        }
        Long massagistId = currentMassagistIdOrNull();
        if (massagistId == null) {
            return scope;
        }
        List<Long> extraShopIds = massagistSchedulesService.shopIdsByMassagistAndDay(massagistId, day);
        if (CollectionUtils.isEmpty(extraShopIds)) {
            return scope;
        }
        return scope.withExtraShopIds(extraShopIds);
    }

    /** 当前账号绑定的疗愈师档案 id；后台运营账号没有档案时返回 null */
    public Long currentMassagistIdOrNull() {
        UmsAdmin admin = currentAdminOrNull();
        if (admin == null) {
            return null;
        }
        if (admin.getMassagistId() != null) {
            return admin.getMassagistId();
        }
        Massagist massagist = massagistService.getOne(new LambdaQueryWrapper<Massagist>()
                .eq(Massagist::getUmsAdminId, admin.getId())
                .last("LIMIT 1"), false);
        return massagist == null ? null : massagist.getId();
    }

    /** 当前后台账号；非后台上下文返回 null */
    public UmsAdmin currentAdminOrNull() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null || !(authentication.getPrincipal() instanceof AdminUserDetails)) {
            return null;
        }
        UmsAdmin admin = ((AdminUserDetails) authentication.getPrincipal()).getUmsAdmin();
        if (admin == null || admin.getId() == null) {
            return null;
        }
        return admin;
    }

    public boolean isGlobal() {
        return isGlobal(currentAdmin());
    }

    public boolean isGlobal(UmsAdmin admin) {
        if (admin == null) {
            return false;
        }
        List<UmsRole> roles = adminService.getRoleList(admin.getId());
        if (CollectionUtils.isEmpty(roles)) {
            return false;
        }
        Set<String> allowed = new LinkedHashSet<>(split(globalRolesConfig()));
        for (UmsRole role : roles) {
            if (role.getName() != null && allowed.contains(role.getName().trim())) {
                return true;
            }
        }
        return false;
    }

    /** 当前账号可查看的门店；全局角色返回 null 表示全部 */
    public List<Long> authorizedShopIds() {
        UmsAdmin admin = currentAdminOrNull();
        if (admin == null) {
            return new ArrayList<>();
        }
        if (isGlobal(admin)) {
            return null;
        }
        return authorizedShopIds(admin);
    }

    /** 受限账号的授权门店：主门店 + shop_id_arr，去重且忽略非法值 */
    public List<Long> authorizedShopIds(UmsAdmin admin) {
        Set<Long> ids = new LinkedHashSet<>();
        if (admin == null) {
            return new ArrayList<>(ids);
        }
        addShopId(ids, admin.getShopId());
        addShopIds(ids, admin.getShopIdArr());
        return new ArrayList<>(ids);
    }

    /** 当前后台账号，未登录抛异常 */
    public UmsAdmin currentAdmin() {
        UmsAdmin admin = currentAdminOrNull();
        if (admin == null) {
            throw new BusinessException("登录状态已失效，请重新登录");
        }
        return admin;
    }

    /** 要求当前账号可访问指定门店 */
    public void requireShopAccess(Long shopId) {
        ShopScope scope = ShopScopeHolder.current();
        if (scope == null) {
            scope = resolve(shopId, null);
        }
        if (scope != null) {
            scope.assertAccess(shopId);
        }
    }

    /**
     * 收敛客户端整包传入的门店数组（如统计页的 {@code shopIdArrNew}）。
     *
     * <p>全局角色原样返回；受限账号返回“请求 ∩ 授权”，请求为空时返回全部授权门店。</p>
     */
    public int[] restrictShopIdArray(int[] requested) {
        if (currentAdminOrNull() == null) {
            // 非后台上下文（定时任务/小程序）不参与门店作用域
            return requested;
        }
        List<Long> authorized = authorizedShopIds();
        if (authorized == null) {
            // 全局角色
            return requested;
        }
        if (authorized.isEmpty()) {
            throw new BusinessException("当前账号尚未配置可查看门店");
        }
        if (requested == null || requested.length == 0) {
            return authorized.stream().mapToInt(Long::intValue).toArray();
        }
        List<Long> result = new ArrayList<>();
        for (int value : requested) {
            if (authorized.contains((long) value) && !result.contains((long) value)) {
                result.add((long) value);
            }
        }
        if (result.isEmpty()) {
            throw new BusinessException("无权查看该门店");
        }
        return result.stream().mapToInt(Long::intValue).toArray();
    }

    private String globalRolesConfig() {
        String value = environment.getProperty("shop.scope.global-roles");
        if (value == null || value.trim().isEmpty()) {
            value = environment.getProperty("incentive.global-roles");
        }
        if (value == null || value.trim().isEmpty()) {
            value = DEFAULT_GLOBAL_ROLES;
        }
        return value;
    }

    private void addShopIds(Set<Long> target, String raw) {
        if (raw == null) {
            return;
        }
        String cleaned = raw.replace("[", "").replace("]", "").replace(" ", "");
        for (String part : cleaned.split(",")) {
            addShopId(target, part);
        }
    }

    private void addShopId(Set<Long> target, Long shopId) {
        if (shopId != null && shopId > 0) {
            target.add(shopId);
        }
    }

    private void addShopId(Set<Long> target, String raw) {
        if (raw == null || raw.trim().isEmpty()) {
            return;
        }
        try {
            addShopId(target, Long.valueOf(raw.trim()));
        } catch (NumberFormatException e) {
            LOGGER.debug("[SHOP_SCOPE] 忽略非法门店配置: {}", raw);
        }
    }

    private List<String> split(String config) {
        List<String> result = new ArrayList<>();
        if (config == null) {
            return result;
        }
        Arrays.stream(config.split("[,，]"))
                .map(String::trim)
                .filter(s -> !s.isEmpty())
                .forEach(result::add);
        return result;
    }
}