package com.macro.mall.service;

import cn.binarywang.wx.miniapp.api.WxMaLinkService;
import cn.binarywang.wx.miniapp.api.WxMaService;
import cn.binarywang.wx.miniapp.api.WxMaUserService;
import cn.binarywang.wx.miniapp.bean.WxMaJscode2SessionResult;
import cn.binarywang.wx.miniapp.bean.WxMaPhoneNumberInfo;
import cn.binarywang.wx.miniapp.bean.WxMaUserInfo;
import cn.binarywang.wx.miniapp.bean.urllink.GenerateUrlLinkRequest;
import cn.binarywang.wx.miniapp.bean.urllink.request.QueryUrlLinkRequest;
import cn.binarywang.wx.miniapp.bean.urllink.response.QueryUrlLinkResponse;
import com.alibaba.fastjson2.JSONObject;
import com.macro.mall.common.exception.ApiException;
import com.macro.mall.common.exception.BusinessException;
import com.macro.mall.config.wx.WxMaConfiguration;
import com.macro.mall.utils.RedisUtil;
import com.macro.mall.utils.RequestUtil;
import lombok.extern.slf4j.Slf4j;
import me.chanjar.weixin.common.bean.oauth2.WxOAuth2AccessToken;
import me.chanjar.weixin.common.service.WxOAuth2Service;
import me.chanjar.weixin.mp.api.WxMpService;
import me.chanjar.weixin.mp.api.WxMpUserService;
import me.chanjar.weixin.mp.bean.result.WxMpUser;
import me.chanjar.weixin.mp.bean.result.WxMpUserList;
import org.apache.logging.log4j.util.Strings;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.RequestParam;

import javax.servlet.http.HttpServletResponse;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.*;
import java.util.concurrent.locks.ReentrantLock;

@Service
@Slf4j
public class WxMiniService implements RequestUtil {
    @Autowired
    CustomerWxService customerWxService;
    @Autowired
    WxMpService wxService;

    @Value("${spring.profiles.active}")
    String active;
    @Autowired
    RedisUtil redisUtil;

    public Map<String, String> getOpenId(String wxCode,
                                         @RequestParam(required = false) String signature,
                                         @RequestParam(required = false) String rawData,
                                         @RequestParam(required = false) String encryptedData,
                                         @RequestParam(required = false) String iv) {
        final WxMaService wxService = WxMaConfiguration.getMaService();
        try {
            WxMaUserService userService = wxService.getUserService();
            WxMaJscode2SessionResult session = userService.getSessionInfo(wxCode);
            String openId = session.getOpenid();
            String unionId = session.getUnionid();
            customerWxService.addByMa(unionId, openId);
            return Collections.singletonMap("openId", openId);
        } catch (Exception e) {
            throw new BusinessException("获取openId失败");
        }
    }

    public Map<String, String> getWapOpenId(String wxCode,
                                            @RequestParam(required = false) String signature,
                                            @RequestParam(required = false) String rawData,
                                            @RequestParam(required = false) String encryptedData,
                                            @RequestParam(required = false) String iv) {
        try {
            WxOAuth2Service oAuth2Service = wxService.getOAuth2Service();
            WxOAuth2AccessToken accessToken = oAuth2Service.getAccessToken(wxCode);
            String openId = accessToken.getOpenId();
            String unionId = accessToken.getUnionId();
            customerWxService.addByMp(unionId, openId);
            return Collections.singletonMap("openId", openId);
        } catch (Exception e) {
            throw new BusinessException("获取wapOpenId失败");
        }
    }

    public WxMaPhoneNumberInfo getPhone(String sessionKey,
                                        String signature,
                                        String rawData,
                                        String code,
                                        String encryptedData,
                                        String iv) {
        if (code == null) {
            log.error("获取手机号，code为空");
            throw new ApiException("获取手机号失败");
        }
        log.error("小程序换手机号，code={},encryptedData={},iv={}", code, encryptedData, iv);
        final WxMaService wxService = WxMaConfiguration.getMaService();
        try {
            WxMaUserService userService = wxService.getUserService();
            WxMaPhoneNumberInfo phoneInfo;
            if (Strings.isNotBlank(encryptedData) && !"null".equals(encryptedData)) {
                log.error("老版本登录，code={},encryptedData={}", code, encryptedData);
                sessionKey = userService.getSessionInfo(code).getSessionKey();
                phoneInfo = userService.getPhoneNoInfo(sessionKey, encryptedData, iv);
            } else {
                log.error("新版本登录，code={}", code);
                phoneInfo = userService.getPhoneNoInfo(code);
            }
            log.error("小程序换手机号，换取结果，code={},encryptedData={},iv={}，phoneInfo={}", code, encryptedData, iv, JSONObject.toJSONString(phoneInfo));
            return phoneInfo;
        } catch (Exception e) {
            log.error("小程序换手机号，执行失败，code={},encryptedData={},iv={},message={}", code, encryptedData, iv, e.getMessage());
            e.printStackTrace();
            throw new ApiException("获取手机号失败");
        }
    }

    public WxMaUserInfo info(String sessionKey,
                             String signature, String rawData, String encryptedData, String iv) {
        final WxMaService wxService = WxMaConfiguration.getMaService();
        if (!wxService.getUserService().checkUserInfo(sessionKey, rawData, signature)) {
            throw new ApiException("user check failed");
        }
        WxMaUserInfo userInfo = wxService.getUserService().getUserInfo(sessionKey, encryptedData, iv);
        return userInfo;
    }

    public String generateShortLink() {
        return generateShortLink("pages/index/index", new HashMap<>());
    }

    public String generateShortLink(String path, Map<String, String> paramMap) {
        if (!StringUtils.hasText(path)) {
            throw new ApiException("生成微信短链失败,地址不能为空");
        }
        String redisKey = "shortLink:" + path;
        String shortLink = redisUtil.getString(redisKey);
        if (StringUtils.hasText(shortLink)) {
            return shortLink;
        }
        final WxMaService wxService = WxMaConfiguration.getMaService();
        try {
            WxMaLinkService wxMaLinkService = wxService.getLinkService();
            GenerateUrlLinkRequest generateUrlLinkRequest = new GenerateUrlLinkRequest();
            generateUrlLinkRequest.setPath(path);
            if (paramMap != null && !paramMap.isEmpty()) {
                StringBuilder queryStringBuilder = new StringBuilder();
                for (Map.Entry<String, String> entry : paramMap.entrySet()) {
                    if (queryStringBuilder.length() > 0) {
                        queryStringBuilder.append("&");
                    }
                    queryStringBuilder.append(entry.getKey())
                            .append("=")
                            .append(entry.getValue());
                }
                generateUrlLinkRequest.setQuery(queryStringBuilder.toString());
            }
            String envVersion = "trial";
            if (active.equals("prod")) {
                envVersion = "release";
            }
            generateUrlLinkRequest.setEnvVersion(envVersion);
            generateUrlLinkRequest.setExpireType(1);
            generateUrlLinkRequest.setExpireInterval(30);
            log.info("生成小程序url link，请求{}", JSONObject.toJSONString(generateUrlLinkRequest));
            String urlLink = wxMaLinkService.generateUrlLink(generateUrlLinkRequest);
            log.info("生成小程序url link，返回{}", urlLink);
            redisUtil.setStringDay(redisKey, urlLink, 7);
            return urlLink;
        } catch (Exception e) {
            log.error("生成微信短链失败, msg={}", e.getMessage());
            throw new ApiException("生成微信短链失败");
        }
    }

    public QueryUrlLinkResponse queryUrlLink(String urlLink) {
        final WxMaService wxService = WxMaConfiguration.getMaService();
        try {
            WxMaLinkService wxMaLinkService = wxService.getLinkService();
            QueryUrlLinkRequest queryUrlLinkRequest = new QueryUrlLinkRequest();
            queryUrlLinkRequest.setUrlLink(urlLink);
            return wxMaLinkService.queryUrlLink(queryUrlLinkRequest);
        } catch (Exception e) {
            log.error("查询微信短链失败, msg={}", e.getMessage());
            throw new ApiException("查询微信短链失败");
        }
    }

    public void redirectMini() {
        try {
            HttpServletResponse response = response();
            response.sendRedirect(generateShortLink());
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    private final ReentrantLock syncLock = new ReentrantLock();
    private volatile LocalDateTime lastExecuteTime;

    /**
     * 更新服务号和小程序关联
     */
    public void getWxMpUserList() {
        syncLock.lock();
        try {
            if (isWithinExecuteInterval()) {
                return;
            }
            WxMpUserService userService = wxService.getUserService();
            WxMpUserList wxMpUserList = userService.userList();
            List<String> openids = wxMpUserList.getOpenids();

            List<WxMpUser> allUsers = new ArrayList<>();
            int batchSize = 100;

            for (int i = 0; i < openids.size(); i += batchSize) {
                int end = Math.min(i + batchSize, openids.size());
                List<String> batchOpenids = openids.subList(i, end);

                List<WxMpUser> wxMpUsers = userService.userInfoList(batchOpenids);
                allUsers.addAll(wxMpUsers);
            }
            customerWxService.addByMpBatch(allUsers);
            lastExecuteTime = LocalDateTime.now();
        } catch (Exception e) {
            log.error("批量添加公众号用户失败", e);
        } finally {
            syncLock.unlock();
        }
    }

    private static final int DEFAULT_INTERVAL_SECONDS = 60;

    /**
     * 检查是否在执行间隔内
     */
    private boolean isWithinExecuteInterval() {
        if (lastExecuteTime == null) {
            return false;
        }
        Duration executeInterval = Duration.ofSeconds(DEFAULT_INTERVAL_SECONDS);
        Duration duration = Duration.between(lastExecuteTime, LocalDateTime.now());
        return duration.compareTo(executeInterval) < 0;
    }

}
