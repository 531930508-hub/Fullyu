package com.macro.mall.service;

import com.macro.mall.common.exception.BusinessException;
import com.macro.mall.config.wx.WxMaProperties;
import com.macro.mall.consts.NormalConst;
import com.macro.mall.consts.RedisKey;
import com.macro.mall.consts.WxMpTemplateConst;
import com.macro.mall.security.util.SpringUtil;
import lombok.extern.slf4j.Slf4j;
import me.chanjar.weixin.common.error.WxErrorException;
import me.chanjar.weixin.mp.api.WxMpService;
import me.chanjar.weixin.mp.bean.template.WxMpTemplateData;
import me.chanjar.weixin.mp.bean.template.WxMpTemplateMessage;
import org.apache.logging.log4j.util.Strings;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Lazy;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * @author HeDaJiang
 * @date 2025/7/8
 */
@Service
@Slf4j
public class WxMpTemplateMessageService {
    @Autowired
    WxMpService wxMpService;
    @Autowired
    @Lazy
    OrderDetailService orderDetailService;
    @Autowired
    @Lazy
    CustomerService customerService;
    @Autowired
    @Lazy
    CustomerWxService customerWxService;

    private void send(Long customerId, String templateId, List<WxMpTemplateData> data, String miniProgramAppId, String miniProgramPath) throws WxErrorException {
        String toUserOpenId = getToUserOpenId(customerId);
        WxMpTemplateMessage message = new WxMpTemplateMessage();
        message.setToUser(toUserOpenId);
        message.setTemplateId(templateId);
        if (Strings.isNotBlank(miniProgramPath)) {
            WxMpTemplateMessage.MiniProgram miniProgram = new WxMpTemplateMessage.MiniProgram();
            miniProgram.setAppid(miniProgramAppId);
            miniProgram.setPagePath(miniProgramPath);
            message.setMiniProgram(miniProgram);
        }
        message.setData(data);
        wxMpService.getTemplateMsgService().sendTemplateMsg(message);
    }

    private String getToUserOpenId(Long customerId) {
        return customerWxService.findMpOpenIdByCustomerId(customerId);
    }

    private List<WxMpTemplateData> map2data(Map<String, String> map) {
        List<WxMpTemplateData> data = new ArrayList<>();
        map.forEach((k, v) -> data.add(new WxMpTemplateData(k, v)));
        return data;
    }

    private String getWxMaAppid() {
        WxMaProperties wxMaProperties = SpringUtil.getBean(WxMaProperties.class);
        WxMaProperties.Config first = wxMaProperties.getConfigs().get(0);
        return first.getAppid();
    }

    /**
     * 订单完成通知
     *
     * @param map
     * @param customerId
     */
    @Async("ppzAsync")
    public void handleOrderFinishNotice(Map<String, String> map, Long customerId) {
        try {
            send(customerId, WxMpTemplateConst.ORDER_FINISH, map2data(map), getWxMaAppid(), WxMpTemplateConst.MINI_INDEX_PAGE);
            log.info("订单完成通知推送成功,customerId={}", customerId);
        } catch (Exception e) {
            log.error("订单完成通知推送失败,msg={}", e.getMessage());
            e.printStackTrace();
        }
    }

    /**
     * 预约开始通知
     *
     * @param map
     * @param customerId
     */
    @Async("ppzAsync")
    public void handleBookingStartNotice(Map<String, String> map, Long customerId) {
        try {
            send(customerId, WxMpTemplateConst.BOOKING_START, map2data(map), getWxMaAppid(), WxMpTemplateConst.MINI_INDEX_PAGE);
            log.info("预约开始通知推送成功,customerId={}", customerId);
        } catch (Exception e) {
            log.error("预约开始通知推送失败,msg={}", e.getMessage());
            e.printStackTrace();
        }
    }

    /**
     * 预约成功通知
     *
     * @param map
     * @param customerId
     */
    @Async("ppzAsync")
    public void handleBookingSuccessNotice(Map<String, String> map, Long customerId) {
        try {
            send(customerId, WxMpTemplateConst.BOOKING_SUCCESS, map2data(map), getWxMaAppid(), WxMpTemplateConst.MINI_INDEX_PAGE);
            log.info("预约成功通知推送成功,customerId={}", customerId);
        } catch (Exception e) {
            log.error("预约成功通知推送失败,msg={}", e.getMessage());
            e.printStackTrace();
        }
    }

    /**
     * 预约取消通知
     *
     * @param map
     * @param customerId
     */
    @Async("ppzAsync")
    public void handleBookingCancelNotice(Map<String, String> map, Long customerId) {
        try {
            send(customerId, WxMpTemplateConst.BOOKING_CANCEL, map2data(map), getWxMaAppid(), WxMpTemplateConst.MINI_INDEX_PAGE);
            log.info("预约取消通知推送成功,customerId={}", customerId);
        } catch (Exception e) {
            log.error("预约取消通知推送失败,msg={}", e.getMessage());
            e.printStackTrace();
        }
    }

    /**
     * 送券过期通知
     *
     * @param map
     * @param customerId
     */
    public void handleSendCouponExpiredNotice(Map<String, String> map, Long customerId) {
        try {
            send(customerId, WxMpTemplateConst.SEND_COUPON_EXPIRED, map2data(map), getWxMaAppid(), WxMpTemplateConst.MINI_INDEX_PAGE);
            log.info("送券过期通知推送成功,customerId={}", customerId);
        } catch (Exception e) {
            log.error("送券过期通知推送失败,msg={}", e.getMessage());
            e.printStackTrace();
        }
    }

    /**
     * 会员权益通知
     *
     * @param map
     * @param customerId
     */
    public void handleMembershipRightsNotice(Map<String, String> map, Long customerId) {
        try {
            send(customerId, WxMpTemplateConst.MEMBERSHIP_RIGHTS, map2data(map), getWxMaAppid(), WxMpTemplateConst.MINI_INDEX_PAGE);
            log.info("会员权益通知推送成功,customerId={}", customerId);
        } catch (Exception e) {
            log.error("会员权益通知推送失败,msg={}", e.getMessage());
            e.printStackTrace();
        }
    }

    /**
     * 积分变动通知
     *
     * @param map
     * @param customerId
     */
    public void handleChangeIntegrationNotice(Map<String, String> map, Long customerId) {
        try {
            send(customerId, WxMpTemplateConst.CHANGE_INTEGRATION, map2data(map), getWxMaAppid(), WxMpTemplateConst.MINI_INDEX_PAGE);
            log.info("积分变动通知推送成功,customerId={}", customerId);
        } catch (Exception e) {
            log.error("积分变动通知推送失败,msg={}", e.getMessage());
            e.printStackTrace();
        }
    }

}
