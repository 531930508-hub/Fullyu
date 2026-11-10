package com.macro.mall.controller.open;

import cn.binarywang.wx.miniapp.bean.WxMaPhoneNumberInfo;
import com.macro.mall.aspect.IgnoreLog;
import com.macro.mall.common.api.CommonResult;
import com.macro.mall.service.WxMiniService;
import io.swagger.annotations.ApiOperation;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * Created by oahnus on 2025/6/13
 *
 * @author oahnus
 */
@RestController
@Slf4j
@RequestMapping("/admin/open/wx")
public class WxMiniController {
    @Autowired
    WxMiniService wxMiniService;

    @PostMapping("/openId")
    @ApiOperation(value = "利用小程序code登录")
    @IgnoreLog
    public CommonResult<Object> openId(String wxCode,
                                       @RequestParam(required = false) String signature,
                                       @RequestParam(required = false) String rawData,
                                       @RequestParam(required = false) String encryptedData,
                                       @RequestParam(required = false) String iv) {
        return CommonResult.success(wxMiniService.getOpenId(wxCode, signature, rawData, encryptedData, iv));
    }

    @PostMapping("/wap/openId")
    @ApiOperation(value = "wap code登录")
    @IgnoreLog
    public CommonResult<Object> wapOpenId(String wxCode,
                                          @RequestParam(required = false) String signature,
                                          @RequestParam(required = false) String rawData,
                                          @RequestParam(required = false) String encryptedData,
                                          @RequestParam(required = false) String iv) {
        return CommonResult.success(wxMiniService.getWapOpenId(wxCode, signature, rawData, encryptedData, iv));
    }

    @GetMapping("/phone")
    @IgnoreLog
    public CommonResult<WxMaPhoneNumberInfo> phone(String sessionKey,
                                                   String signature,
                                                   String rawData,
                                                   String code,
                                                   String encryptedData,
                                                   String iv) {
        return CommonResult.success(wxMiniService.getPhone(sessionKey, signature, rawData, code, encryptedData, iv));
    }

    @GetMapping("/redirect/mini")
    @ApiOperation(value = "跳转小程序")
    public void redirectMini() {
        wxMiniService.redirectMini();
    }

//    @GetMapping("/generate/short/link")
//    @ApiOperation(value = "生成短链接")
//    public CommonResult<Object> generateShortLink(@RequestParam Map<String, String> params) {
//        String path = params.get("path");
//        params.remove("path");
//        return CommonResult.success(wxMiniService.generateShortLink(path, params));
//    }

//    @GetMapping("/query/url/link")
//    @ApiOperation(value = "查询短链接信息")
//    public CommonResult<Object> queryUrlLink(String urlLink) {
//        return CommonResult.success(wxMiniService.queryUrlLink(urlLink));
//    }
}
