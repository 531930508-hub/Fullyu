package com.macro.mall.entity;

import com.baomidou.mybatisplus.annotation.FieldStrategy;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableName;
import com.fasterxml.jackson.databind.annotation.JsonDeserialize;
import com.fasterxml.jackson.databind.annotation.JsonSerialize;
import com.macro.mall.serializer.QiniuUrlDeSerializer;
import com.macro.mall.serializer.QiniuUrlSerializer;
import io.swagger.annotations.ApiModel;
import io.swagger.annotations.ApiModelProperty;
import lombok.Getter;
import lombok.Setter;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.ArrayList;
import java.util.List;

/**
 * @author zkl
 * @date 2025/05/30
 */
@Getter
@Setter
@TableName("s_massagist")
@ApiModel(value = "Massagist对象", description = "疗愈师")
public class Massagist extends BaseEntity {

    @ApiModelProperty("姓名")
    private String name;

    @ApiModelProperty("性别")
    private String sex;

    @ApiModelProperty("手机号")
    private String phone;

    @ApiModelProperty("身份证号")
    private String idCardNumber;

    @ApiModelProperty("头像")
    @JsonSerialize(using = QiniuUrlSerializer.class)
    @JsonDeserialize(using = QiniuUrlDeSerializer.class)
    private String avatarUrl;

    @ApiModelProperty("所属门店")
    private Long shopId;

    /**
     * @see com.macro.mall.enums.JobStatus
     */
    @ApiModelProperty("0离职、1在职、2暂挂")
    private Integer status;

    private String formalMonth;

    @ApiModelProperty("加入日期，用于累计成就起算；为空时回退到最早有效服务日")
    private LocalDate entryDay;

    @ApiModelProperty("擅长项目")
    private String projectArr;
    @TableField(exist = false)
    private int[] projectArrPage;

    @ApiModelProperty("账号id")
    @TableField(updateStrategy = FieldStrategy.ALWAYS)
    private Long umsAdminId;

    @TableField(exist = false)
    private String umsAdminUsername;

    /**
     * 当前是否空闲
     */
    @TableField(exist = false)
    private Integer available;

    /**
     * 排班进度条
     */
    @TableField(exist = false)
    private Integer percentage = 0;

    @TableField(exist = false)
    private List<MassagistSchedules> schedulesList = new ArrayList<>();

    @TableField(exist = false)
    private List<OrderDetail> orderDetailList = new ArrayList<>();

    @ApiModelProperty("排班顺序")
    private Integer sequence = 0;

    /**
     * 排班生效日期yyyy-MM-dd
     */
    private String sequenceEnableDay;

    /**
     * 技师的综合评分
     */
    @TableField(exist = false)
    private BigDecimal averageScore;
    /**
     * 技师的参与评分的人数
     */
    @TableField(exist = false)
    private Integer peopleCount;

    /**
     * 后台建单提示用：当前识别到的客户是否已把该疗愈师设为暂别。
     * 仅作为瞬态标记返回，不落库。
     */
    @TableField(exist = false)
    @ApiModelProperty("当前客户是否已把该疗愈师设为暂别（仅提示，不拦截）")
    private Boolean blockedByCustomer = false;

    /**
     * 店长离职时必须指定同店在职接班人，“店长”身份会转交给该接班人；仅提交时使用，不落库。
     */
    @TableField(exist = false)
    @ApiModelProperty("店长离职接班人疗愈师id（仅提交时使用）")
    private Long successorMassagistId;

    @ApiModelProperty("是否内训师：1是 0否")
    private Integer isTrainer;

    @ApiModelProperty("成为内训师的日期")
    @TableField(updateStrategy = FieldStrategy.ALWAYS)
    private LocalDate trainerSince;

    @TableField(exist = false)
    @ApiModelProperty("是否本店店长（列表派生，不落库）")
    private Boolean shopManager = false;

    /**
     * 提交时：null 表示本次不修改身份（兼容只传 isTrainer 的旧调用方），空数组表示清空。
     */
    @TableField(exist = false)
    @ApiModelProperty("身份编码列表（可多选，落库到 f_massagist_identity）")
    private List<String> identities;

    @TableField(exist = false)
    @ApiModelProperty("后台账号是否可登录（列表派生，不落库）")
    private Boolean trainerAccountReady = false;

    @ApiModelProperty("真实姓名")
    private String realName;

    @ApiModelProperty("身份证")
    private String sfzCard;
    @ApiModelProperty("银行卡")
    private String bankCard;
}
