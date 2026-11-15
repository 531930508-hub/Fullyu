package com.macro.mall.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import com.fasterxml.jackson.annotation.JsonFormat;
import io.swagger.annotations.ApiModel;
import io.swagger.annotations.ApiModelProperty;
import lombok.Getter;
import lombok.Setter;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * 合并支付单：一张微信支付聚合「预约单 + 会员卡续费」，回调后按分单金额各归各的单。
 *
 * <p>为什么要合并：门店单次消费 3.5 折、品牌会员年卡 8 折，两笔钱属于不同结算主体，
 * 拆成两次支付会让用户连续弹两次支付框，合并收款后再按台账分账到门店。</p>
 *
 * @date 2026/12/01
 */
@Getter
@Setter
@TableName("s_pay_group")
@ApiModel(value = "PayGroup对象", description = "合并支付单（预约 + 会员卡续费）")
public class PayGroup extends BaseEntity {

    /** 待支付。 */
    public static final int STATE_UNPAID = 0;
    /** 已支付并完成分单结算。 */
    public static final int STATE_PAID = 1;
    /** 已关闭（超时 / 被新的一笔合并支付替代）。 */
    public static final int STATE_CLOSED = 2;
    /** 已在汇付收到钱，但对应订单/卡单已支付过，需要人工退款。 */
    public static final int STATE_DUPLICATE_PAID = 3;

    /** 无需分账（金额为 0 或开关关闭）。 */
    public static final int SPLIT_NONE = 3;
    /** 待分账。 */
    public static final int SPLIT_PENDING = 0;
    /** 分账成功。 */
    public static final int SPLIT_SUCCESS = 1;
    /** 分账失败，需重试或人工处理。 */
    public static final int SPLIT_FAILED = 2;

    @ApiModelProperty("合并支付流水号（G 开头）")
    private String payNo;

    @ApiModelProperty("客户id")
    private Long customerId;

    @ApiModelProperty("预约单id")
    private Long orderId;

    @ApiModelProperty("预约单编号")
    private String orderCode;

    @ApiModelProperty("会员卡续费单号")
    private String cardOrderSn;

    @ApiModelProperty("预约单金额（元）")
    private BigDecimal orderAmount;

    @ApiModelProperty("会员卡金额（元）")
    private BigDecimal cardAmount;

    @ApiModelProperty("合并支付总额（元）")
    private BigDecimal totalAmount;

    @ApiModelProperty("0待支付 1已支付 2已关闭 3重复支付待退款")
    private Integer state;

    @ApiModelProperty("汇付请求流水号")
    private String merOrdId;

    @ApiModelProperty("汇付全局流水号")
    private String hfSeqId;

    @ApiModelProperty("微信支付单号")
    private String partyOrderId;

    @ApiModelProperty("外部交易号")
    private String outTransId;

    @ApiModelProperty("支付渠道")
    private String payChannel;

    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    @ApiModelProperty("支付时间")
    private LocalDateTime paidTime;

    @ApiModelProperty("分账状态 0待分账 1成功 2失败 3无需分账")
    private Integer splitState;

    @ApiModelProperty("应分给门店的金额（元）")
    private BigDecimal splitAmount;

    @ApiModelProperty("分账请求流水号")
    private String splitPayNo;

    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    @ApiModelProperty("分账时间")
    private LocalDateTime splitTime;

    @ApiModelProperty("分账失败原因")
    private String splitError;

    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    @ApiModelProperty("更新时间")
    private LocalDateTime updateTime;
}