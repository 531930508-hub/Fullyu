package com.macro.mall.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.macro.mall.common.exception.BusinessException;
import com.macro.mall.entity.ActivityTag;
import com.macro.mall.mapper.ActivityTagMapper;
import com.macro.mall.service.base.BaseService;
import com.macro.mall.service.base.WrapperBuilder;
import com.macro.mall.service.impl.UmsAdminServiceImpl;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Service;
import org.springframework.util.CollectionUtils;

import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * 活动标签 服务类
 *
 * @author
 * @date 2025/07/14
 */
@Service
public class ActivityTagService extends BaseService<ActivityTagMapper, ActivityTag> {
    @Autowired
    @Lazy
    UmsAdminServiceImpl umsAdminService;

    public List<ActivityTag> findByBasicCustomerTagIds(List<Long> ids) {
        if (CollectionUtils.isEmpty(ids)) {
            return Collections.emptyList();
        }
        LambdaQueryWrapper<ActivityTag> lqw = new LambdaQueryWrapper<>();
        lqw.in(ActivityTag::getBasicCustomerTagId, ids);
        return list(lqw);
    }

    public Map<Long, List<ActivityTag>> mapByActivityIdList(List<Long> activityIdList) {
        if (CollectionUtils.isEmpty(activityIdList)) {
            return Collections.emptyMap();
        }
        LambdaQueryWrapper<ActivityTag> queryWrapper = new LambdaQueryWrapper();
        queryWrapper.in(ActivityTag::getActivityId, activityIdList);
        return list(queryWrapper).stream().collect(Collectors.groupingBy(ActivityTag::getActivityId));
    }

    public void checkAndSave(ActivityTag activityTag) {
        LambdaQueryWrapper<ActivityTag> queryWrapper = new LambdaQueryWrapper();
        queryWrapper.eq(ActivityTag::getBasicCustomerTagId, activityTag.getBasicCustomerTagId());
        queryWrapper.eq(ActivityTag::getActivityId, activityTag.getActivityId());
        if (count(queryWrapper) > 0) {
            throw new BusinessException("标签已存在");
        }
        activityTag.setCreateUser(umsAdminService.currentId());
        save(activityTag);
    }

    /**
     * 根据活动获取活动标签
     *
     * @param activityId
     * @return
     */
    public List<Long> findTagIdListByActivityId(Long activityId) {
        Map<Long, List<ActivityTag>> map = mapByActivityIdList(Collections.singletonList(activityId));
        List<ActivityTag> list = map.getOrDefault(activityId, Collections.emptyList());
        if (CollectionUtils.isEmpty(list)) {
            return Collections.emptyList();
        }
        return list.stream().map(ActivityTag::getBasicCustomerTagId).collect(Collectors.toList());
    }

    @Override
    protected QueryWrapper<ActivityTag> buildWrapper(Map<String, Object> params, QueryWrapper<ActivityTag> queryWrapper) {
        return WrapperBuilder.init(queryWrapper, params)
                .equal("activity_id")
                .getQueryWrapper();
    }
}