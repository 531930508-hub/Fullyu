package com.macro.mall.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.macro.mall.common.exception.BusinessException;
import com.macro.mall.entity.ProductTag;
import com.macro.mall.mapper.ProductTagMapper;
import com.macro.mall.service.base.BaseService;
import com.macro.mall.service.base.WrapperBuilder;
import com.macro.mall.service.impl.UmsAdminServiceImpl;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Service;
import org.springframework.util.CollectionUtils;

import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * 商品标签 服务类
 *
 * @author
 * @date 2025/07/14
 */
@Service
public class ProductTagService extends BaseService<ProductTagMapper, ProductTag> {
    @Autowired
    @Lazy
    UmsAdminServiceImpl umsAdminService;

    public List<ProductTag> findByBasicCustomerTagIds(List<Long> ids) {
        if (CollectionUtils.isEmpty(ids)) {
            return Collections.emptyList();
        }
        LambdaQueryWrapper<ProductTag> lqw = new LambdaQueryWrapper<>();
        lqw.in(ProductTag::getBasicCustomerTagId, ids);
        return list(lqw);
    }

    public Map<Long, List<ProductTag>> mapByProductIdList(List<Long> productIdList) {
        if (CollectionUtils.isEmpty(productIdList)) {
            return Collections.emptyMap();
        }
        LambdaQueryWrapper<ProductTag> queryWrapper = new LambdaQueryWrapper();
        queryWrapper.in(ProductTag::getProductId, productIdList);
        return list(queryWrapper).stream().collect(Collectors.groupingBy(ProductTag::getProductId));
    }

    public void checkAndSave(ProductTag productTag) {
        LambdaQueryWrapper<ProductTag> queryWrapper = new LambdaQueryWrapper();
        queryWrapper.eq(ProductTag::getBasicCustomerTagId, productTag.getBasicCustomerTagId());
        queryWrapper.eq(ProductTag::getProductId, productTag.getProductId());
        if (count(queryWrapper) > 0) {
            throw new BusinessException("标签已存在");
        }
        productTag.setCreateUser(umsAdminService.currentId());
        save(productTag);
    }

    @Override
    protected QueryWrapper<ProductTag> buildWrapper(Map<String, Object> params, QueryWrapper<ProductTag> queryWrapper) {
        return WrapperBuilder.init(queryWrapper, params)
                .equal("product_id")
                .getQueryWrapper();
    }

}