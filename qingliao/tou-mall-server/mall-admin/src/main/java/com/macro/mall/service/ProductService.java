package com.macro.mall.service;

import cn.hutool.core.util.ObjUtil;
import com.alibaba.fastjson2.JSONArray;
import com.alibaba.fastjson2.JSONObject;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.github.pagehelper.PageInfo;
import com.macro.mall.common.exception.BusinessException;
import com.macro.mall.entity.Coupon;
import com.macro.mall.entity.Product;
import com.macro.mall.entity.ProductTag;
import com.macro.mall.entity.Project;
import com.macro.mall.enums.NormalState;
import com.macro.mall.mapper.ProductMapper;
import com.macro.mall.service.base.BaseService;
import com.macro.mall.service.base.WrapperBuilder;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Service;
import org.springframework.util.CollectionUtils;

import java.util.*;
import java.util.stream.Collectors;

/**
 * 产品表 服务类
 *
 * @author ST
 * @date 2025/06/03
 */
@Service
public class ProductService extends BaseService<ProductMapper, Product> {
    @Autowired
    ProjectService projectService;
    @Autowired
    CouponService couponService;
    @Autowired
    @Lazy
    OrderService orderService;
    @Autowired
    @Lazy
    ProductTagService productTagService;
    @Autowired
    @Lazy
    CustomerTagService customerTagService;
    @Autowired
    @Lazy
    ActivityService activityService;

    @Override
    protected QueryWrapper<Product> buildWrapper(Map<String, Object> params, QueryWrapper<Product> queryWrapper) {
        return WrapperBuilder.init(queryWrapper, params)
                .like("title")
                .equal("type")
                .equal("state")
                .getQueryWrapper();
    }

    /**
     * 校验
     *
     * @param product
     */
    public void verify(Product product) {
        int months = product.getRewardMemberMonths() == null ? 0 : product.getRewardMemberMonths();
        if (months < 0 || months > 120) throw new BusinessException("赠送会员月数需在0到120之间");
        if (months > 0 && !Integer.valueOf(1).equals(product.getType())) {
            throw new BusinessException("仅预付券包可配置用完赠会员");
        }
        product.setRewardMemberMonths(months);
        LambdaQueryWrapper<Product> lqw = new LambdaQueryWrapper<>();
        lqw.eq(Product::getTitle, product.getTitle());
        lqw.eq(Product::getType, product.getType());
        Long id = product.getId();
        if (id != null) {
            lqw.ne(Product::getId, id);
        }
        Product onlyOne = getOnlyOne(lqw);
        if (onlyOne != null) {
            throw new BusinessException("产品已存在");
        }
    }

    public Long findIdByProjectId(Long projectId) {
        LambdaQueryWrapper<Product> queryWrapper = new LambdaQueryWrapper();
        queryWrapper.eq(Product::getType, 0);
        String content = "[{\"projectId\":" + projectId + "}]";
        queryWrapper.eq(Product::getContent, content);
        queryWrapper.select(Product::getId);
        Product product = getOnlyOne(queryWrapper);
        if (product == null) {
            throw new BusinessException("产品不存在");
        }
        return product.getId();
    }

    /**
     * 获取商品中的产品
     *
     * @param productId
     * @return
     */
    public List<JSONObject> getProductContent(Long productId) {
        Product product = getById(productId);
        if (product == null) {
            throw new BusinessException("产品不存在");
        }
        return JSONArray.parseArray(product.getContent(), JSONObject.class);
    }

    /**
     * 分页查询
     *
     * @param params
     * @return
     */
    public PageInfo pageInfo(Map<String, Object> params) {
        PageInfo<Product> page = page(params);
        List<Product> productList = page.getList();
        buildDetail(productList);
        List<Long> allLimitIdList = productList.stream().filter(s -> s.getAllLimit() > 0).map(Product::getId).collect(Collectors.toList());
        if (!CollectionUtils.isEmpty(allLimitIdList)) {
            Map<Long, Integer> realSaleMap = orderService.getRealSaleByProductId(allLimitIdList);
            productList.forEach(s -> {
                Integer realSale = realSaleMap.getOrDefault(s.getId(), 0);
                if (realSale == 0) {
                    return;
                }
                s.setLimitState(realSale >= s.getAllLimit());
            });
        }
        page.setList(productList);
        return page;
    }

    /**
     * 限购
     *
     * @param list
     * @param customerId
     * @return
     */
    private List<Product> buildLimit(List<Product> list, Long customerId) {
        Map<Long, Integer> limitProductMap = list.stream().filter(s -> s.getBuyLimit() > 0).collect(Collectors.toMap(Product::getId, Product::getBuyLimit));
        if (!CollectionUtils.isEmpty(limitProductMap)) {
            Map<Long, Integer> limitOrderMap = orderService.getLimitOrderMap(new ArrayList<>(limitProductMap.keySet()), customerId);
            if (!CollectionUtils.isEmpty(limitOrderMap)) {
                list = list.stream().filter(product -> {
                    Long productId = product.getId();
                    Integer orderQuantity = limitOrderMap.getOrDefault(productId, 0);
                    Integer buyLimit = product.getBuyLimit();
                    if (buyLimit == 0) {
                        return true;
                    } else if (buyLimit > orderQuantity) {
                        product.setBuyLimit(buyLimit - orderQuantity);
                        return true;
                    } else {
                        return false;
                    }
                }).collect(Collectors.toList());
            }
        }
        return list;
    }

    /**
     * 商品详情
     *
     * @param list
     */
    private void buildDetail(List<Product> list) {
        if (CollectionUtils.isEmpty(list)) {
            return;
        }
        List<Long> idList = list.stream().map(Product::getId).collect(Collectors.toList());
        Map<Long, List<Long>> projectMap = list.stream().filter(s -> s.getType() == 0).collect(Collectors.groupingBy(Product::getId,
                Collectors.collectingAndThen(Collectors.toList(),
                        productList -> productList.stream()
                                .flatMap(s -> JSONArray.parseArray(s.getContent(), JSONObject.class).stream())
                                .map(s -> s.getLong("projectId"))
                                .collect(Collectors.toList())
                )
        ));
        Map<Long, List<Long>> couponMap = list.stream().filter(s -> s.getType() == 1).collect(Collectors.groupingBy(Product::getId,
                Collectors.collectingAndThen(Collectors.toList(),
                        productList -> productList.stream()
                                .flatMap(s -> JSONArray.parseArray(s.getContent(), JSONObject.class).stream())
                                .map(s -> s.getLong("couponId"))
                                .filter(Objects::nonNull)
                                .collect(Collectors.toList())
                )
        ));
        Map<Long, Coupon> couponListMap = new HashMap<>();
        Map<Long, Project> projectListMap = new HashMap<>();
        if (!ObjUtil.isEmpty(projectMap)) {
            List<Long> projectIdList = projectMap.values().stream().flatMap(List::stream).collect(Collectors.toList());
            List<Project> projectList = projectService.listByIds(projectIdList);
            projectListMap = projectList.stream().collect(Collectors.toMap(Project::getId, s -> s));
        }
        if (!ObjUtil.isEmpty(couponMap)) {
            List<Long> couponIdList = couponMap.values().stream().flatMap(List::stream).collect(Collectors.toList());
            List<Coupon> couponList = couponService.listByIds(couponIdList);
            couponListMap = couponList.stream().collect(Collectors.toMap(Coupon::getId, s -> s));
        }
        Map<Long, Project> finalProjectListMap = projectListMap;
        Map<Long, Coupon> finalCouponListMap = couponListMap;
        Map<Long, List<ProductTag>> tagMap = productTagService.mapByProductIdList(idList);
        list.forEach(s -> {
            if (s.getType() == 0) {
                List<Long> ids = projectMap.getOrDefault(s.getId(), null);
                List<Project> projects = ids.stream().map(projectId -> finalProjectListMap.getOrDefault(projectId, null)).filter(Objects::nonNull).collect(Collectors.toList());
                s.setProjectList(projects);
            }
            if (s.getType() == 1) {
                List<Long> ids = couponMap.getOrDefault(s.getId(), null);
                List<Coupon> coupons = ids.stream().map(couponId -> finalCouponListMap.getOrDefault(couponId, null)).filter(Objects::nonNull).collect(Collectors.toList());
                s.setCouponList(coupons);
            }
            s.setProductTagList(tagMap.getOrDefault(s.getId(), Collections.emptyList()));
        });
    }

    /**
     * 根据条件查询list
     *
     * @param params
     * @return
     */
    public List<Product> listInfo(Map<String, Object> params) {
        List<Product> productList = listNoPage(params);
        buildDetail(productList);
        return productList;
    }

    public List<Product> miniListInfo(Map<String, Object> params) {
        List<Product> productList = listNoPage(params);
        buildDetail(productList);
        Object customerId = params.getOrDefault("customerId", null);
        Object activityCode = params.getOrDefault("activityCode", null);
        if (customerId != null) {
            productList = buildLimit(productList, Long.parseLong(customerId.toString()));
            productList = buildActivityLimit(productList, Long.parseLong(customerId.toString()));
        } else if (activityCode != null) {
            productList = buildActivityLimit(productList, activityCode.toString());
        } else {
            productList = buildActivityLimit(productList);
        }
        List<Long> allLimitIdList = productList.stream().filter(s -> s.getAllLimit() > 0).map(Product::getId).collect(Collectors.toList());
        if (!CollectionUtils.isEmpty(allLimitIdList)) {
            Map<Long, Integer> realSaleMap = orderService.getRealSaleByProductId(allLimitIdList);
            productList = productList.stream().filter(s -> {
                Integer realSale = realSaleMap.getOrDefault(s.getId(), 0);
                if (realSale != 0) {
                    return realSale < s.getAllLimit();
                }
                return !NormalState.INVALID.getValue().equals(s.getState());
            }).collect(Collectors.toList());
        }
        return productList;
    }

    /**
     * 活动限制
     *
     * @param list
     * @param customerId
     * @return
     */
    private List<Product> buildActivityLimit(List<Product> list, Long customerId) {
        List<Long> customerTagIdList = customerTagService.findTagIdListByCustomerId(customerId);
        if (CollectionUtils.isEmpty(customerTagIdList)) {
            return buildActivityLimit(list);
        }
        list = list.stream().filter(s -> {
            List<ProductTag> productTagList = s.getProductTagList();
            if (!CollectionUtils.isEmpty(productTagList)) {
                List<Long> productTagIdList = productTagList.stream().map(ProductTag::getBasicCustomerTagId).collect(Collectors.toList());
                return productTagIdList.stream().anyMatch(customerTagIdList::contains);
            } else {
                return true;
            }
        }).collect(Collectors.toList());
        return list;
    }

    /**
     * 活动限制
     *
     * @param list
     * @param activityCode
     * @return
     */
    private List<Product> buildActivityLimit(List<Product> list, String activityCode) {
        List<Long> customerTagIdList = activityService.getCustomerTagByCode(activityCode);
        if (CollectionUtils.isEmpty(customerTagIdList)) {
            return buildActivityLimit(list);
        }
        list = list.stream().filter(s -> {
            List<ProductTag> productTagList = s.getProductTagList();
            if (!CollectionUtils.isEmpty(productTagList)) {
                List<Long> productTagIdList = productTagList.stream().map(ProductTag::getBasicCustomerTagId).collect(Collectors.toList());
                return productTagIdList.stream().anyMatch(customerTagIdList::contains);
            } else {
                return true;
            }
        }).collect(Collectors.toList());
        return list;
    }

    /**
     * 活动限制
     *
     * @param list
     * @return
     */
    private List<Product> buildActivityLimit(List<Product> list) {
        return list.stream().filter(s -> CollectionUtils.isEmpty(s.getProductTagList())).collect(Collectors.toList());
    }

    /**
     * 增加产品销量
     *
     * @param productId
     * @return
     */
    public void addSale(Long productId) {
        String lockKey = "lock:" + productId;
        synchronized (lockKey.intern()) {
            Product product = getById(productId);
            if (product == null) {
                throw new BusinessException("产品不存在");
            }
            Integer sale = product.getSale();
            product.setSale(++sale);
            updateById(product);
        }
    }

    /**
     * 获取产品限购
     *
     * @return
     */
    public Product getProductLimit(Long productId) {
        Product product = getById(productId);
        if (product == null) {
            throw new BusinessException("产品不存在");
        }
        if (NormalState.INVALID.getValue().equals(product.getState())) {
            throw new BusinessException("产品已下架");
        }
        Integer allLimit = product.getAllLimit();
        if (allLimit != 0) {
            Integer realSale = orderService.getRealSaleByProductId(productId);
            if (realSale >= allLimit) {
                throw new BusinessException("产品已售罄");
            }
        }
        return product;
    }

    public List<Product>  getListNotParams() {
        LambdaQueryWrapper<Product> lqw = new LambdaQueryWrapper<>();
        lqw.eq(Product::getState, 1);
        lqw.eq(Product::getType, 1);
        lqw.ne(Product::getId,1);
        lqw.orderByAsc(Product::getAmount);
        return  list(lqw);
    }
    public List<Product>  productList() {
        LambdaQueryWrapper<Product> lqw = new LambdaQueryWrapper<>();
        lqw.eq(Product::getState, 1);
        lqw.eq(Product::getType, 0);
        return  list(lqw);
    }

}