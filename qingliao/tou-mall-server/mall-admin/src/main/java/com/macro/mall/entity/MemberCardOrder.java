package com.macro.mall.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableName;
import com.fasterxml.jackson.annotation.JsonFormat;
import io.swagger.annotations.ApiModel;
import io.swagger.annotations.ApiModelProperty;
import lombok.Getter;
import lombok.Setter;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * 会员卡开卡支付单。
 *
 * @date 2026/11/07
 */
@Getter
@Setter
@TableName("c_member_card_order")
@ApiModel(value = "MemberCardOrder对象", description = "会员卡开卡支付单")
public class MemberCardOrder extends BaseEntity {

    public static final int STATE_UNPAID = 0;
    public static final int STATE_PAID = 1;
    public static final int STATE_CLOSED = 2;
    public static final int STATE_REFUNDED = 3;
    /** 已收到支付但 CRM 开卡失败，需人工核对，不可再次发起支付。 */
    public static final int STATE_PAID_PENDING = 4;

    @ApiModelProperty("订单号")
    private String orderSn;

    @ApiModelProperty("客户id")
    private Long customerId;

    @ApiModelProperty("配置id")
    private Long configId;

    @ApiModelProperty("卡类型 month月卡 year年卡 custom自定义")
    private String cardType;

    @ApiModelProperty("称呼")
    private String contactName;

    @ApiModelProperty("1男 2女")
    private Integer contactGender;

    @ApiModelProperty("微信号")
    private String contactWechat;

    @ApiModelProperty("生日")
    private java.time.LocalDate contactBirthday;

    @ApiModelProperty("1希望加入会员社群")
    private Integer joinGroup;

    @ApiModelProperty("权益期id")
    private Long cardId;

    @ApiModelProperty("金额")
    private BigDecimal amount;

    @ApiModelProperty("CRM 产品编码 FY_MONTH/FY_ANNUAL")
    private String productCode;

    @ApiModelProperty("CRM 报价单号，30 分钟有效")
    private String quoteId;

    @ApiModelProperty("CRM 开卡记录 id")
    private String crmCardId;

    @ApiModelProperty("实付金额（分）")
    private Integer paidCents;

    @ApiModelProperty("支付渠道 WX_MINI")
    private String payChannel;

    @ApiModelProperty("汇付请求单号")
    private String merOrdId;

    @ApiModelProperty("汇付支付全局流水号（原支付，退款时作为 org_hf_seq_id）")
    private String hfSeqId;

    @ApiModelProperty("汇付退款流水号")
    private String refundHfSeqId;

    @ApiModelProperty("微信侧支付单号")
    private String partyOrderId;

    @ApiModelProperty("微信侧交易号")
    private String outTransId;

    @ApiModelProperty("WITHIN_7D 7天内扣年卡礼 / AFTER_7D 扣已省与年卡礼 / PRORATED 旧口径")
    private String refundType;

    @ApiModelProperty("退款时已优惠金额（分）")
    private Integer usedBenefitCents;

    @ApiModelProperty("应退金额（分）")
    private Integer refundCents;

    @ApiModelProperty("CRM 开卡/退款幂等键")
    private String idempotencyKey;

    @ApiModelProperty("NONE/PENDING/SUCCESS/FAILED")
    private String refundState = "NONE";

    @ApiModelProperty("CRM 卡是否已撤销")
    private Integer crmRefunded = 0;

    @ApiModelProperty("退款原因")
    private String refundReason;

    @ApiModelProperty("后台操作人，小程序自助退款为空")
    private Long refundOperatorId;

    @ApiModelProperty("支付成功但开卡失败原因，便于后台核对")
    private String payError;

    @ApiModelProperty("0待支付 1已支付 2已关闭 3已退款")
    private Integer state;

    @ApiModelProperty("支付方式")
    private Integer payType;

    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    @ApiModelProperty("支付时间")
    private LocalDateTime payTime;

    @ApiModelProperty("退款金额")
    private BigDecimal refundAmount;

    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    @ApiModelProperty("退款时间")
    private LocalDateTime refundTime;

    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    @TableField(value = "update_time", fill = FieldFill.UPDATE)
    @ApiModelProperty(hidden = true)
    private LocalDateTime updateTime;
}
