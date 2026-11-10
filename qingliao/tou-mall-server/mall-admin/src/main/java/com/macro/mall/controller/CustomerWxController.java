package com.macro.mall.controller;

import com.macro.mall.service.CustomerWxService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.RequestMapping;
import io.swagger.annotations.Api;
import org.springframework.web.bind.annotation.RestController;

/**
 * 微信用户
 * @author 
 * @date 2025/07/23
 */
@RestController
@RequestMapping("/customerWx")
@Api(tags = "微信用户")
public class CustomerWxController {
    @Autowired
    CustomerWxService customerWxService;

}
