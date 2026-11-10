package com.macro.mall.controller;

import com.alibaba.fastjson2.JSONObject;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.github.pagehelper.PageHelper;
import com.github.pagehelper.PageInfo;
import com.macro.mall.common.api.CommonResult;
import com.macro.mall.common.exception.BusinessException;
import com.macro.mall.entity.ControllerLog;
import com.macro.mall.entity.MassagistSchedules;
import com.macro.mall.incentive.service.IncentiveAccessService;
import com.macro.mall.service.ControllerLogService;
import com.macro.mall.service.MassagistSchedulesService;
import io.swagger.annotations.Api;
import io.swagger.annotations.ApiOperation;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;
import java.time.LocalDateTime;
import java.util.*;

@RestController
@RequestMapping("/massagistSchedules")
@Api(tags = "疗愈师排班")
public class MassagistSchedulesController {
    @Autowired MassagistSchedulesService massagistSchedulesService;
    @Autowired IncentiveAccessService access;
    @Autowired ControllerLogService controllerLogService;

    private void requireManage(Long shopId) {
        if (access.currentAdmin().getMassagistId() != null && !access.isGlobal())
            throw new BusinessException("请由门店管理人员操作排班");
        access.requireShopAccess(shopId);
    }
    private void requireManage(MassagistSchedules request) {
        requireManage(request.getShopId());
        if (request.getTargetShopId() != null && request.getTargetShopId() > 0) requireManage(request.getTargetShopId());
        if (request.getId() != null) {
            MassagistSchedules old = massagistSchedulesService.getById(request.getId());
            if (old == null) throw new BusinessException("排班记录不存在");
            requireManage(old.getShopId());
            if (old.getTargetShopId() != null && old.getTargetShopId() > 0) requireManage(old.getTargetShopId());
        }
    }

    @GetMapping("/page")
    @ApiOperation("分页查询")
    public CommonResult page(@RequestParam Map<String,Object> params) {
        Long requested = params.get("shopId") == null ? null : Long.valueOf(params.get("shopId").toString());
        Long shopId = access.resolveShopId(requested);
        if (shopId == null) throw new BusinessException("请选择门店");
        params.put("shopId",shopId);
        return CommonResult.success(massagistSchedulesService.pageInfo(params));
    }
    @PostMapping("/saveOrUpd")
    @ApiOperation("添加或者编辑")
    public CommonResult saveOrUpd(@RequestBody MassagistSchedules value) {
        requireManage(value);
        return CommonResult.success(massagistSchedulesService.addOrChange(value));
    }
    @PostMapping("/saveTargetShop")
    @ApiOperation("编辑调店")
    public CommonResult saveTargetShop(@RequestBody MassagistSchedules value) {
        requireManage(value);
        return CommonResult.success(massagistSchedulesService.saveTargetShop(value));
    }
    @PostMapping("/batchTargetShop")
    @ApiOperation("添加调店")
    public CommonResult batchTargetShop(@RequestBody MassagistSchedules value) {
        requireManage(value);
        return CommonResult.success(massagistSchedulesService.batchTargetShop(value));
    }
    @PostMapping("/batchAdd")
    @ApiOperation("批量添加")
    public CommonResult batchAdd(@RequestBody MassagistSchedules value) {
        requireManage(value);
        return CommonResult.success(massagistSchedulesService.batchAdd(value));
    }
    @GetMapping("/list")
    @ApiOperation("列表")
    public CommonResult list(@RequestParam Map<String,Object> params) {
        Long shopId = access.resolveShopId(params.get("shopId") == null ? null : Long.valueOf(params.get("shopId").toString()));
        if (shopId == null) throw new BusinessException("请选择门店");
        params.put("shopId",shopId);
        return CommonResult.success(massagistSchedulesService.listNoPage(params));
    }
    @DeleteMapping("/remove")
    @ApiOperation("删除")
    public CommonResult remove(@RequestParam Long id) {
        MassagistSchedules row = massagistSchedulesService.getById(id);
        if (row == null) throw new BusinessException("排班记录不存在");
        requireManage(row);
        massagistSchedulesService.delete(id);
        return CommonResult.success();
    }
    @PostMapping("/clearFuture")
    @ApiOperation("清除个人未来未生效排班")
    public CommonResult clearFuture(@RequestParam Long massagistId, @RequestParam Long shopId) {
        requireManage(shopId);
        // 调店记录也涉及目标店，清班前逐条校验，不能借原店权限删掉目标店排班。
        for (MassagistSchedules s : massagistSchedulesService.list(new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<MassagistSchedules>()
                .eq(MassagistSchedules::getMassagistId,massagistId).eq(MassagistSchedules::getShopId,shopId)
                .ge(MassagistSchedules::getDay,java.time.LocalDate.now()))) {
            if (s.getTargetShopId() != null && s.getTargetShopId() > 0) requireManage(s.getTargetShopId());
        }
        return CommonResult.success(massagistSchedulesService.clearFuture(massagistId,shopId,LocalDateTime.now()));
    }
    @GetMapping("/changeLogs")
    @ApiOperation("排班变更前后值与操作者")
    public CommonResult changeLogs(@RequestParam Long shopId, @RequestParam(required=false) Long massagistId,
                                   @RequestParam(defaultValue="1") int page, @RequestParam(defaultValue="10") int size) {
        requireManage(shopId);
        QueryWrapper<ControllerLog> query = new QueryWrapper<ControllerLog>().eq("source","schedule-audit")
                .likeRight("title","排班变更:" + shopId + ":" + (massagistId == null ? "" : massagistId + ":"))
                .orderByDesc("id");
        PageHelper.startPage(Math.max(1,page),Math.max(1,Math.min(100,size)));
        List<ControllerLog> rows;
        try { rows = controllerLogService.list(query); } finally { PageHelper.clearPage(); }
        PageInfo<ControllerLog> info = new PageInfo<>(rows);
        List<JSONObject> result = new ArrayList<>();
        for (ControllerLog row : rows) {
            JSONObject item = JSONObject.parseObject(row.getParams());
            item.put("id",row.getId()); item.put("operatorId",row.getCreateUser()); item.put("createTime",row.getCreateTime());
            result.add(item);
        }
        JSONObject response = new JSONObject(); response.put("list",result); response.put("total",info.getTotal());
        return CommonResult.success(response);
    }
}
