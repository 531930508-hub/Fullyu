package com.macro.mall.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.macro.mall.entity.GiveGift;
import com.macro.mall.entity.GiveGiftHistory;
import com.macro.mall.mapper.GiveGiftHistoryMapper;
import com.macro.mall.service.base.BaseService;
import org.springframework.stereotype.Service;
import org.springframework.util.CollectionUtils;

import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * 礼物领取记录 服务类
 *
 * @author ST
 * @date 2025/06/03
 */
@Service
public class GiveGiftHistoryService extends BaseService<GiveGiftHistoryMapper, GiveGiftHistory> {

    /**
     * 添加领取记录
     *
     * @param giveGift
     * @param toCustomerId
     */
    public void createGiveGiftHistory(GiveGift giveGift, Long toCustomerId) {
        GiveGiftHistory giveGiftHistory = new GiveGiftHistory();
        giveGiftHistory.setGiveGiftId(giveGift.getId());
        giveGiftHistory.setFromCustomerId(giveGift.getCustomerId());
        giveGiftHistory.setToCustomerId(toCustomerId);
        giveGiftHistory.setContent(giveGift.getContent());
        giveGiftHistory.setCreateTime(LocalDateTime.now());
        save(giveGiftHistory);
    }

    public GiveGiftHistory getByGiveGiftId(Long giveGiftId) {
        LambdaQueryWrapper<GiveGiftHistory> lqw = new LambdaQueryWrapper<>();
        lqw.eq(GiveGiftHistory::getGiveGiftId, giveGiftId);
        return getOnlyOne(lqw);
    }

    /**
     * 获取领取礼物的客户id
     *
     * @param giveGiftIdList
     * @return
     */
    public Map<Long, Long> getGiftToCustomerMap(List<Long> giveGiftIdList) {
        if (CollectionUtils.isEmpty(giveGiftIdList)) {
            return new HashMap<>();
        }
        LambdaQueryWrapper<GiveGiftHistory> lqw = new LambdaQueryWrapper<>();
        lqw.in(GiveGiftHistory::getGiveGiftId, giveGiftIdList);
        return list(lqw).stream().collect(Collectors.toMap(GiveGiftHistory::getGiveGiftId, GiveGiftHistory::getToCustomerId));
    }
}