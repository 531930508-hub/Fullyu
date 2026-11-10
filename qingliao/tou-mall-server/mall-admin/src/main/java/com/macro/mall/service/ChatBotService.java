package com.macro.mall.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.macro.mall.entity.ChatBot;
import com.macro.mall.enums.NormalState;
import com.macro.mall.mapper.ChatBotMapper;
import com.macro.mall.service.base.BaseService;
import org.springframework.stereotype.Service;

/**
 * coze机器人 服务类
 *
 * @author zkl
 * @date 2025/06/13
 */
@Service
public class ChatBotService extends BaseService<ChatBotMapper, ChatBot> {

    public ChatBot findBotByType(Integer type) {
        LambdaQueryWrapper<ChatBot> queryWrapper = new LambdaQueryWrapper();
        queryWrapper.eq(ChatBot::getType, type);
        queryWrapper.eq(ChatBot::getState, NormalState.EFFECTIVE.getValue());
        return getOnlyOne(queryWrapper);
    }
}