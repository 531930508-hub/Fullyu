package com.macro.mall.controller.open;

import com.alibaba.fastjson2.JSONObject;
import com.macro.mall.aspect.FullLog;
import com.macro.mall.common.api.CommonResult;
import com.macro.mall.service.CustomerService;
import com.macro.mall.service.OrderService;
import io.swagger.annotations.Api;
import io.swagger.annotations.ApiOperation;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 订单开放接口
 */
@RestController
@RequestMapping("/fully/open")
@Api(tags = "rpc订单接口")
@Slf4j
public class FullyOpenController {
    @Autowired
    OrderService orderService;
    @Autowired
    CustomerService customerService;

    @PostMapping("/order/create")
    @ApiOperation("电话agent下单")
    @FullLog(saveLogField = "oldOrderDetailMap", returnField = "data")
    public CommonResult createOrder(@RequestBody String appointmentParam) {
        String jsonString = appointmentParam;
        JSONObject jsonObject = new JSONObject();
        try {
            if (jsonString.startsWith("\"") && jsonString.endsWith("\"")) {
                jsonString = jsonString.substring(1, jsonString.length() - 1);
                jsonString = jsonString.replace("\\\"", "\"");
                jsonString = jsonString.replace("\\\\", "\\");
                jsonString = jsonString.replace("\\r\\n", "\n");
                jsonString = jsonString.replace("\\n", "\n");
            }
            jsonObject = orderService.phoneAgentBuildCreate(JSONObject.parseObject(jsonString));
        } catch (Exception e) {
            log.error("电话智能预约失败，msg={}", e.getMessage());
            JSONObject object = new JSONObject();
            object.put("result", e.getMessage());
            jsonObject.put("data", object);
        }
        return CommonResult.success(jsonObject);
    }

    @PostMapping("/find/appointment/time")
    @ApiOperation("获取可预约时间")
    @FullLog(saveLogField = "note", returnField = "data")
    public CommonResult findAppointmentTime(@RequestBody String appointmentParam) {
        String jsonString = appointmentParam;
        JSONObject jsonObject = new JSONObject();
        try {
            if (jsonString.startsWith("\"") && jsonString.endsWith("\"")) {
                jsonString = jsonString.substring(1, jsonString.length() - 1);
                jsonString = jsonString.replace("\\\"", "\"");
                jsonString = jsonString.replace("\\\\", "\\");
                jsonString = jsonString.replace("\\r\\n", "\n");
                jsonString = jsonString.replace("\\n", "\n");
            }
            String data = orderService.findAppointmentTime(JSONObject.parseObject(jsonString));
            JSONObject object = new JSONObject();
            object.put("result", data);
            jsonObject.put("data", object);
            jsonObject.put("note", data);
        } catch (Exception e) {
            log.error("获取可预约时间失败，msg={}", e.getMessage());
            JSONObject object = new JSONObject();
            object.put("result", e.getMessage());
            jsonObject.put("data", object);
        }
        return CommonResult.success(jsonObject);
    }

    @PostMapping("/find/customer/nickname")
    @ApiOperation("获取客户信息")
    @FullLog(saveLogField = "note", returnField = "data")
    public CommonResult findCustomerInfo(@RequestBody String appointmentParam) {
        String jsonString = appointmentParam;
        JSONObject jsonObject = new JSONObject();
        try {
            if (jsonString.startsWith("\"") && jsonString.endsWith("\"")) {
                jsonString = jsonString.substring(1, jsonString.length() - 1);
                jsonString = jsonString.replace("\\\"", "\"");
                jsonString = jsonString.replace("\\\\", "\\");
                jsonString = jsonString.replace("\\r\\n", "\n");
                jsonString = jsonString.replace("\\n", "\n");
            }
            String data;
            JSONObject object = JSONObject.parseObject(jsonString);
            String phone = object.getString("手机号码");
            if (phone == null) {
                data = "手机号码不能为空";
            } else {
                String customerNickname = customerService.findCustomerComment(phone);
                if (customerNickname == null) {
                    data = "";
                } else {
                    data = customerNickname;
                }
            }
            JSONObject result = new JSONObject();
            result.put("result", data);
            jsonObject.put("data", result);
            jsonObject.put("note", data);
        } catch (Exception e) {
            log.error("获取客户备注失败，msg={}", e.getMessage());
            JSONObject object = new JSONObject();
            object.put("result", e.getMessage());
            jsonObject.put("data", object);
        }
        return CommonResult.success(jsonObject);
    }
}
