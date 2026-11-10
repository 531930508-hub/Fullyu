package com.macro.mall.controller.shop;

import com.macro.mall.common.api.CommonResult;
import com.macro.mall.entity.Room;
import com.macro.mall.service.shop.RoomService;
import io.swagger.annotations.Api;
import io.swagger.annotations.ApiOperation;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * @author zkl
 * @date 2025/05/30
 */
@RestController
@RequestMapping("/room")
@Api(tags = "")
public class RoomController {
    @Autowired
    RoomService roomService;

    @GetMapping("/page")
    @ApiOperation("分页查询")
    public CommonResult page(@RequestParam Map<String, Object> params) {
        return CommonResult.success(roomService.page(params));
    }

    @PostMapping("/saveOrUpd")
    @ApiOperation("添加或者编辑")
    public CommonResult saveOrUpd(@RequestBody Room room) {
        return CommonResult.success(roomService.saveOrUpdate(room));
    }

    @GetMapping("/list")
    @ApiOperation("房间列表")
    public CommonResult list(@RequestParam Map<String, Object> params) {
        return CommonResult.success(roomService.listNoPage(params));
    }

    @DeleteMapping("/remove")
    @ApiOperation("删除房间及其床位")
    public CommonResult remove(@RequestParam Long id) {
        roomService.remove(id);
        return CommonResult.success();
    }
}
