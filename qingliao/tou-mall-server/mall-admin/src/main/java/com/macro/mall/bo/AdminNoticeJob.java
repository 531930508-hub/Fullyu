package com.macro.mall.bo;

import lombok.Data;
import java.util.Map;

/** 已占用并待发送的一次审批提醒任务；只包含该处理人自己的绑定openid。 */
@Data
public class AdminNoticeJob {
    private Long noticeId;
    private Long adminId;
    private Long approvalId;
    /** 审批节点 id：微信消息深链页面直接对该节点同意/拒绝。 */
    private Long detailId;
    private String kind;
    private Integer approvalState;
    private int attemptNo;
    private String openId;
    private String templateId;
    /** 模板字段候选值：title/status/code/person/time/remark。 */
    private Map<String,String> context;
}