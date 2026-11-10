package com.macro.mall.entity;

import cn.hutool.core.date.DateTime;
import com.baomidou.mybatisplus.annotation.FieldStrategy;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableName;
import com.fasterxml.jackson.annotation.JsonFormat;
import com.fasterxml.jackson.databind.annotation.JsonSerialize;
import com.macro.mall.enums.OrderState;
import com.macro.mall.enums.ServiceState;
import com.macro.mall.serializer.ArrayStringSerializer;
import io.swagger.annotations.ApiModel;
import io.swagger.annotations.ApiModelProperty;
import lombok.Getter;
import lombok.Setter;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.Date;
import java.util.List;

@Getter
@Setter
@TableName("s_order")
@ApiModel(value = "Order对象", description = "")
public class Order extends BaseEntity {

    @ApiModelProperty("订单编号")
    private String code;

    @ApiModelProperty("用户id")
    private Long customerId;

    @TableField(exist = false)
    private String customerNickname;

    @TableField(exist = false)
    private String customerPhone;

    @ApiModelProperty("产品id")
    private Long productId;

    @ApiModelProperty("订单总金额")
    private BigDecimal totalAmount;

    @ApiModelProperty("应付金额（实际支付金额）")
    private BigDecimal payAmount = BigDecimal.ZERO;

    @ApiModelProperty("（用券数量）")
    private BigDecimal couponAmount = BigDecimal.ZERO;

    @ApiModelProperty("积分抵扣金额")
    private BigDecimal integrationAmount = BigDecimal.ZERO;

    /**
     * @see com.macro.mall.enums.OrderType
     */
    @ApiModelProperty("订单类型：0产品订单，1优惠券订单")
    private Integer type;

    /**
     * @see com.macro.mall.enums.OrderPayType
     */
    @ApiModelProperty("支付方式：0二维码支付，1微信支付，2卡券支付，3美团点评，4现金支付")
    private Integer payType;

    @ApiModelProperty("支付时间")
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime payTime;

    /**
     * 支付状态
     *
     * @see OrderState
     */
    @ApiModelProperty("支付状态：0未付款，1已付款未评价，2已付款已评价，3超时，4取消，5退款中，6已退款,7退款审批中")
    private Integer state = OrderState.NOT_PAY.getValue();

    /**
     * @see com.macro.mall.enums.AppointmentType
     */
    @ApiModelProperty("预约类型：1Agent预约，2手动预约")
    private Integer appointmentType;

    /**
     * 预约状态
     *
     * @see ServiceState
     */
    @ApiModelProperty("订单状态：0未开始，1进行中，2已完成，3已取消")
    private Integer appointmentState = ServiceState.WAITING.getValue();

    @ApiModelProperty("订单备注")
    private String comment;

    @ApiModelProperty("取消原因")
    private String cancelReason;

    @ApiModelProperty("门店id")
    private Long shopId;
    // 外部订单号
    private String outTransId;
    private String partyOrderId;
    // 全局流水号
    private String hfSeqId;
    // 请求流水号
    private String merOrdId;

    private BigDecimal hasRefundAmount;
    // 失败原因
    private String refundErrMsg;

    /**
     * @see com.macro.mall.enums.RefundState
     */
    // 1 成功 -1 失败  0 进行中
    private Integer refundState;

    private String refundHfSeqId;

    /**
     * json 券包使用记录
     */
    private String useCouponMap;

    @ApiModelProperty("购买时快照：预付券包实际用完后赠会员月数，0不赠")
    private Integer rewardMemberMonths = 0;

    private Boolean isGift;

    private Integer quantity;

    /**
     * @see com.macro.mall.pay.PayChannel
     */
    private String payChannel;

    /**
     * 订单过期时间（秒）
     */
    private Integer overTimeSeconds;

    @ApiModelProperty("取消订单类型：0用户取消，1超时取消，2管理员取消")
    private Integer cancelOrderType;

    @ApiModelProperty("精油")
    @TableField(updateStrategy = FieldStrategy.ALWAYS)
    private String oil;

    @ApiModelProperty("部位")
    @JsonSerialize(using = ArrayStringSerializer.class, nullsUsing = ArrayStringSerializer.class)
    @TableField(updateStrategy = FieldStrategy.ALWAYS)
    private String parts;

    @ApiModelProperty("服务时长")
    @TableField(exist = false)
    private Integer duration;

    @ApiModelProperty("预计开始时间(预约时间)")
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    @TableField(exist = false)
    private LocalDateTime startTime;
    @ApiModelProperty("预计结束时间")
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    @TableField(exist = false)
    private LocalDateTime endTime;

    @TableField(exist = false)
    private List<OrderDetail> orderDetailList;
    @TableField(exist = false)
    private List<CustomerCoupon> customerCouponList;

    @ApiModelProperty("项目名称")
    private String productTitle;

    @ApiModelProperty("券包礼物")
    @TableField(exist = false)
    private GiveGift gift;

    @ApiModelProperty("美团点评券号")
    private String couponCode;

    @ApiModelProperty("券金额")
    @TableField(exist = false)
    private BigDecimal couponPayAmount = BigDecimal.ZERO;

    @ApiModelProperty("折扣")
    private Integer discount;

    @ApiModelProperty("折扣类型")
    private Integer discountType;

    @ApiModelProperty("领取礼物的客户")
    @TableField(exist = false)
    private Customer toCustomer;

    @ApiModelProperty("开票状态，0未开票，1已开票")
    private Integer invoiceState;

    @ApiModelProperty("会员卡选择的封面")
    private String cardimage;

    // 根据最小值 判断是否用积分支付 luxin20260903
    private Integer useIntegrationState;


    private long prentOrderId;

    @TableField(exist = false)
    private String useUserMobile;

    @TableField(exist = false)
    private LocalDateTime useUserTime;

    @ApiModelProperty("优惠来源 1年卡提前价 2年卡当日价 3通用折扣 4积分 5Full愈券")
    private Integer priceSource;

    @ApiModelProperty("本单使用的年卡权益期")
    private Long memberCardId;

    @ApiModelProperty("本单使用的年卡费率快照")
    private BigDecimal memberRate;

    @ApiModelProperty("本单优惠金额")
    private BigDecimal benefitAmount;

}
