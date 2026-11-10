package com.macro.mall.dto;

import com.fasterxml.jackson.annotation.JsonFormat;
import com.macro.mall.entity.OrderDetail;
import com.macro.mall.enums.OrderPayType;
import com.macro.mall.enums.OrderType;
import io.swagger.annotations.ApiModelProperty;
import lombok.Getter;
import lombok.Setter;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

@Getter
@Setter
public class OrderDetailDto {

    @ApiModelProperty("客户id")
    private Long customerId;

    @ApiModelProperty("项目id")
    private Long productId;

    @ApiModelProperty("订单类型：0产品订单，1优惠券订单")
    private Integer type = OrderType.PRODUCT.getValue();

    @ApiModelProperty("订单总金额")
    private BigDecimal totalAmount;

    @ApiModelProperty("使用优惠券张数")
    private Integer couponSize = 0;

    @ApiModelProperty("门店id")
    private Long shopId;

    @ApiModelProperty("服务人员id")
    @Deprecated
    private Long massagistId;

    /**
     * @see com.macro.mall.enums.AppointmentType
     */
    @ApiModelProperty("预约类型：1Agent预约，2手动预约，3电话预约")
    private Integer appointmentType;

    @ApiModelProperty("时长")
    private Integer durationMinutes;

    @ApiModelProperty("同行人数")
    private Integer personCount = 1;

    @ApiModelProperty("指定床位id")
    private Long bedId;

    @ApiModelProperty("预计到店时间")
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime startTime;

    @ApiModelProperty("备注")
    private String comment;

    @ApiModelProperty("订单id")
    private Long orderId;

    @ApiModelProperty("指定疗愈师id列表")
    private List<Long> massagistIdList = new ArrayList<>();

    @ApiModelProperty("指定床位id列表")
    private List<Long> bedIdList = new ArrayList<>();

    private Boolean isGift = false; // 是否赠券订单

    private Integer quantity = 1;

    private Boolean isUseIntegration = true; // 是否使用积分

    private List<OrderDetail> oldOrderDetails; // 老订单详情数据

    /**
     * @see com.macro.mall.enums.OrderPayType
     */
    @ApiModelProperty("支付方式：0二维码支付，1微信支付，2卡券支付，3美团点评，4现金支付")
    private Integer payType = OrderPayType.QR_CODE.getValue();

    //是否更新排班
    private Boolean isUpdateSort = true;

    //会员卡选择的封面
    private String cardimage;

    private  Integer addType;
}
