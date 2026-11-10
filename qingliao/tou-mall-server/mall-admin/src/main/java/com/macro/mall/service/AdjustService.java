package com.macro.mall.service;

import cn.hutool.core.util.ObjUtil;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.macro.mall.entity.Adjust;
import com.macro.mall.entity.Massagist;
import com.macro.mall.entity.OrderDetail;
import com.macro.mall.enums.AdjustStatus;
import com.macro.mall.enums.AppointmentState;
import com.macro.mall.mapper.AdjustMapper;
import com.macro.mall.service.base.BaseService;
import org.springframework.stereotype.Service;
import org.springframework.util.CollectionUtils;

import java.util.List;

/**
 * 调整疗愈师服务时长表 服务类
 *
 * @author zkl
 * @date 2025/06/13
 */
@Service
public class AdjustService extends BaseService<AdjustMapper, Adjust> {

    public List<Adjust> timeList(Long shopId, String startTime, String endTime, List<Long> massagistIdList) {
        LambdaQueryWrapper<Adjust> lqw = new LambdaQueryWrapper<>();
        lqw.eq(Adjust::getStatus, AdjustStatus.DOING.getValue());
        if (!ObjUtil.isEmpty(shopId)) {
            lqw.eq(Adjust::getShopId, shopId);
        }
        if (!CollectionUtils.isEmpty(massagistIdList)) {
            lqw.in(Adjust::getMassagistId, massagistIdList);
        }
        lqw.between(Adjust::getAdjustDate, startTime, endTime);
        return list(lqw);
    }
}