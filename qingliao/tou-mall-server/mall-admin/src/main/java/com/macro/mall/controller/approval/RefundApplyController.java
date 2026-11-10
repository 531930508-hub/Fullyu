package com.macro.mall.controller.approval;

import com.macro.mall.common.api.CommonResult;
import com.macro.mall.entity.RefundApply;
import com.macro.mall.service.approval.RefundApplyService;
import io.swagger.annotations.Api;
import io.swagger.annotations.ApiOperation;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * @author zkl
 * @date 2025/06/10
 */
@RestController
@RequestMapping("/refundApply")
@Api(tags = "")
public class RefundApplyController {
    @Autowired
    RefundApplyService refundApplyService;

    @PostMapping("/add")
    @ApiOperation("添加")
    public CommonResult add(@RequestBody RefundApply refundApply) {
        refundApplyService.add(refundApply);
        return CommonResult.success();
    }
}
