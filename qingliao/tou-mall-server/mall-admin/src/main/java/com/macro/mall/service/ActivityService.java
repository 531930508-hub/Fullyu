package com.macro.mall.service;

import cn.binarywang.wx.miniapp.api.WxMaQrcodeService;
import cn.binarywang.wx.miniapp.api.WxMaService;
import cn.hutool.core.util.ObjUtil;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.github.pagehelper.PageInfo;
import com.macro.mall.common.exception.BusinessException;
import com.macro.mall.config.wx.WxMaConfiguration;
import com.macro.mall.entity.Activity;
import com.macro.mall.entity.ActivityTag;
import com.macro.mall.enums.ActivityStatus;
import com.macro.mall.mapper.ActivityMapper;
import com.macro.mall.service.base.BaseService;
import com.macro.mall.service.base.WrapperBuilder;
import com.macro.mall.service.impl.OssServiceImpl;
import lombok.extern.slf4j.Slf4j;
import me.chanjar.weixin.common.error.WxErrorException;
import org.apache.logging.log4j.util.Strings;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Service;
import org.springframework.util.CollectionUtils;

import java.io.File;
import java.time.LocalDate;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * 活动表 服务类
 *
 * @author zkl
 * @date 2025/07/10
 */
@Service
@Slf4j
public class ActivityService extends BaseService<ActivityMapper, Activity> {
    @Autowired
    OssServiceImpl ossService;
    @Autowired
    @Lazy
    ActivityTagService activityTagService;
    @Autowired
    @Lazy
    BasicCustomerTagService basicCustomerTagService;

    @Override
    protected QueryWrapper<Activity> buildWrapper(Map<String, Object> params, QueryWrapper<Activity> queryWrapper) {
        return WrapperBuilder.init(queryWrapper, params)
                .equal("status")
                .equal("shop_id")
                .like("title")
                .like("code")
                .getQueryWrapper();
    }

    public PageInfo<Activity> pageWithDetail(Map<String, Object> params) {
        PageInfo<Activity> page = page(params);
        buildDetail(page.getList());
        return page;
    }

    public List<Activity> doingList() {
        LambdaQueryWrapper<Activity> lqw = new LambdaQueryWrapper<>();
        lqw.eq(Activity::getStatus, ActivityStatus.DOING.getValue());
        LocalDate now = LocalDate.now();
        lqw.le(Activity::getStartDate, now);
        lqw.ge(Activity::getEndDate, now);
        List<Activity> list = list(lqw);
        buildDetail(list);
        return list;
    }

    public void buildDetail(List<Activity> list) {
        List<Long> idList = list.stream().map(Activity::getId).collect(Collectors.toList());
        Map<Long, List<ActivityTag>> tagMap = activityTagService.mapByActivityIdList(idList);
        list.forEach(s -> s.setActivityTagList(tagMap.getOrDefault(s.getId(), Collections.emptyList())));
    }

    /**
     * 生成小程序活动二维码
     *
     * @param id
     * @param pagePath
     * @return
     */
    public String buildMiniProgramQrCode(Long id, String pagePath) {
        Activity activity = getById(id);
        if (activity == null) {
            throw new BusinessException("活动不存在");
        }
        if (Strings.isBlank(pagePath)) {
            throw new BusinessException("小程序页面地址不可为空");
        }
        if (pagePath.startsWith("/")) {
            throw new BusinessException("小程序页面地址不能以/开头");
        }
        WxMaService wxService = WxMaConfiguration.getMaService();
        WxMaQrcodeService qrcodeService = wxService.getQrcodeService();
        try {
            File wxaCodeUnlimit = qrcodeService.createWxaCodeUnlimit(activity.getCode(), pagePath);
            if (wxaCodeUnlimit != null) {
                String qrCodeKey = ossService.uploadImage(wxaCodeUnlimit);
                wxaCodeUnlimit.delete();
                activity.setMiniProgramPagePath(pagePath);
                activity.setMiniProgramQrCodeUrl(qrCodeKey);
                updateById(activity);
                return ossService.getFinalUrl(qrCodeKey);
            }
        } catch (WxErrorException e) {
            log.error("生成小程序活动码失败,id={}pagePath={}", id, pagePath);
            e.printStackTrace();
        }
        return null;
    }

    /**
     * 检验活动code是否在有效期
     *
     * @param code
     * @return
     */
    public boolean codeCheckDoing(String code) {
        LambdaQueryWrapper<Activity> lqw = new LambdaQueryWrapper<>();
        lqw.eq(Activity::getCode, code);
        lqw.eq(Activity::getStatus, ActivityStatus.DOING.getValue());
        LocalDate now = LocalDate.now();
        lqw.le(Activity::getStartDate, now);
        lqw.ge(Activity::getEndDate, now);
        Activity onlyOne = getOnlyOne(lqw);
        return !ObjUtil.isEmpty(onlyOne);
    }


    public List<Activity> listByCodes(List<String> activityCodes) {
        LambdaQueryWrapper<Activity> lqw = new LambdaQueryWrapper<>();
        lqw.in(Activity::getCode, activityCodes);
        lqw.eq(Activity::getStatus, ActivityStatus.DOING.getValue());
        LocalDate now = LocalDate.now();
        lqw.le(Activity::getStartDate, now);
        lqw.ge(Activity::getEndDate, now);
        return list(lqw);
    }

    public Long getIdByCode(String code) {
        LambdaQueryWrapper<Activity> lqw = new LambdaQueryWrapper<>();
        lqw.eq(Activity::getCode, code);
        lqw.eq(Activity::getStatus, ActivityStatus.DOING.getValue());
        LocalDate now = LocalDate.now();
        lqw.le(Activity::getStartDate, now);
        lqw.ge(Activity::getEndDate, now);
        Activity activity = getOnlyOne(lqw);
        if (activity == null) {
            return null;
        }
        return activity.getId();
    }

    /**
     * 根据活动添加客户标签
     *
     * @param code
     */
    public List<Long> getCustomerTagByCode(String code) {
        if (code == null) {
            return Collections.emptyList();
        }
        Long activityId = getIdByCode(code);
        if (activityId == null) {
            return Collections.emptyList();
        }
        return activityTagService.findTagIdListByActivityId(activityId);
    }

    /**
     * 根据活动添加客户标签
     *
     * @param code
     * @param customerId
     */
    public void saveCustomerTagByCode(String code, Long customerId) {
        if (code == null) {
            return;
        }
        Long activityId = getIdByCode(code);
        if (activityId == null) {
            return;
        }
        List<Long> tagIdList = activityTagService.findTagIdListByActivityId(activityId);
        if (CollectionUtils.isEmpty(tagIdList)) {
            return;
        }
        basicCustomerTagService.saveCustomerTagByIdList(customerId, tagIdList);
    }

    public void saveOrUpd(Activity activity) {
        String code = activity.getCode();
        LambdaQueryWrapper<Activity> lqw = new LambdaQueryWrapper<>();
        lqw.eq(Activity::getCode, code);
        if (activity.getId() != null) {
            lqw.ne(Activity::getId, activity.getId());
        }
        Activity one = getOnlyOne(lqw);
        if (one != null) {
            String msg;
            if (activity.getId() != null) {
                msg = "code已存在，编辑时不允许和原有活动code冲突";
            } else {
                msg = "code已存在，添加时不允许和原有活动code冲突";
            }
            throw new BusinessException(msg);
        }
        saveOrUpdate(activity);
    }

    public void enable(Long id) {
        Activity activity = getById(id);
        if (ActivityStatus.DOING.getValue().equals(activity.getStatus())) {
            throw new BusinessException("活动已处于启用状态");
        }
        activity.setStatus(ActivityStatus.DOING.getValue());
        updateById(activity);
    }

    public void disable(Long id) {
        Activity activity = getById(id);
        if (ActivityStatus.WAITING.getValue().equals(activity.getStatus())) {
            throw new BusinessException("活动已处于禁用状态");
        }
        activity.setStatus(ActivityStatus.WAITING.getValue());
        updateById(activity);
    }
}
