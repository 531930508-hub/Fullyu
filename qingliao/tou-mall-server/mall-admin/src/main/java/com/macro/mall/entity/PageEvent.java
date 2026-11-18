package com.macro.mall.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import com.fasterxml.jackson.annotation.JsonFormat;
import io.swagger.annotations.ApiModel;
import io.swagger.annotations.ApiModelProperty;
import lombok.Getter;
import lombok.Setter;

import java.time.LocalDateTime;

/**
 * 小程序页面埋点：一条记录 = 某个顾客在某页面的一次停留。
 *
 * <p>由小程序 utils/tracking.js 在页面 onHide/onUnload 时上报。
 * 未登录也会上报，此时 customerId 为空，靠 sessionId 归组。</p>
 *
 * @author fullyu
 * @date 2026/11/18
 */
@Getter
@Setter
@TableName("n_page_event")
@ApiModel(value = "PageEvent对象", description = "小程序页面停留埋点")
public class PageEvent extends BaseEntity {

    @ApiModelProperty("顾客id，未登录为空")
    private Long customerId;

    @ApiModelProperty("一次冷启动为一个会话")
    private String sessionId;

    @ApiModelProperty("页面路径，如 pages/index/index")
    private String pagePath;

    @ApiModelProperty("页面标题")
    private String pageTitle;

    @ApiModelProperty("上一页；直接进入时为空")
    private String fromPage;

    @ApiModelProperty("微信场景值，如 1001/1089")
    private String scene;

    @ApiModelProperty("进入页面时间")
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime enterTime;

    @ApiModelProperty("离开页面时间")
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime leaveTime;

    @ApiModelProperty("停留时长（毫秒）")
    private Integer stayDuration;

    @ApiModelProperty("小程序版本号")
    private String appVersion;

    @ApiModelProperty("设备信息 JSON")
    private String deviceInfo;
}
