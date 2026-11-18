package com.macro.mall.dto;

import io.swagger.annotations.ApiModelProperty;
import lombok.Data;

/**
 * 小程序埋点上报体，时间字段为客户端毫秒时间戳。
 * 对应 apps/miniprogram/utils/tracking.js 的 report 结构。
 */
@Data
public class PageEventDTO {

    @ApiModelProperty("一次冷启动为一个会话")
    private String sessionId;

    @ApiModelProperty("页面路径")
    private String pagePath;

    @ApiModelProperty("页面标题")
    private String pageTitle;

    @ApiModelProperty("上一页")
    private String fromPage;

    @ApiModelProperty("微信场景值")
    private String scene;

    @ApiModelProperty("进入页面时间（毫秒）")
    private Long enterTime;

    @ApiModelProperty("离开页面时间（毫秒）")
    private Long leaveTime;

    @ApiModelProperty("停留时长（毫秒）")
    private Long stayDuration;

    @ApiModelProperty("小程序版本号")
    private String appVersion;

    @ApiModelProperty("设备信息 JSON 字符串")
    private String deviceInfo;

    @ApiModelProperty("客户端创建时间（毫秒）")
    private Long createTime;
}
