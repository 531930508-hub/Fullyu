package com.macro.mall.controller;

import com.macro.mall.service.ApprovalService;
import io.swagger.annotations.Api;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * @author zkl
 * @date 2025/06/10
 */
@RestController
@RequestMapping("/approval")
@Api(tags = "")
public class ApprovalController {
    @Autowired
    ApprovalService approvalService;


}
