package com.macro.mall.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableName;
import com.fasterxml.jackson.annotation.JsonFormat;
import com.fasterxml.jackson.databind.annotation.JsonDeserialize;
import com.fasterxml.jackson.databind.annotation.JsonSerialize;
import com.macro.mall.serializer.QiniuUrlDeSerializer;
import com.macro.mall.serializer.QiniuUrlSerializer;
import io.swagger.annotations.ApiModel;
import io.swagger.annotations.ApiModelProperty;
import lombok.Getter;
import lombok.Setter;
import org.apache.logging.log4j.util.Strings;

import java.time.LocalDateTime;
import java.util.List;

/**
 * 客户
 *
 * @author ST
 * @date 2025/06/04
 */
@Getter
@Setter
@TableName("c_customer")
@ApiModel(value = "Customer对象", description = "")
public class Customer extends BaseEntity {

    @ApiModelProperty("昵称")
    private String nickname;

    @ApiModelProperty("头像")
    @JsonSerialize(using = QiniuUrlSerializer.class)
    @JsonDeserialize(using = QiniuUrlDeSerializer.class)
    private String avatar;

    @ApiModelProperty("自己的邀请码")
    private String invitationCode;

    @ApiModelProperty("自己的小程序邀请码图片")
    private String invitationQrImage;

    @ApiModelProperty("推荐人id")
    private Long referrerCustomerId;

    @ApiModelProperty("推荐人昵称")
    @TableField(exist = false)
    private String referrerCustomerName;

    @ApiModelProperty("客人第几次来店里")
    @TableField(exist = false)
    private Long orderCount = 1L;

    @ApiModelProperty("手机号")
    private String phone;

    @ApiModelProperty("积分")//字段已弃用，只用来前台显示
    @Deprecated
    private Long integration;
    private String openId;

    private Integer gender;
    private String comment;
    private String note;

    @ApiModelProperty("1禁止购买品牌会员（连续两次 7 天内无理由退款）")
    private Integer brandCardLocked;

    @ApiModelProperty("锁定原因")
    private String brandCardLockReason;

    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    @ApiModelProperty("锁定时间")
    private LocalDateTime brandCardLockedAt;


    @TableField(exist = false)
    @ApiModelProperty("券数")
    private Integer couponCount = 0;

    @TableField(exist = false)
    @ApiModelProperty("vip等级")
    private String vipLevel;

    public String getInvitationQrImage() {
        if (Strings.isNotBlank(invitationQrImage) && !invitationQrImage.startsWith("https://fullytherapy")) {
            return "https://fullytherapy.oss-cn-hangzhou.aliyuncs.com/" + invitationQrImage;
        }
        return invitationQrImage;
    }

    @TableField(exist = false)
    @ApiModelProperty("客户标签")
    private List<CustomerTag> customerTagList;

    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    @TableField(value = "update_time", fill = FieldFill.INSERT)
    private LocalDateTime updateTime;
}
