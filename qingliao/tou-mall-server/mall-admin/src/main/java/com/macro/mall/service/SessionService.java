package com.macro.mall.service;

import com.macro.mall.common.exception.ApiException;
import com.macro.mall.common.service.RedisService;
import com.macro.mall.consts.RedisKey;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

/**
 * Created by oahnus on 2025/6/13
 *
 * @author oahnus
 */
@Service
public class SessionService {
    @Autowired
    private RedisService redisService;
    @Value("${jwt.tokenHead}")
    private String tokenHead;
    @Value("${jwt.expiration}")
    private Long expiration;

    public static final long TOKEN_EXPIRATION_THRESHOLD = 86400;

    public Long getCustomerId(String token) {
        if (token.startsWith(tokenHead)) {
            token = token.replace(tokenHead, "");
        }
        String key = RedisKey.AUTH_KEY + token;
        Object customerIdObj = redisService.get(key);
        if (customerIdObj == null) {
            throw new ApiException("登录授权已过期，请重新登录");
        }
        try {
            long customerId = Long.parseLong(customerIdObj.toString());
            long remainingTime = redisService.getExpire(key);
            if (remainingTime < TOKEN_EXPIRATION_THRESHOLD) {
                redisService.set(key, customerId, expiration);
            }

            return customerId;
        } catch (Exception e) {
            throw new ApiException("登录授权已过期，请重新登录");
        }
    }
}
