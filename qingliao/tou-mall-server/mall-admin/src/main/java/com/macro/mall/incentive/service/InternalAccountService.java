package com.macro.mall.incentive.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.macro.mall.common.exception.BusinessException;
import com.macro.mall.incentive.dto.InternalAccountSaveRequest;
import com.macro.mall.incentive.dto.InternalAccountView;
import com.macro.mall.incentive.entity.StatInternalAccount;
import com.macro.mall.incentive.mapper.StatInternalAccountMapper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

/**
 * 统计排除的内部账号手机号维护。
 *
 * <p>统计 SQL 通过 s_stat_internal_account 排除内部测试/员工账号，
 * 这里只负责维护名单；名单变更即时生效，不需要重算历史数据落库。</p>
 */
@Service
public class InternalAccountService {

    private static final Pattern MOBILE = Pattern.compile("^1[3-9]\\d{9}$");

    @Autowired
    private StatInternalAccountMapper mapper;

    @Autowired
    private IncentiveAccessService accessService;

    @Transactional(readOnly = true)
    public List<InternalAccountView> list() {
        accessService.requireGlobal();
        return mapper.selectList(new LambdaQueryWrapper<StatInternalAccount>()
                        .orderByDesc(StatInternalAccount::getId))
                .stream().map(this::toView).collect(Collectors.toList());
    }

    @Transactional
    public InternalAccountView save(InternalAccountSaveRequest request) {
        accessService.requireGlobal();
        if (request == null) {
            throw new BusinessException("请求不能为空");
        }
        String phone = request.getPhone() == null ? "" : request.getPhone().trim();
        if (!MOBILE.matcher(phone).matches()) {
            throw new BusinessException("请输入 11 位手机号");
        }
        String remark = request.getRemark() == null ? null : request.getRemark().trim();
        if (remark != null && remark.length() > 255) {
            throw new BusinessException("备注不能超过 255 个字符");
        }
        StatInternalAccount entity;
        if (request.getId() == null) {
            entity = new StatInternalAccount();
        } else {
            entity = mapper.selectById(request.getId());
            if (entity == null) {
                throw new BusinessException("记录不存在或已被删除");
            }
        }
        StatInternalAccount samePhone = mapper.selectOne(new LambdaQueryWrapper<StatInternalAccount>()
                .eq(StatInternalAccount::getPhone, phone));
        if (samePhone != null && !samePhone.getId().equals(entity.getId())) {
            throw new BusinessException("该手机号已在排除名单中");
        }
        entity.setPhone(phone);
        entity.setEnabled(request.getEnabled() == null ? 1 : (request.getEnabled() == 0 ? 0 : 1));
        entity.setRemark(remark == null || remark.isEmpty() ? null : remark);
        if (entity.getId() == null) {
            mapper.insert(entity);
        } else {
            // BaseEntity 只在插入时填充 create_time，更新时保留原值。
            mapper.updateById(entity);
        }
        return toView(entity);
    }

    @Transactional
    public void delete(Long id) {
        accessService.requireGlobal();
        if (id == null) {
            throw new BusinessException("记录 id 不能为空");
        }
        mapper.deleteById(id);
    }

    private InternalAccountView toView(StatInternalAccount entity) {
        InternalAccountView view = new InternalAccountView();
        view.setId(entity.getId());
        view.setPhone(entity.getPhone());
        view.setEnabled(entity.getEnabled());
        view.setRemark(entity.getRemark());
        view.setCreateTime(entity.getCreateTime());
        return view;
    }
}