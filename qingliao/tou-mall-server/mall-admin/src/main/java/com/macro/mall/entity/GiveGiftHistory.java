package com.macro.mall.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import com.fasterxml.jackson.databind.annotation.JsonDeserialize;
import com.fasterxml.jackson.databind.annotation.JsonSerialize;
import com.macro.mall.serializer.ArrayStringDeSerializer;
import com.macro.mall.serializer.ArrayStringSerializer;
import io.swagger.annotations.ApiModel;
import io.swagger.annotations.ApiModelProperty;
import lombok.Getter;
import lombok.Setter;

/**
 * 礼物领取记录
 *
 * @author ST
 * @date 2025/06/03
 */
@Getter
@Setter
@TableName("sms_give_gift_history")
@ApiModel(value = "GiveGiftHistory对象", description = "")
public class GiveGiftHistory extends BaseEntity {

    @ApiModelProperty("礼品id")
    private Long giveGiftId;

    @ApiModelProperty("来源客户id")
    private Long fromCustomerId;

    @ApiModelProperty("赠予客户id")
    private Long toCustomerId;

    @ApiModelProperty("客户券json")
    @JsonSerialize(using = ArrayStringSerializer.class, nullsUsing = ArrayStringSerializer.class)
    @JsonDeserialize(using = ArrayStringDeSerializer.class)
    private String content;

}
