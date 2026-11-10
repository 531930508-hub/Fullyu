package com.macro.mall.controller;

import com.macro.mall.service.ChatBotService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.RequestMapping;
import io.swagger.annotations.Api;
import org.springframework.web.bind.annotation.RestController;

/**
 * coze机器人
 * @author zkl
 * @date 2025/06/13
 */
@RestController
@RequestMapping("/chatBot")
@Api(tags = "coze机器人")
public class ChatBotController {
    @Autowired
    ChatBotService chatBotService;

}
