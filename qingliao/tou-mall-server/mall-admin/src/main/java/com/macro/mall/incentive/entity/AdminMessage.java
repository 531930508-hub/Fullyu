package com.macro.mall.incentive.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableName;
import com.fasterxml.jackson.annotation.JsonFormat;
import com.macro.mall.entity.BaseEntity;
import lombok.Getter;
import lombok.Setter;

import java.time.LocalDateTime;

/**
 * 后台站内消息。按 (biz_key, admin_id) 幂等，重复发布不会重复提醒。
 */
@Getter
@Setter
@TableName("n_admin_message")
public class AdminMessage extends BaseEntity {

    public static final String TYPE_SETTLEMENT_DRAFT = "SETTLEMENT_DRAFT";
    public static final String TYPE_SETTLEMENT_CONFIRMED = "SETTLEMENT_CONFIRMED";
    public static final String TYPE_SETTLEMENT_PUBLISHED = "SETTLEMENT_PUBLISHED";

    private String type;

    private String title;

    private String content;

    private String link;

    private Long shopId;

    private String monthCode;

    private Long adminId;

    private String bizKey;

    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime readTime;

    @TableField(value = "update_time", fill = FieldFill.INSERT_UPDATE)
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime updateTime;
}