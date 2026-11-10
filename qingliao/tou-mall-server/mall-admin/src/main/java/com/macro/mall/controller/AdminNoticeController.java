package com.macro.mall.controller;

import com.macro.mall.aspect.IgnoreLog;
import com.macro.mall.bo.AdminUserDetails;
import com.macro.mall.common.api.CommonResult;
import com.macro.mall.common.exception.BusinessException;
import com.macro.mall.model.UmsAdmin;
import com.macro.mall.service.AdminNoticeBindingService;
import com.macro.mall.service.AdminApprovalNoticeService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;
import java.util.Map;

@RestController
@RequestMapping("/adminNotice")
public class AdminNoticeController {
    @Autowired AdminNoticeBindingService bindings;
    @Autowired AdminApprovalNoticeService notices;
    private Long currentAdmin(){
        Authentication auth=SecurityContextHolder.getContext().getAuthentication();
        if(auth==null||!auth.isAuthenticated()||!(auth.getPrincipal() instanceof AdminUserDetails))throw new BusinessException("请先登录后台");
        UmsAdmin admin=((AdminUserDetails)auth.getPrincipal()).getUmsAdmin();
        if(admin==null||admin.getId()==null||!Integer.valueOf(1).equals(admin.getStatus()))throw new BusinessException("后台账号不可用");return admin.getId();
    }
    @GetMapping("/status") public CommonResult status(){return CommonResult.success(bindings.status(currentAdmin()));}
    @IgnoreLog
    @PostMapping("/binding/begin") public CommonResult begin(){return CommonResult.success(bindings.begin(currentAdmin()));}
    @IgnoreLog
    @PostMapping("/binding/confirm") public CommonResult confirm(@RequestBody Map<String,String> body){return CommonResult.success(bindings.confirm(currentAdmin(),body==null?null:body.get("nonce")));}
    @IgnoreLog
    @PostMapping("/binding/unlink") public CommonResult unlink(){bindings.unlink(currentAdmin());return CommonResult.success();}
    @GetMapping("/logs") public CommonResult logs(@RequestParam(defaultValue="1") int page,@RequestParam(defaultValue="10") int size){return CommonResult.success(notices.logs(currentAdmin(),page,size));}
}
