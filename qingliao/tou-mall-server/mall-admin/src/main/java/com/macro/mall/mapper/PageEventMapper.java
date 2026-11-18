package com.macro.mall.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.macro.mall.entity.PageEvent;
import org.apache.ibatis.annotations.Mapper;

/**
 * 小程序页面埋点 Mapper。
 */
@Mapper
public interface PageEventMapper extends BaseMapper<PageEvent> {
}
