package com.macro.mall.controller;

import com.macro.mall.service.OrderPrintRecordService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.RequestMapping;
import io.swagger.annotations.Api;
import org.springframework.web.bind.annotation.RestController;

/**
 * 小票打印记录
 * @author zkl
 * @date 2025/07/02
 */
@RestController
@RequestMapping("/orderPrintRecord")
@Api(tags = "小票打印记录")
public class OrderPrintRecordController {
    @Autowired
    OrderPrintRecordService orderPrintRecordService;

}
