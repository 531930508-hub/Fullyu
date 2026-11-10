package com.macro.mall.incentive.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.macro.mall.bo.AdminUserDetails;
import com.macro.mall.common.exception.BusinessException;
import com.macro.mall.entity.Massagist;
import com.macro.mall.model.UmsAdmin;
import com.macro.mall.model.UmsRole;
import com.macro.mall.enums.MassagistIdentityCode;
import com.macro.mall.service.MassagistIdentityService;
import com.macro.mall.service.MassagistService;
import com.macro.mall.service.UmsAdminService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Lazy;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.util.CollectionUtils;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

/**
 * 激励域的数据范围控制。
 *
 * <p>未注册 URL 在现有安全配置中只要求登录，因此门店范围、全局角色和“仅本人”
 * 必须在这里显式校验。全局角色可看全部门店并维护参数；其他后台账号只能看
 * shopIdArr 授权的门店，疗愈师本人接口不接受客户端传入 massagistId。</p>
 */
@Service
public class IncentiveAccessService {

    @Value("${incentive.global-roles:超级管理员,总助,运营,财务,admin}")
    private String globalRoles;

    @Autowired
    private UmsAdminService adminService;

    @Autowired
    private MassagistService massagistService;

    @Autowired
    @Lazy
    private MassagistIdentityService massagistIdentityService;

    @Autowired
    @Lazy
    private TrainingTeamCertProperties teamCertProperties;

    public UmsAdmin currentAdmin() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null || !(authentication.getPrincipal() instanceof AdminUserDetails)) {
            throw new BusinessException("登录状态已失效，请重新登录");
        }
        UmsAdmin admin = ((AdminUserDetails) authentication.getPrincipal()).getUmsAdmin();
        if (admin == null || admin.getId() == null) {
            throw new BusinessException("登录状态已失效，请重新登录");
        }
        return admin;
    }

    public boolean isGlobal() {
        UmsAdmin admin = currentAdmin();
        List<UmsRole> roles = adminService.getRoleList(admin.getId());
        if (CollectionUtils.isEmpty(roles)) {
            return false;
        }
        Set<String> allowed = new LinkedHashSet<>(split(globalRoles));
        for (UmsRole role : roles) {
            if (role.getName() != null && allowed.contains(role.getName().trim())) {
                return true;
            }
        }
        return false;
    }

    public void requireGlobal() {
        if (!isGlobal()) {
            throw new BusinessException("仅运营/财务角色可维护激励参数、考核记录和导出");
        }
    }

    public boolean isSuperAdmin() {
        UmsAdmin admin = currentAdmin();
        List<UmsRole> roles = adminService.getRoleList(admin.getId());
        if (!CollectionUtils.isEmpty(roles)) {
            for (UmsRole role : roles) {
                if (role.getName() != null && "超级管理员".equals(role.getName().trim())) {
                    return true;
                }
            }
        }
        // 兼容内置管理员：1 号账号只有在未绑定疗愈师档案时才视为超管，
        // 避免测试库/历史库把“1 号疗愈师”当成超管而放开特批与撤销。
        return Long.valueOf(1L).equals(admin.getId()) && currentMassagistIdOrNull() == null;
    }

    public boolean isShopManager() {
        Long massagistId = currentMassagistIdOrNull();
        return massagistId != null && massagistIdentityService.hasCode(massagistId, MassagistIdentityCode.SHOP_MANAGER);
    }

    public Long currentMassagistIdOrNull() {
        UmsAdmin admin = currentAdmin();
        if (admin.getMassagistId() != null) {
            return admin.getMassagistId();
        }
        Massagist massagist = massagistService.getOne(new LambdaQueryWrapper<Massagist>()
                .eq(Massagist::getUmsAdminId, admin.getId())
                .last("LIMIT 1"), false);
        return massagist == null ? null : massagist.getId();
    }

    /**
     * 内训师提交考核前的统一校验：开关、档案关联、身份、在职、账号可用。
     */
    public Massagist requireTrainer() {
        if (!teamCertProperties.enabled()) {
            throw new BusinessException("内训考核功能尚未开放");
        }
        Long massagistId = currentMassagistIdOrNull();
        if (massagistId == null) {
            throw new BusinessException("当前账号未关联疗愈师档案，无法进行内训考核");
        }
        Massagist trainer = massagistService.getById(massagistId);
        if (trainer == null) {
            throw new BusinessException("疗愈师档案不存在");
        }
        if (!Integer.valueOf(1).equals(trainer.getIsTrainer())) {
            throw new BusinessException("当前账号不是内训师，无法进行内训考核");
        }
        if (!Integer.valueOf(1).equals(trainer.getStatus())) {
            throw new BusinessException("当前内训师已不在职");
        }
        UmsAdmin admin = currentAdmin();
        if (!Integer.valueOf(1).equals(admin.getStatus())) {
            throw new BusinessException("当前后台账号不可用");
        }
        return trainer;
    }

    /**
     * 管理端考核数据：全局角色看全部，店长看授权门店；仅有内训师身份的账号被明确挡回 H5。
     */
    public void requireManagement() {
        if (isGlobal() || isShopManager()) {
            return;
        }
        if (isTrainerOnly()) {
            throw new BusinessException("当前账号仅可进行内训考核");
        }
        throw new BusinessException("仅运营/财务/店长可查看考核数据");
    }

    public void requireSuperAdmin() {
        if (!isSuperAdmin()) {
            throw new BusinessException("仅超级管理员可执行该操作");
        }
    }

    public boolean isTrainerOnly() {
        if (!teamCertProperties.enabled() || isGlobal() || isShopManager()) {
            return false;
        }
        Long id = currentMassagistIdOrNull();
        if (id == null) {
            return false;
        }
        Massagist massagist = massagistService.getById(id);
        return massagist != null && Integer.valueOf(1).equals(massagist.getIsTrainer());
    }

    /**
     * null 表示全部门店；空列表表示无任何门店权限。
     */
    public List<Long> authorizedShopIds() {
        if (isGlobal()) {
            return null;
        }
        UmsAdmin admin = currentAdmin();
        Set<Long> ids = new LinkedHashSet<>();
        addShopId(ids, admin.getShopId());
        addShopIds(ids, admin.getShopIdArr());
        return new ArrayList<>(ids);
    }

    public Long resolveShopId(Long requested) {
        List<Long> ids = authorizedShopIds();
        if (requested != null) {
            if (ids != null && !ids.contains(requested)) {
                throw new BusinessException("无权查看该门店");
            }
            return requested;
        }
        if (ids == null) {
            return null;
        }
        if (ids.isEmpty()) {
            throw new BusinessException("当前账号尚未配置可查看门店");
        }
        return ids.get(0);
    }

    public void requireShopAccess(Long shopId) {
        List<Long> ids = authorizedShopIds();
        if (ids != null && (shopId == null || !ids.contains(shopId))) {
            throw new BusinessException("无权查看该门店");
        }
    }

    public Long currentMassagistId() {
        UmsAdmin admin = currentAdmin();
        if (admin.getMassagistId() != null) {
            return admin.getMassagistId();
        }
        Massagist massagist = massagistService.getOne(new LambdaQueryWrapper<Massagist>()
                .eq(Massagist::getUmsAdminId, admin.getId())
                .last("LIMIT 1"), false);
        if (massagist == null) {
            throw new BusinessException("当前账号未关联疗愈师档案，无法查看个人接单奖励");
        }
        return massagist.getId();
    }

    public String currentOperatorName() {
        UmsAdmin admin = currentAdmin();
        if (admin.getNickName() != null && !admin.getNickName().trim().isEmpty()) {
            return admin.getNickName();
        }
        return admin.getUsername();
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
            target.add(Long.valueOf(raw.trim()));
        } catch (NumberFormatException ignored) {
            // 兼容历史脏数据；无法解析的门店直接忽略。
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
