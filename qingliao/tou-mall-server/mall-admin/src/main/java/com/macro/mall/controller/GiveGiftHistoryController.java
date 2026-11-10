package com.macro.mall.controller;

import com.macro.mall.service.GiveGiftHistoryService;
import io.swagger.annotations.Api;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 礼物领取记录
 *
 * @author ST
 * @date 2025/06/03
 */
@RestController
@RequestMapping("/giveGiftHistory")
@Api(tags = "礼物领取")
public class GiveGiftHistoryController {
    @Autowired
    GiveGiftHistoryService service;

}
