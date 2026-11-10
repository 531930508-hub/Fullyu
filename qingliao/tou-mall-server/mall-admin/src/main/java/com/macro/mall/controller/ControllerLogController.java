package com.macro.mall.controller;

import com.macro.mall.service.ControllerLogService;
import io.swagger.annotations.Api;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 操作记录
 *
 * @author ST
 * @date 2025/07/03
 */
@RestController
@RequestMapping("/controllerLog")
@Api(tags = "")
public class ControllerLogController {
    @Autowired
    ControllerLogService controllerLogService;

}
