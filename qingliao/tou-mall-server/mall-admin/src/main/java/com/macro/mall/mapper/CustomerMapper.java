package com.macro.mall.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.macro.mall.entity.Customer;
import org.apache.ibatis.annotations.Mapper;

/**
 * 客户 Mapper 接口
 *
 * @author ST
 * @date 2025/06/04
 */
@Mapper
public interface CustomerMapper extends BaseMapper<Customer> {

}
