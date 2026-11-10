package com.macro.mall.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.macro.mall.entity.Product;
import org.apache.ibatis.annotations.Mapper;

/**
 * 产品表 Mapper 接口
 *
 * @author ST
 * @date 2025/06/03
 */
@Mapper
public interface ProductMapper extends BaseMapper<Product> {

}
