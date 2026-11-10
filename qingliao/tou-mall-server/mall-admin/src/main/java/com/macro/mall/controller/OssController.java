package com.macro.mall.controller;


import com.macro.mall.common.api.CommonResult;
import com.macro.mall.dto.OssCallbackResult;
import com.macro.mall.dto.OssPolicyResult;
import com.macro.mall.service.OssService;
import io.swagger.annotations.Api;
import io.swagger.annotations.ApiOperation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.*;

import javax.servlet.http.HttpServletRequest;
import java.util.Date;

/**
 * Oss对象存储管理Controller
 * Created by macro on 2018/4/26.
 */
@Controller
@Api(tags = "OssController")
@Tag(name = "OssController", description = "Oss对象存储管理")
@RequestMapping("/aliyun/oss")
@ResponseBody
public class OssController {
    @Autowired
    private OssService ossService;

/*    @ApiOperation(value = "Oss上传签名生成")
    @RequestMapping(value = "/policy", method = RequestMethod.GET)
    public CommonResult<OssPolicyResult> policy() {
        OssPolicyResult result = ossService.policy();
        return CommonResult.success(result);
    }

    @ApiOperation(value = "Oss上传成功回调")
    @RequestMapping(value = "callback", method = RequestMethod.POST)
    public CommonResult<OssCallbackResult> callback(HttpServletRequest request) {
        OssCallbackResult ossCallbackResult = ossService.callback(request);
        return CommonResult.success(ossCallbackResult);
    }*/

    @ApiOperation(value = "Oss预签名上传url")
    @GetMapping("/generatePreSignedUrl")
    public CommonResult generatePreSignedUrl(@RequestParam String fileName, @RequestParam(required = false) String prefix) {
        return CommonResult.success(ossService.generatePreSignedUrl(fileName, prefix));
    }
}
