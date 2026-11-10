package com.macro.mall.mapper;

import com.alibaba.fastjson2.JSONObject;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.macro.mall.dto.OperatingRevenueDto;
import com.macro.mall.entity.Order;
import org.apache.ibatis.annotations.Mapper;

import java.util.List;

/**
 * 订单Mapper 接口
 *
 * @author ST
 * @date 2025/05/30
 */
@Mapper
public interface OrderMapper extends BaseMapper<Order> {

    List<OperatingRevenueDto> operatingRevenue(OperatingRevenueDto operatingRevenueDto);

    List<JSONObject> operatingRevenueTop(OperatingRevenueDto operatingRevenueDto);
}
