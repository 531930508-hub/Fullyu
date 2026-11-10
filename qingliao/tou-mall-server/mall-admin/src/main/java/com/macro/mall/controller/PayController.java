package com.macro.mall.controller;

import com.google.common.base.Stopwatch;
import com.macro.mall.common.api.CommonResult;
import com.macro.mall.config.ContextMixin;
import com.macro.mall.service.OrderService;
import io.swagger.annotations.Api;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * Created by oahnus on 2025/6/13
 *
 * @author oahnus
 */
@RestController
@RequestMapping("/pay")
@Api(tags = "生成支付")
public class PayController implements ContextMixin {
    @Autowired
    private OrderService orderService;

    @GetMapping("/gen")
    public CommonResult generatePayInfo(@RequestParam Long orderId,
                                        @RequestParam String openId) {
        Long curCustomerId = curCustomerId();
        Stopwatch stopwatch = Stopwatch.createStarted();
        Map<String, String> res = orderService.generatePayInfo(curCustomerId, orderId, openId);
        stopwatch.stop();
        System.out.println("支付controller耗时:" + stopwatch);
        return CommonResult.success(res);
    }
}
