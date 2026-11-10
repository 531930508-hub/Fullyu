package com.macro.mall.dto;

import com.macro.mall.enums.OrderPayType;
import com.macro.mall.enums.OrderType;
import io.swagger.annotations.ApiModelProperty;
import lombok.Data;

import javax.validation.constraints.Min;
import javax.validation.constraints.NotBlank;
import javax.validation.constraints.NotNull;
import javax.validation.constraints.Pattern;
import java.util.List;

/**
 * @author zkl on 2025/6/18
 */
@Data
public class AppointmentParam {
    private Long shopId = 1L;

    private String phone;

    private Integer gender;//客户性别

    private String comment;//客户称呼

    private String note;//客户备注

    private Long productId;

    private Integer personCount = 1;

    @NotNull(message = "时长选择不允许为空")
    private Integer durationMinutes;

    @NotBlank(message = "到店日期不允许为空")
    @Pattern(regexp = "^\\d{4}-\\d{2}-\\d{2}$", message = "日期格式出现问题，不允许提交")
    private String date;

    @NotBlank(message = "到店时间不允许为空")
    @Pattern(regexp = "^([01]?[0-9]|2[0-3]):[0-5][0-9]$", message = "时间格式出现问题，不允许提交")
    private String time;

    @ApiModelProperty("指定疗愈师id列表")
    private List<Long> massagistIdList;

    @ApiModelProperty("指定床位id列表")
    private List<Long> bedIdList;

    /**
     * @see com.macro.mall.enums.OrderPayType
     */
    @ApiModelProperty("支付方式：0二维码支付，1微信支付，2卡券支付，3美团点评，4现金支付")
    private Integer payType = OrderPayType.QR_CODE.getValue();

    //是否更新排班
    private Boolean isUpdateSort = true;

    @ApiModelProperty("项目标题")
    private String projectTitle;

    private Long projectId;

    @ApiModelProperty("订单类型：0产品订单，1优惠券订单")
    private Integer type = OrderType.PRODUCT.getValue();

    //1标识加钟，0标识新建
    private Integer addType = 0;
}
