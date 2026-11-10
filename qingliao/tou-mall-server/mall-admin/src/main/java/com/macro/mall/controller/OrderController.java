package com.macro.mall.controller;

import com.alibaba.fastjson2.JSONObject;
import com.macro.mall.aspect.FullLog;
import com.macro.mall.common.api.CommonResult;
import com.macro.mall.config.ContextMixin;
import com.macro.mall.dto.*;
import com.macro.mall.entity.Order;
import com.macro.mall.service.BotChatRecordService;
import com.macro.mall.service.MassagistSchedulesService;
import com.macro.mall.service.OrderService;
import com.macro.mall.utils.DateUtil;
import io.swagger.annotations.Api;
import io.swagger.annotations.ApiOperation;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Lazy;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import javax.validation.Valid;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.Map;

/**
 * 订单
 *
 * @author ST
 * @date 2025/05/30
 */
@RestController
@RequestMapping("/order")
@Api(tags = "订单")
public class OrderController implements ContextMixin {
    @Autowired
    OrderService service;
    @Autowired
    BotChatRecordService botChatRecordService;
    @Autowired
    @Lazy
    MassagistSchedulesService massagistSchedulesService;


    @PostMapping("/chat/reply")
    @ApiOperation("聊天回复（文本和语音必传其一）")
    public CommonResult chatReply(String message, String fileUrl, Integer voiceDuration, Long shopId) {
        return CommonResult.success(botChatRecordService.chatReply(message, fileUrl, curCustomerId(), voiceDuration,shopId));
    }

    @PostMapping("/chat/upload")
    @ApiOperation("上传语音文件")
    public CommonResult chatReplyUpload(MultipartFile file) {
        return CommonResult.success(botChatRecordService.uploadVoiceFile(file));
    }

    @GetMapping("/chat/page")
    @ApiOperation("聊天记录（可选参数：customerId,createTime,page,size）")
    public CommonResult listsss(@RequestParam Map<String, Object> params) {
        params.put("customerId", curCustomerId());
        return CommonResult.success(botChatRecordService.pageList(params));
    }

    @GetMapping("/page")
    @ApiOperation("分页查询")
    public CommonResult page(@RequestParam Map<String, Object> params) {
        return CommonResult.success(service.pageInfo(params));
    }

    @GetMapping("/export")
    @ApiOperation("导出")
    public void orderExport(@RequestParam Map<String, Object> params) {
        service.orderExport(params);
    }

    @GetMapping("/list")
    @ApiOperation("根据条件查询list")
    public CommonResult list(@RequestParam Map<String, Object> params) {
        return CommonResult.success(service.listNoPage(params));
    }

    @PostMapping("/create/order")
    @ApiOperation("小程序下单接口")
    @FullLog(saveLogField = "oldOrderDetailMap", returnField = "data")
    public CommonResult createDetail(@RequestBody OrderDetailDto dto) {
        dto.setCustomerId(curCustomerId());
        return CommonResult.success(service.fullyMiniCreateOrder(dto));
    }

    @PostMapping("/create/pcorder")
    @ApiOperation("后台下卡卷订单")
    @FullLog(saveLogField = "oldOrderDetailMap", returnField = "data")
    public CommonResult pccreateDetail(@RequestBody OrderDetailDtoNew dto) {
        return CommonResult.success(service.pcfullyMiniCreateOrder(dto));
    }

    @PostMapping("/appointment/order")
    @ApiOperation("PC前台创建订单")
    @FullLog(saveLogField = "oldOrderDetailMap")
    public CommonResult appointmentOrder(@RequestBody @Valid AppointmentParam appointmentParam) {
        return CommonResult.success(service.appointmentOrder(appointmentParam));
    }

    @PostMapping("/appointment/Reception/order")
    @ApiOperation("PC前台创建接待")
    @FullLog(saveLogField = "oldOrderDetailMap")
    public CommonResult appointmentReceptionOrder(@RequestBody OrderDetailDto dto) {
        return CommonResult.success(service.appointmentReceptionOrder(dto));
    }

    @PutMapping("/finish/order")
    @ApiOperation("完成订单")
    public CommonResult finishOrder(@RequestParam Long id) {
        service.finish(id);
        return CommonResult.success(id);
    }

    @PutMapping("/confirm/pay")
    @ApiOperation("确认收款")
    public CommonResult confirmPay(@RequestParam Long id, @RequestParam(required = false) BigDecimal payAmount, @RequestParam(required = false) String couponCode) {
        service.confirmPay(id, payAmount, couponCode);
        return CommonResult.success(id);
    }

    @PutMapping("/comment")
    @ApiOperation("修改订单备注")
    public CommonResult updateComment(@RequestParam Long id, @RequestParam String comment) {
        service.updateComment(id, comment);
        return CommonResult.success(id);
    }

    @PutMapping("/couponCode")
    @ApiOperation("修改美团券码")
    public CommonResult updateCouponCode(@RequestParam Long id, @RequestParam String couponCode) {
        service.updateCouponCode(id, couponCode);
        return CommonResult.success(id);
    }

    @PutMapping("/payAmount")
    @ApiOperation("修改订单实付金额")
    public CommonResult updatePayAmount(@RequestParam Long id, @RequestParam BigDecimal payAmount) {
        service.updatePayAmount(id, payAmount);
        return CommonResult.success(id);
    }

    @PostMapping("/update/order")
    @ApiOperation("小程序修改订单")
    @FullLog(saveLogField = "oldOrderDetailMap", returnField = "data")
    public CommonResult updateOrder(@RequestBody OrderDetailDto dto) {
        Long customerId = curCustomerId();
        dto.setCustomerId(customerId);
        JSONObject jsonObject = new JSONObject();
        jsonObject.put("data", dto);
        jsonObject.put("oldOrderDetailMap", service.updateOrder(dto));
        return CommonResult.success(jsonObject);
    }

    @PostMapping("/pc/update/order")
    @ApiOperation("pc修改订单")
    @FullLog(saveLogField = "oldOrderDetailMap", returnField = "data")
    public CommonResult pcUpdateOrder(@RequestBody OrderDetailDto dto) {
        JSONObject jsonObject = new JSONObject();
        jsonObject.put("data", dto);
        jsonObject.put("oldOrderDetailMap", service.pcUpdateOrder(dto));
        return CommonResult.success(jsonObject);
    }

    @PostMapping("/update/Reception/order")
    @ApiOperation("pc修改接待订单订单")
    @FullLog(saveLogField = "oldOrderDetailMap", returnField = "data")
    public CommonResult updateReceptionOrder(@RequestBody OrderDetailDto dto) {
        JSONObject jsonObject = new JSONObject();
        jsonObject.put("data", dto);
        jsonObject.put("oldOrderDetailMap", service.pcUpdateOrder(dto));
        return CommonResult.success(jsonObject);
    }

    @PostMapping("/cancel/order")
    @ApiOperation("取消订单")
    public CommonResult cancelOrder(@RequestParam Long id, @RequestParam(required = false) String cancelReason) {
        service.cancelOrder(id, cancelReason);
        return CommonResult.success();
    }

    @PostMapping("/cancel/refund/order")
    @ApiOperation("已退款订单取消")
    public CommonResult cancelRefundOrder(@RequestParam Long id, @RequestParam(required = false) String cancelReason) {
        service.cancelRefundOrder(id, cancelReason);
        return CommonResult.success();
    }


    @GetMapping("/print")
    @ApiOperation("根据订单id打印小票")
    public CommonResult print(@RequestParam Long id) {
        service.printById(id);
        return CommonResult.success();
    }

    @GetMapping("/info")
    @ApiOperation("订单详情-根据订单id查询")
    public CommonResult orderDetail(@RequestParam Long id) {
        return CommonResult.success(service.orderDetail(id));
    }

    @GetMapping("/pageWithDetail")
    @ApiOperation("分页带详情")
    public CommonResult pageWithDetail(@RequestParam Map<String, Object> params) {
        return CommonResult.success(service.pageWithDetail(params));
    }

    @GetMapping("/infoWithDetail")
    @ApiOperation("订单带详情")
    public CommonResult infoWithDetail(@RequestParam Long id) {
        return CommonResult.success(service.infoWithDetail(id));
    }
    @GetMapping("/infoWithDetailOrSendInfo")
    @ApiOperation("获取产品订单详情以赠送人详情")
    public CommonResult infoWithDetailOrSendInfo(@RequestParam Long id) {
        return CommonResult.success(service.infoWithDetailOrSendInfo(id));
    }

    @GetMapping("/timeListlx")
    @ApiOperation("获取到店时间列表")
    public CommonResult timeListlx(@RequestParam String date, @RequestParam Integer personCount, @RequestParam Long projectId, @RequestParam Integer durationMinutes, Long shopId, Long massagistId) {
        //return CommonResult.success(service.findArriveTimeList(date, personCount, projectId, durationMinutes, shopId, massagistId));//有验证的返回时间
        return CommonResult.success(service.findArriveTimeList0410(date, personCount, projectId, durationMinutes, shopId, massagistId));//无验证的返回时间
    }

    @GetMapping("/timeList")
    @ApiOperation("获取到店时间列表")
    public CommonResult timeList(@RequestParam String date, @RequestParam Integer personCount, @RequestParam Long projectId, @RequestParam Integer durationMinutes, Long shopId, Long massagistId) {
        return CommonResult.success(service.findArriveTimeList(date, personCount, projectId, durationMinutes, shopId, massagistId, curCustomerId()));//有验证的返回时间
    }

    @GetMapping("/timeListEdit")
    @ApiOperation("获取到店时间列表,编辑的时候用")
    public CommonResult timeListEdit(@RequestParam String date, @RequestParam Integer personCount, @RequestParam Long projectId, @RequestParam Integer durationMinutes, Long shopId, Long orderId, Long massagistId) {
        //return CommonResult.success(service.findArriveTimeListEdit(date, personCount, projectId, durationMinutes, shopId, orderId, massagistId));//有验证的返回时间
        return CommonResult.success(service.findArriveTimeListEdit0410(date, personCount, projectId, durationMinutes, shopId, orderId, massagistId));//无验证的返回时间
    }

    @GetMapping("/massagistList")
    @ApiOperation("获取空闲疗愈师列表")
    public CommonResult findAvailableMassagistList(@RequestParam String dateTime, @RequestParam Integer personCount, @RequestParam Integer durationMinutes, @RequestParam Long shopId,
                                                   @RequestParam(required = false) String phone) {
        LocalDateTime startTime = DateUtil.string2DateTime(dateTime);
        return CommonResult.success(service.findAvailableMassagistList(shopId, startTime, durationMinutes, personCount, phone));
    }

    @GetMapping("/massagistListNew")
    @ApiOperation("获取空闲疗愈师列表")
    public CommonResult findAvailableMassagistListNew(@RequestParam String dateTime, @RequestParam Integer personCount, @RequestParam Integer durationMinutes, @RequestParam Long shopId, @RequestParam Integer projectId,
                                                      @RequestParam(required = false) String phone) {
        LocalDateTime startTime = DateUtil.string2DateTime(dateTime);
        return CommonResult.success(service.findAvailableMassagistListNew(shopId, startTime, durationMinutes, personCount,projectId, phone));
    }
    @GetMapping("/massagistListNewLx")
    @ApiOperation("获取接待空闲疗愈师列表")
    public CommonResult findAvailableMassagistListNew0418(@RequestParam String dateTime, @RequestParam Integer personCount, @RequestParam Integer durationMinutes, @RequestParam Long shopId, @RequestParam Integer projectId,
                                                          @RequestParam(required = false) String phone) {
        LocalDateTime startTime = DateUtil.string2DateTime(dateTime);
        return CommonResult.success(service.findAvailableMassagistListNew(shopId, startTime, durationMinutes, personCount,projectId, phone));
    }

    @GetMapping("/bedList")
    @ApiOperation("获取床位列表(带空闲状态)")
    public CommonResult findAvailableMassagistList(@RequestParam String dateTime, @RequestParam Long projectId, @RequestParam Integer durationMinutes, @RequestParam Long shopId) {
        LocalDateTime startTime = DateUtil.string2DateTime(dateTime);
        return CommonResult.success(service.findAvailableBedList(shopId, startTime, durationMinutes, projectId));
    }

    @GetMapping("/checkout")
    public CommonResult getOrderCheckoutData(@RequestParam Long orderId) {
        Long customerId = curCustomerId();
        CheckoutData checkoutData = service.getCheckoutData(customerId, orderId);
        return CommonResult.success(checkoutData);
    }

    @GetMapping("/price/options")
    @ApiOperation("结算优惠方案（年卡/通用折扣/积分/Full愈券）")
    public CommonResult priceOptions(@RequestParam Long orderId) {
        Long customerId = curCustomerId();
        CheckoutData checkoutData = service.getCheckoutData(customerId, orderId);
        return CommonResult.success(checkoutData);
    }

    @PostMapping("/price/select")
    @ApiOperation("切换优惠方案")
    public CommonResult selectPriceSource(@RequestParam Long orderId, @RequestParam Integer priceSource) {
        Long customerId = curCustomerId();
        return CommonResult.success(service.selectPriceSource(customerId, orderId, priceSource));
    }

    @PostMapping("/pay/checkout")
    public CommonResult payCheckout(@RequestParam Long orderId, @RequestParam Integer payType) {
        Long customerId = curCustomerId();
        service.payCheckout(customerId, orderId, payType);
        return CommonResult.success();
    }

    @GetMapping("/check/paid")
    public CommonResult checkOrderPaid(@RequestParam String orderSn) {
        Long customerId = curCustomerId();
        boolean isPaid = service.checkPaid(customerId, orderSn);
        return CommonResult.success(isPaid);
    }

    @GetMapping("/get/page")
    @ApiOperation("分页查询")
    public CommonResult getPage(@RequestParam Map<String, Object> params) {
        params.put("customerId", curCustomerId());
        return CommonResult.success(service.pageWithDetail(params));
    }

    @GetMapping("/infoWithGift")
    @ApiOperation("订单带礼物详情")
    public CommonResult infoWithGift(@RequestParam Long id) {
        return CommonResult.success(service.infoWithGift(id));
    }

    @GetMapping("/booking/dates")
    @ApiOperation("获取预约到店日期时间")
    public CommonResult findBookingDates(@RequestParam(required = false, defaultValue = "4") Integer maxCount,
                                         @RequestParam(required = false) String yyyyMMdd,
                                         @RequestParam(required = false) Integer isPc,
                                         @RequestParam(required = false, defaultValue = "1") Long shopId) {
        if (isPc != null && isPc == 1) {
            return CommonResult.success(massagistSchedulesService.findBookingDatesForPc(maxCount, yyyyMMdd, shopId));
        } else {
            return CommonResult.success(massagistSchedulesService.findBookingDates(maxCount, shopId));
        }
    }

    @GetMapping("/booking/datesNew")
    @ApiOperation("获取预约到店日期时间，luxin新增")
    public CommonResult findBookingDatesNew(@RequestParam(required = false, defaultValue = "4") Integer maxCount, @RequestParam(required = false) String yyyyMMdd, Integer isPc,long shopId) {
        if (isPc != null && isPc == 1) {
            return CommonResult.success(massagistSchedulesService.findBookingDatesForPcNew(shopId,maxCount, yyyyMMdd));
        } else {
            return CommonResult.success(massagistSchedulesService.findBookingDates(maxCount,shopId));
        }
    }


    @GetMapping("/payed/info")
    @ApiOperation("获取订单是否已支付")
    public CommonResult payedInfo(@RequestParam String orderCode) {
        return CommonResult.success(service.payedInfo(orderCode));
    }

    @PostMapping("/errorRefundOrder")
    @ApiOperation("退款失败的订单重新发起退款")
    public CommonResult errorRefundOrder(@RequestParam Long orderId) {
        service.errorRefundOrder(orderId);
        return CommonResult.success();
    }

    @PostMapping("/addLabel")
    @ApiOperation("添加订单标签")
    public CommonResult addLabel(@RequestBody AddOrderLabelDto addOrderLabelDto) {
        service.addLabel(addOrderLabelDto);
        return CommonResult.success();
    }

    @PostMapping("/exceCancelOrder")
    @ApiOperation("后台手动建单，取消卡卷支付时执行")
    public CommonResult exceCancelOrder(@RequestParam Long orderId) {
        service.handleTimeout(orderId);
        return CommonResult.success();
    }

    @GetMapping("/sendSMS")
    @ApiOperation("发送取消短信")
    public CommonResult sendSMS(@RequestParam Long orderId) {
        service.sendSMS(orderId);
        return CommonResult.success();
    }

    @ApiOperation("修改发票状态")
    @RequestMapping(value = "/updateOrderInvoiceStatus/{id}", method = RequestMethod.POST)
    @ResponseBody
    public CommonResult updateOrderInvoiceStatus(@PathVariable Long id, @RequestParam(value = "status") Integer status){
      /*  Order order = service.getById(id);
        order.setInvoiceState(status);
        service.updateById(order);*/
        return CommonResult.success(service.updateOrderInvoiceStatus(id, status));
    }

    @PostMapping("/updateCardImage")
    //小程序二次修改会员卡封面
    public CommonResult updateCardImage(@RequestParam Long orderId, @RequestParam String cardSelectUrl) {
        service.updateCardImage(orderId, cardSelectUrl,curCustomerId());
        return CommonResult.success();
    }

    @PostMapping("/shareFriend")
    //会员卡分享
    public CommonResult shareCardFriend(@RequestParam Long orderId, @RequestParam String titleVal) {
        return CommonResult.success(service.shareCardFriend(orderId, titleVal,curCustomerId()));
    }

    @GetMapping("/cancelShareCard")
    @ApiOperation("小程序用户取消分享的组合卷")
    public CommonResult cancelShareCard(long orderId) {
        service.cancelShareCard(curCustomerId(),orderId);
        return CommonResult.success();
    }

    //积分支付订单
    @GetMapping("/jifenPayOrder")
    @ApiOperation("小程序用户积分支付订单")
    public CommonResult jifenPayOrder(long orderId) {
        service.jifenPayOrder(curCustomerId(),orderId);
        return CommonResult.success();
    }

    //积分支付订单
    @GetMapping("/getLastOrderInfo")
    @ApiOperation("小程序获取最后一次订单")
    public CommonResult getLastOrderInfo() {
        return CommonResult.success(service.getLastOrderInfo(curCustomerId()));
    }

    //获取最后一次订单，用户小程序中门店排序
    @GetMapping("/getLastOrderInfoNew")
    @ApiOperation("获取最后一次订单，用户小程序中门店排序")
    public CommonResult getLastOrderInfoNew() {
        return CommonResult.success(service.getLastOrderInfoNew(curCustomerId()));
    }
    //订单分享
    @GetMapping("/shareOrder")
    @ApiOperation("小程序用户分享订单")
    public CommonResult shareOrder(long orderDetailId) {
        return CommonResult.success(service.shareOrder(orderDetailId, curCustomerId()));
    }
    //领取订单分享
    @GetMapping("/receiveOrder")
    @ApiOperation("小程序领取订单分享")
    public CommonResult receiveOrder(long orderDetailId,String shareCode) {
        service.receiveOrder(orderDetailId, curCustomerId(), shareCode);
        return CommonResult.success();
    }

    @GetMapping("/OrderSplit")
    //进行订单拆单
    public CommonResult OrderSplit(long orderId) {
        service.OrderSplit(orderId, curCustomerId());
        return CommonResult.success();
    }

    @GetMapping("/infoWithDetailNew")
    @ApiOperation("订单带详情")
    public CommonResult infoWithDetailNew(@RequestParam Long id) {
        return CommonResult.success(service.infoWithDetailNew(id));
    }

    @GetMapping("/timeListNew")
    @ApiOperation("获取门店空闲的人数和时间段")
    public CommonResult timeListNew(@RequestParam(required = false, defaultValue = "1") Long id, String time) {
        return CommonResult.success(service.timeListNew(id,time));
    }

    //newCustomerZheKou  获取新客折扣
    @GetMapping("/newCustomerZheKou")
    @ApiOperation("获取新客折扣")
    public CommonResult newCustomerZheKou(Long shopId) {
        return CommonResult.success(service.newCustomerZheKou(shopId));
    }
}
