package com.macro.mall.controller;

import com.macro.mall.service.BotChatRecordService;
import io.swagger.annotations.Api;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * 扣子对话记录
 *
 * @author zkl
 * @date 2025/06/13
 */
@RestController
@RequestMapping("/botChatRecord")
@Api(tags = "扣子对话记录")
public class BotChatRecordController {
    @Autowired
    BotChatRecordService botChatRecordService;

    @GetMapping("/arriveTimeList")
    public String findArriveTimeList(@RequestParam String need, @RequestParam String token) {
        return botChatRecordService.findArriveTimeList(need, token);
    }
}
