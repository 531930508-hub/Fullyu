package com.macro.mall.mapper;

import com.macro.mall.entity.CustomerWx;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Select;

/**
 * 微信用户 Mapper 接口
 * @author 
 * @date 2025/07/23
 */
@Mapper
public interface CustomerWxMapper extends BaseMapper<CustomerWx> {

    /**
     * 通过客户id查找公众号openId
     * @param customerId
     * @return
     */
    @Select("SELECT w.mp_open_id FROM c_customer c join c_customer_wx w on w.ma_open_id = c.open_id where c.id = #{customerId} limit 1")
    String findMpOpenIdByCustomerId(Long customerId);

    /**
     * 通过小程序 openId 查找微信 unionId，用于会员中心跨业务匹配同一微信身份
     * @param maOpenId 小程序 openId
     * @return unionId，未匹配时返回 null
     */
    @Select("SELECT union_id FROM c_customer_wx WHERE ma_open_id = #{maOpenId} LIMIT 1")
    String findUnionIdByMaOpenId(String maOpenId);
}
