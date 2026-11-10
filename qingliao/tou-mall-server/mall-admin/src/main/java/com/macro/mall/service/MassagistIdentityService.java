package com.macro.mall.service;

import cn.hutool.core.util.ObjUtil;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.macro.mall.common.exception.BusinessException;
import com.macro.mall.entity.Massagist;
import com.macro.mall.entity.MassagistIdentity;
import com.macro.mall.enums.JobStatus;
import com.macro.mall.enums.MassagistIdentityCode;
import com.macro.mall.enums.approval.ApprovalTargetScope;
import com.macro.mall.mapper.MassagistIdentityMapper;
import com.macro.mall.model.UmsAdmin;
import com.macro.mall.service.base.BaseService;
import com.macro.mall.service.impl.UmsAdminServiceImpl;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.CollectionUtils;

import java.util.ArrayList;
import java.util.Collection;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * 疗愈师身份（店长/内训师等，可多选）。
 *
 * <p>审批流按“岗位”选人时，依赖该表把身份解析为本店/全部门店的后台账号。
 * is_trainer 列保留并与 TRAINER 身份同步，兼容内训考核等既有逻辑。</p>
 *
 * @author Full愈
 * @date 2026/11/09
 */
@Service
public class MassagistIdentityService extends BaseService<MassagistIdentityMapper, MassagistIdentity> {

    @Autowired
    @Lazy
    MassagistService massagistService;

    @Autowired
    @Lazy
    UmsAdminServiceImpl umsAdminService;

    public List<MassagistIdentity> listByMassagistId(Long massagistId) {
        if (ObjUtil.isEmpty(massagistId)) return Collections.emptyList();
        return list(new LambdaQueryWrapper<MassagistIdentity>()
                .eq(MassagistIdentity::getMassagistId, massagistId)
                .orderByAsc(MassagistIdentity::getId));
    }

    public List<String> codesOf(Long massagistId) {
        return listByMassagistId(massagistId).stream().map(MassagistIdentity::getCode).collect(Collectors.toList());
    }

    public Map<Long, List<String>> codesByMassagistIds(Collection<Long> massagistIds) {
        if (CollectionUtils.isEmpty(massagistIds)) return Collections.emptyMap();
        Map<Long, List<String>> result = new HashMap<>();
        for (MassagistIdentity identity : list(new LambdaQueryWrapper<MassagistIdentity>()
                .in(MassagistIdentity::getMassagistId, massagistIds)
                .orderByAsc(MassagistIdentity::getId))) {
            result.computeIfAbsent(identity.getMassagistId(), k -> new ArrayList<>()).add(identity.getCode());
        }
        return result;
    }

    public boolean hasCode(Long massagistId, MassagistIdentityCode code) {
        if (ObjUtil.isEmpty(massagistId) || code == null) return false;
        return count(new LambdaQueryWrapper<MassagistIdentity>()
                .eq(MassagistIdentity::getMassagistId, massagistId)
                .eq(MassagistIdentity::getCode, code.getCode())) > 0;
    }

    public Set<Long> massagistIdsWithCode(Collection<Long> scope, MassagistIdentityCode code) {
        Set<Long> result = new HashSet<>();
        if (code == null) return result;
        LambdaQueryWrapper<MassagistIdentity> lqw = new LambdaQueryWrapper<MassagistIdentity>()
                .eq(MassagistIdentity::getCode, code.getCode());
        if (scope != null && !scope.isEmpty()) {
            lqw.in(MassagistIdentity::getMassagistId, scope);
        }
        for (MassagistIdentity identity : list(lqw)) result.add(identity.getMassagistId());
        return result;
    }

    /**
     * 全量替换身份。codes 为 null 表示不做调整；未知身份直接拒绝，避免脏配置进入审批流。
     */
    @Transactional(rollbackFor = Exception.class)
    public void replace(Long massagistId, Collection<String> codes, Long operatorId) {
        if (ObjUtil.isEmpty(massagistId)) throw new BusinessException("疗愈师不存在");
        if (codes == null) return;
        LinkedHashSet<String> normalized = normalize(codes);
        Set<String> existing = new HashSet<>(codesOf(massagistId));
        for (MassagistIdentity identity : listByMassagistId(massagistId)) {
            if (!normalized.contains(identity.getCode()) && !removeById(identity.getId()))
                throw new BusinessException("身份保存失败，请重试");
        }
        for (String code : normalized) {
            if (existing.contains(code)) continue;
            MassagistIdentity identity = new MassagistIdentity();
            identity.setMassagistId(massagistId);
            identity.setCode(code);
            identity.setCreateUser(operatorId);
            if (!save(identity)) throw new BusinessException("身份保存失败，请重试");
        }
    }

    @Transactional(rollbackFor = Exception.class)
    public void grant(Long massagistId, MassagistIdentityCode code, Long operatorId) {
        if (hasCode(massagistId, code)) return;
        MassagistIdentity identity = new MassagistIdentity();
        identity.setMassagistId(massagistId);
        identity.setCode(code.getCode());
        identity.setCreateUser(operatorId);
        if (!save(identity)) throw new BusinessException("身份保存失败，请重试");
    }

    @Transactional(rollbackFor = Exception.class)
    public void revoke(Long massagistId, MassagistIdentityCode code) {
        remove(new LambdaQueryWrapper<MassagistIdentity>()
                .eq(MassagistIdentity::getMassagistId, massagistId)
                .eq(MassagistIdentity::getCode, code.getCode()));
    }

    /**
     * 离职交接：把某个身份从旧疗愈师转给接班人（先授予再撤销，避免中间态无人可用）。
     */
    @Transactional(rollbackFor = Exception.class)
    public void transfer(Long fromMassagistId, Long toMassagistId, MassagistIdentityCode code, Long operatorId) {
        if (!hasCode(fromMassagistId, code)) return;
        grant(toMassagistId, code, operatorId);
        revoke(fromMassagistId, code);
    }

    /**
     * 把岗位解析为可接收审批的后台账号：在职疗愈师 + 已关联且启用的后台账号；排除发起人自己。
     */
    public List<Long> resolveAdminIds(MassagistIdentityCode code, ApprovalTargetScope scope, Long shopId, Long excludeAdminId) {
        if (code == null) return Collections.emptyList();
        ApprovalTargetScope effectiveScope = scope == null ? ApprovalTargetScope.SHOP : scope;
        if (effectiveScope == ApprovalTargetScope.SHOP && ObjUtil.isEmpty(shopId)) return Collections.emptyList();
        Set<Long> massagistIds = massagistIdsWithCode(null, code);
        if (massagistIds.isEmpty()) return Collections.emptyList();
        LambdaQueryWrapper<Massagist> mqw = new LambdaQueryWrapper<Massagist>()
                .in(Massagist::getId, massagistIds)
                .eq(Massagist::getStatus, JobStatus.JOB_ING.getValue());
        if (effectiveScope == ApprovalTargetScope.SHOP) mqw.eq(Massagist::getShopId, shopId);
        List<Long> adminIds = massagistService.list(mqw).stream()
                .map(Massagist::getUmsAdminId)
                .filter(id -> !ObjUtil.isEmpty(id))
                .distinct()
                .collect(Collectors.toList());
        if (adminIds.isEmpty()) return Collections.emptyList();
        Set<Long> active = umsAdminService.listByIds(adminIds).stream()
                .filter(admin -> admin != null && Integer.valueOf(1).equals(admin.getStatus()))
                .map(UmsAdmin::getId)
                .collect(Collectors.toSet());
        return adminIds.stream()
                .filter(active::contains)
                .filter(id -> !id.equals(excludeAdminId))
                .collect(Collectors.toList());
    }

    public String labelOf(String code) {
        MassagistIdentityCode identity = MassagistIdentityCode.of(code);
        return identity == null ? code : identity.getLabel();
    }

    /**
     * 校验并规范化身份编码：去重、转大写、拒绝未知身份。
     */
    public static LinkedHashSet<String> normalize(Collection<String> codes) {
        LinkedHashSet<String> result = new LinkedHashSet<>();
        if (codes == null) return result;
        for (String raw : codes) {
            if (raw == null || raw.trim().isEmpty()) continue;
            MassagistIdentityCode code = MassagistIdentityCode.of(raw);
            if (code == null) throw new BusinessException("不支持的身份：" + raw);
            result.add(code.getCode());
        }
        return result;
    }
}
