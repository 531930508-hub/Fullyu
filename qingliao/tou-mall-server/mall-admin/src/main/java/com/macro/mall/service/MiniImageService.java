package com.macro.mall.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.macro.mall.entity.MiniImage;
import com.macro.mall.mapper.MiniImageMapper;
import com.macro.mall.service.base.BaseService;
import com.macro.mall.service.base.WrapperBuilder;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Map;

/**
 * 服务类
 *
 * @author zkl
 * @date 2025/05/30
 */
@Service
public class MiniImageService extends BaseService<MiniImageMapper, MiniImage> {
    @Override
    protected QueryWrapper<MiniImage> buildWrapper(Map<String, Object> params, QueryWrapper<MiniImage> queryWrapper) {
        return WrapperBuilder.init(queryWrapper, params)
                .equal("status")
                .equal("type")
                .getQueryWrapper();
    }

    public List<MiniImage> splashScreenImageList() {
        LambdaQueryWrapper<MiniImage> lqw = new LambdaQueryWrapper<>();
        lqw.eq(MiniImage::getType, 1);
        lqw.eq(MiniImage::getStatus, 1);
        List<MiniImage> list = list(lqw);
        return list(lqw);
    }

    public List<MiniImage> bannerList() {
        LambdaQueryWrapper<MiniImage> lqw = new LambdaQueryWrapper<>();
        lqw.eq(MiniImage::getType, 2);
        lqw.eq(MiniImage::getStatus, 1);
        return list(lqw);
    }

    public List<MiniImage> couponImageList() {
        LambdaQueryWrapper<MiniImage> lqw = new LambdaQueryWrapper<>();
        lqw.eq(MiniImage::getType, 3);
        lqw.eq(MiniImage::getStatus, 1);
        return list(lqw);
    }

    public List<MiniImage> popupImageList() {
        LambdaQueryWrapper<MiniImage> lqw = new LambdaQueryWrapper<>();
        lqw.eq(MiniImage::getType, 5);
        lqw.eq(MiniImage::getStatus, 1);
        return list(lqw);
    }
    public List<MiniImage> appointmentImageList() {
        LambdaQueryWrapper<MiniImage> lqw = new LambdaQueryWrapper<>();
        lqw.eq(MiniImage::getType, 4);
        lqw.eq(MiniImage::getStatus, 1);
        return list(lqw);
    }
}