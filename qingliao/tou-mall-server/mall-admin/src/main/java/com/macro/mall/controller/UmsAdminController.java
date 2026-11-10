package com.macro.mall.controller;

import cn.hutool.core.collection.CollUtil;
import com.alibaba.fastjson2.JSONObject;
import com.macro.mall.aspect.IgnoreLog;
import com.macro.mall.common.api.CommonPage;
import com.macro.mall.common.api.CommonResult;
import com.macro.mall.common.exception.BusinessException;
import com.macro.mall.dto.UmsAdminLoginParam;
import com.macro.mall.dto.UmsAdminParam;
import com.macro.mall.dto.UpdateAdminPasswordParam;
import com.macro.mall.entity.Massagist;
import com.macro.mall.incentive.service.TrainingTeamCertProperties;
import com.macro.mall.model.UmsAdmin;
import com.macro.mall.model.UmsRole;
import com.macro.mall.enums.MassagistIdentityCode;
import com.macro.mall.service.MassagistIdentityService;
import com.macro.mall.service.MassagistService;
import com.macro.mall.service.UmsAdminService;
import com.macro.mall.service.UmsRoleService;
import com.macro.mall.service.impl.UmsAdminServiceImpl;
import io.swagger.annotations.Api;
import io.swagger.annotations.ApiOperation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Controller;
import org.springframework.util.ObjectUtils;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

import javax.servlet.http.HttpServletRequest;
import java.security.Principal;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * 后台用户管理Controller
 * Created by macro on 2018/4/26.
 */
@Controller
@Api(tags = "UmsAdminController")
@Tag(name = "UmsAdminController", description = "后台用户管理")
@RequestMapping("/admin")
public class UmsAdminController {
    @Value("${jwt.tokenHeader}")
    private String tokenHeader;
    @Value("${jwt.tokenHead}")
    private String tokenHead;
    @Autowired
    private UmsAdminService adminService;
    @Autowired
    private UmsAdminServiceImpl umsAdminService;
    @Autowired
    private UmsRoleService roleService;
    @Autowired
    private MassagistService massagistService;
    @Autowired
    private MassagistIdentityService massagistIdentityService;
    @Autowired
    private TrainingTeamCertProperties teamCertProperties;

    @ApiOperation(value = "用户注册")
    @RequestMapping(value = "/register", method = RequestMethod.POST)
    @ResponseBody
    public CommonResult<UmsAdmin> register(@Validated @RequestBody UmsAdminParam umsAdminParam) {
        String joinStr = Arrays.stream(umsAdminParam.shopIdArrOther)   // 创建 IntStream
                .boxed()                           // int -> Integer
                .map(String::valueOf)              // Integer -> String
                .collect(Collectors.joining(",")); // 用逗号拼接
        umsAdminParam.setShopIdArr("["+joinStr+"]");
        UmsAdmin umsAdmin = adminService.register(umsAdminParam);
        if (umsAdmin == null) {
            return CommonResult.failed();
        }
        return CommonResult.success(umsAdmin);
    }

    @ApiOperation(value = "登录以后返回token")
    @RequestMapping(value = "/login", method = RequestMethod.POST)
    @ResponseBody
    @IgnoreLog
    public CommonResult login(@Validated @RequestBody UmsAdminLoginParam umsAdminLoginParam) {
        String token = adminService.login(umsAdminLoginParam.getUsername(), umsAdminLoginParam.getPassword());
        if (token == null) {
            return CommonResult.validateFailed("用户名或密码错误");
        }
        Map<String, String> tokenMap = new HashMap<>();
        tokenMap.put("token", token);
        tokenMap.put("tokenHead", tokenHead);
        return CommonResult.success(tokenMap);
    }

    @ApiOperation(value = "刷新token")
    @RequestMapping(value = "/refreshToken", method = RequestMethod.GET)
    @ResponseBody
    @IgnoreLog
    public CommonResult refreshToken(HttpServletRequest request) {
        String token = request.getHeader(tokenHeader);
        String refreshToken = adminService.refreshToken(token);
        if (refreshToken == null) {
            return CommonResult.failed("token已经过期！");
        }
        Map<String, String> tokenMap = new HashMap<>();
        tokenMap.put("token", refreshToken);
        tokenMap.put("tokenHead", tokenHead);
        return CommonResult.success(tokenMap);
    }

    @ApiOperation(value = "获取当前登录用户信息")
    @RequestMapping(value = "/info", method = RequestMethod.GET)
    @ResponseBody
    @IgnoreLog
    public CommonResult getAdminInfo(Principal principal) {
        if (principal == null) {
            return CommonResult.unauthorized(null);
        }
        String username = principal.getName();
        UmsAdmin umsAdmin = adminService.getAdminByUsername(username);
        Map<String, Object> data = new HashMap<>();
        data.put("username", umsAdmin.getUsername());
        data.put("userId", umsAdmin.getId());
        data.put("shopId", umsAdmin.getShopId());
        data.put("menus", roleService.getMenuList(umsAdmin.getId()));
        data.put("icon", umsAdmin.getIcon());
        data.put("massagistId", umsAdmin.getMassagistId());
        putIdentity(data, umsAdmin);
        List<UmsRole> roleList = adminService.getRoleList(umsAdmin.getId());
        if (CollUtil.isNotEmpty(roleList)) {
            List<String> roles = roleList.stream().filter(e -> !ObjectUtils.isEmpty(e) && !ObjectUtils.isEmpty(e.getName())).map(UmsRole::getName).collect(Collectors.toList());
            data.put("roles", roles);
        }
        return CommonResult.success(data);
    }

    @ApiOperation(value = "获取当前登录用户信息")
    @RequestMapping(value = "/infoNew", method = RequestMethod.GET)
    @ResponseBody
    @IgnoreLog
    public CommonResult getAdminInfoNew(Principal principal) {
        if (principal == null) {
            return CommonResult.unauthorized(null);
        }
        String username = principal.getName();
        UmsAdmin umsAdmin = adminService.getAdminByUsernameNew(username);
        Map<String, Object> data = new HashMap<>();
        data.put("username", umsAdmin.getUsername());
        data.put("userId", umsAdmin.getId());
        data.put("shopId", umsAdmin.getShopId());
        data.put("menus", roleService.getMenuList(umsAdmin.getId()));
        data.put("icon", umsAdmin.getIcon());
        data.put("massagistId", umsAdmin.getMassagistId());
        putIdentity(data, umsAdmin);
        List<UmsRole> roleList = adminService.getRoleList(umsAdmin.getId());
        if (CollUtil.isNotEmpty(roleList)) {
            List<String> roles = roleList.stream().filter(e -> !ObjectUtils.isEmpty(e) && !ObjectUtils.isEmpty(e.getName())).map(UmsRole::getName).collect(Collectors.toList());
            data.put("roles", roles);
        }
        return CommonResult.success(data);
    }

    /**
     * 内训师/店长身份供前端决定是否展示手机端考核入口。
     * 功能开关关闭时始终返回 false，避免生产环境提前暴露入口。
     */
    private void putIdentity(Map<String, Object> data, UmsAdmin umsAdmin) {
        boolean trainer = false;
        boolean shopManager = false;
        Long massagistId = umsAdmin.getMassagistId();
        if (massagistId != null) {
            Massagist massagist = massagistService.getById(massagistId);
            trainer = teamCertProperties.enabled() && massagist != null
                    && Integer.valueOf(1).equals(massagist.getIsTrainer())
                    && Integer.valueOf(1).equals(massagist.getStatus());
            shopManager = massagist != null
                    && massagistIdentityService.hasCode(massagistId, MassagistIdentityCode.SHOP_MANAGER);
        }
        data.put("trainer", trainer);
        data.put("shopManager", shopManager);
    }

    @ApiOperation(value = "登出功能")
    @RequestMapping(value = "/logout", method = RequestMethod.POST)
    @ResponseBody
    @IgnoreLog
    public CommonResult logout(Principal principal) {        adminService.logout(principal.getName());
        return CommonResult.success(null);
    }

    @ApiOperation("根据用户名或姓名分页获取用户列表")
    @RequestMapping(value = "/list", method = RequestMethod.GET)
    @ResponseBody
    public CommonResult<CommonPage<UmsAdmin>> list(@RequestParam(value = "keyword", required = false) String keyword,
                                                   @RequestParam(value = "pageSize", defaultValue = "5") Integer pageSize,
                                                   @RequestParam(value = "pageNum", defaultValue = "1") Integer pageNum) {
        List<UmsAdmin> adminList = adminService.list(keyword, pageSize, pageNum);
        return CommonResult.success(CommonPage.restPage(adminList));
    }


    @GetMapping("/listAll")
    @ApiOperation("获取启用的账号")
    @ResponseBody
    public CommonResult listAll(@RequestParam(required = false) Long shopId) {
        return CommonResult.success(umsAdminService.listAll(shopId));
    }

    @ApiOperation("获取指定用户信息")
    @RequestMapping(value = "/{id}", method = RequestMethod.GET)
    @ResponseBody
    public CommonResult<UmsAdmin> getItem(@PathVariable Long id) {
        UmsAdmin admin = adminService.getItem(id);
        return CommonResult.success(admin);
    }

    @ApiOperation("修改指定用户信息")
    @RequestMapping(value = "/update/{id}", method = RequestMethod.POST)
    @ResponseBody
    public CommonResult update(@PathVariable Long id, @RequestBody UmsAdmin admin) {
        if(admin.getshopIdArrOther().length==0){
            admin.setShopIdArr("[1]");
            admin.setShopId((long)1);
        }else {
            admin.setShopIdArr(Arrays.toString(admin.getshopIdArrOther()));
            long aa=(long)admin.getshopIdArrOther()[0];
            admin.setShopId(aa);
        }


        int count = adminService.update(id, admin);
        if (count > 0) {
            return CommonResult.success(count);
        }
        return CommonResult.failed();
    }

    @ApiOperation("修改指定用户信息")
    @RequestMapping(value = "/update/password", method = RequestMethod.POST)
    @ResponseBody
    public CommonResult updatePassword(@RequestBody JSONObject jsonpObject) {
        String username = jsonpObject.getString("username");
        String oldPassword = jsonpObject.getString("oldPassword");
        String newPassword = jsonpObject.getString("newPassword");
        String newPassword2 = jsonpObject.getString("newPassword2");
        if (ObjectUtils.isEmpty(username) || ObjectUtils.isEmpty(oldPassword) || ObjectUtils.isEmpty(newPassword) || ObjectUtils.isEmpty(newPassword2)) {
            throw new BusinessException("提交参数不合法");
        }
        adminService.updatePassword(username, oldPassword, newPassword, newPassword2);
        return CommonResult.success();
    }

    @ApiOperation("修改指定用户密码")
    @RequestMapping(value = "/updatePassword", method = RequestMethod.POST)
    @ResponseBody
    public CommonResult updatePassword(@Validated @RequestBody UpdateAdminPasswordParam updatePasswordParam) {
        int status = adminService.updatePassword(updatePasswordParam);
        if (status > 0) {
            return CommonResult.success(status);
        } else if (status == -1) {
            return CommonResult.failed("提交参数不合法");
        } else if (status == -2) {
            return CommonResult.failed("找不到该用户");
        } else if (status == -3) {
            return CommonResult.failed("旧密码错误");
        } else {
            return CommonResult.failed();
        }
    }

    @ApiOperation("删除指定用户信息")
    @RequestMapping(value = "/delete/{id}", method = RequestMethod.POST)
    @ResponseBody
    public CommonResult delete(@PathVariable Long id) {
        int count = adminService.delete(id);
        if (count > 0) {
            return CommonResult.success(count);
        }
        return CommonResult.failed();
    }

    @ApiOperation("修改帐号状态")
    @RequestMapping(value = "/updateStatus/{id}", method = RequestMethod.POST)
    @ResponseBody
    public CommonResult updateStatus(@PathVariable Long id, @RequestParam(value = "status") Integer status) {
        UmsAdmin umsAdmin = new UmsAdmin();
        umsAdmin.setStatus(status);
        int count = adminService.update(id, umsAdmin);
        if (count > 0) {
            return CommonResult.success(count);
        }
        return CommonResult.failed();
    }

    @ApiOperation("给用户分配角色")
    @RequestMapping(value = "/role/update", method = RequestMethod.POST)
    @ResponseBody
    public CommonResult updateRole(@RequestParam("adminId") Long adminId,
                                   @RequestParam("roleIds") List<Long> roleIds) {
        int count = adminService.updateRole(adminId, roleIds);
        if (count >= 0) {
            return CommonResult.success(count);
        }
        return CommonResult.failed();
    }

    @ApiOperation("获取指定用户的角色")
    @RequestMapping(value = "/role/{adminId}", method = RequestMethod.GET)
    @ResponseBody
    public CommonResult<List<UmsRole>> getRoleList(@PathVariable Long adminId) {
        List<UmsRole> roleList = adminService.getRoleList(adminId);
        return CommonResult.success(roleList);
    }

    @ApiOperation("获门店下的所有员工")
    @RequestMapping(value = "/GetAdminUserList/{shopId}", method = RequestMethod.GET)
    @ResponseBody
    public CommonResult<List<UmsAdmin>> GetAdminUserList(@PathVariable Long shopId) {
        List<UmsAdmin> adminList = adminService.GetAdminUserList(shopId);
        return CommonResult.success(adminList);
    }

}
