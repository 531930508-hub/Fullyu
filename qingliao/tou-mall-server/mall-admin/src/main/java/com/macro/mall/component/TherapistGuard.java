package com.macro.mall.component;

import com.macro.mall.bo.AdminUserDetails;
import com.macro.mall.model.UmsAdmin;
import com.macro.mall.model.UmsRole;
import com.macro.mall.service.UmsAdminService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Lazy;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.util.CollectionUtils;

import java.util.List;

/**
 * 疗愈师身份判定：以服务端角色为准，前端传来的身份一律不采信。
 */
@Component
public class TherapistGuard {

    @Autowired
    @Lazy
    private UmsAdminService adminService;

    @Value("${incentive.therapist-role:疗愈师}")
    private String therapistRole;

    /**
     * 当前登录账号是否带疗愈师角色（以服务端角色为准，不信任前端传参）。
     */
    public boolean isTherapist() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null || !(authentication.getPrincipal() instanceof AdminUserDetails)) {
            return false;
        }
        UmsAdmin admin = ((AdminUserDetails) authentication.getPrincipal()).getUmsAdmin();
        if (admin == null || admin.getId() == null) {
            return false;
        }
        List<UmsRole> roles = adminService.getRoleList(admin.getId());
        if (CollectionUtils.isEmpty(roles)) {
            return false;
        }
        for (UmsRole role : roles) {
            if (role.getName() != null && therapistRole.equals(role.getName().trim())) {
                return true;
            }
        }
        return false;
    }
}
