package com.macro.mall.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.macro.mall.common.exception.BusinessException;
import com.macro.mall.entity.ActivityTag;
import com.macro.mall.entity.BasicCustomerTag;
import com.macro.mall.entity.CustomerTag;
import com.macro.mall.entity.ProductTag;
import com.macro.mall.mapper.BasicCustomerTagMapper;
import com.macro.mall.service.base.BaseService;
import com.macro.mall.utils.TreeUtil;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Service;
import org.springframework.util.CollectionUtils;

import java.util.Collections;
import java.util.List;

/**
 * 基础客户标签 服务类
 *
 * @author ST
 * @date 2025/07/10
 */
@Service
public class BasicCustomerTagService extends BaseService<BasicCustomerTagMapper, BasicCustomerTag> {
    @Autowired
    @Lazy
    CustomerTagService customerTagService;
    @Autowired
    @Lazy
    ProductTagService productTagService;
    @Autowired
    @Lazy
    ActivityTagService activityTagService;

    public List<BasicCustomerTag> all() {
        List<BasicCustomerTag> list = list();
        List<BasicCustomerTag> treeList = TreeUtil.listToTree(list);
        return treeList;
    }

    public void removeAfterCheck(List<Long> ids) {
        List<CustomerTag> basicTaskList = customerTagService.findByBasicCustomerTagIds(ids);
        if (!CollectionUtils.isEmpty(basicTaskList)) {
            throw new BusinessException("要删除的标签中还关联着客户，不可以执行删除");
        }
        List<ProductTag> productTagList = productTagService.findByBasicCustomerTagIds(ids);
        if (!CollectionUtils.isEmpty(productTagList)) {
            throw new BusinessException("要删除的标签中还关联着商品，不可以执行删除");
        }
        List<ActivityTag> activityTagList = activityTagService.findByBasicCustomerTagIds(ids);
        if (!CollectionUtils.isEmpty(activityTagList)) {
            throw new BusinessException("要删除的标签中还关联着活动，不可以执行删除");
        }
        removeByIds(ids);
    }

    public List<BasicCustomerTag> listByParentId(Long parentId) {
        LambdaQueryWrapper<BasicCustomerTag> lqw = new LambdaQueryWrapper<>();
        lqw.eq(BasicCustomerTag::getParentId, parentId);
        return list(lqw);
    }

    public List<BasicCustomerTag> listByTitles(List<String> titles) {
        if (CollectionUtils.isEmpty(titles)) {
            return Collections.emptyList();
        }
        LambdaQueryWrapper<BasicCustomerTag> lqw = new LambdaQueryWrapper<>();
        lqw.in(BasicCustomerTag::getTitle, titles);
        List<BasicCustomerTag> list = list(lqw);
        return list;
    }

    public List<BasicCustomerTag> listChildByTitle(String categoryTitle) {
        LambdaQueryWrapper<BasicCustomerTag> lqw = new LambdaQueryWrapper<>();
        lqw.in(BasicCustomerTag::getTitle, categoryTitle);
        List<BasicCustomerTag> list = list(lqw);
        if (CollectionUtils.isEmpty(list)) {
            return Collections.emptyList();
        }
        LambdaQueryWrapper<BasicCustomerTag> qw = new LambdaQueryWrapper<>();
        qw.eq(BasicCustomerTag::getParentId, list.get(0).getParentId());
        return list(qw);
    }

    /**
     * 添加客户标签标题
     *
     * @param idList
     * @return
     */
    public void saveCustomerTagByIdList(Long customerId, List<Long> idList) {
        if (customerId == null || CollectionUtils.isEmpty(idList)) {
            return;
        }
        List<BasicCustomerTag> basicCustomerTagList = listByIds(idList);
        customerTagService.saveTagListByBasicTag(customerId, basicCustomerTagList);
    }
}