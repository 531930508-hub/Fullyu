package com.macro.mall.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.github.pagehelper.PageInfo;
import com.macro.mall.common.exception.BusinessException;
import com.macro.mall.entity.Customer;
import com.macro.mall.entity.Order;
import com.macro.mall.entity.SalaryOtherAmount;
import com.macro.mall.entity.payout;
import com.macro.mall.enums.OrderType;
import com.macro.mall.mapper.SalaryOtherAmountMapper;
import com.macro.mall.service.base.BaseService;
import com.macro.mall.service.base.WrapperBuilder;
import com.macro.mall.utils.DateUtil;
import com.macro.mall.utils.ExcelUtil;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.util.CollectionUtils;
import org.springframework.util.StringUtils;
import org.springframework.web.multipart.MultipartFile;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.stream.Collectors;

/**
 * 计薪其他调整 服务类
 *
 * @author
 * @date 2025/10/09
 */
@Service
public class SalaryOtherAmountService extends BaseService<SalaryOtherAmountMapper, SalaryOtherAmount> {
    @Autowired
    MassagistService massagistService;
    @Override
    protected QueryWrapper<SalaryOtherAmount> buildWrapper(Map<String, Object> params, QueryWrapper<SalaryOtherAmount> queryWrapper) {
        if(params.get("daymonth")!=null) {
            LocalDate monthNumber = LocalDate.parse(params.get("daymonth").toString());
            String yyyymm= DateUtil.toYYYYMM(monthNumber);
            queryWrapper.eq("month_code", yyyymm);
        }
        if(params.get("massagist_id")!=null) {
            queryWrapper.eq("massagist_id", params.get("massagist_id"));
        }
        return WrapperBuilder.init(queryWrapper, params)
                .equal("shop_id")
                .getQueryWrapper();
    }
    /**
     * 获取技师计薪其他调整
     *
     * @param monthCode   yyyy-MM
     * @param massagistId
     * @return
     */
    public List<SalaryOtherAmount> findSalaryOtherAmountList(String monthCode, Long massagistId) {
        if (monthCode == null) {
            return new ArrayList<>();
        }
        LambdaQueryWrapper<SalaryOtherAmount> lqw = new LambdaQueryWrapper<>();
        lqw.eq(SalaryOtherAmount::getMonthCode, monthCode);
        if (massagistId != null) {
            lqw.eq(SalaryOtherAmount::getMassagistId, massagistId);
        }
        return list(lqw);
    }

    /**
     * 计算其他金额
     *
     * @param monthCode   yyyy-MM
     * @param massagistId
     * @return
     */
    public BigDecimal calcOtherAmount(String monthCode, Long massagistId) {
        List<SalaryOtherAmount> list = findSalaryOtherAmountList(monthCode, massagistId);
        if (CollectionUtils.isEmpty(list)) {
            return BigDecimal.ZERO;
        }
        return list.stream()
                .filter(Objects::nonNull)
                .filter(item -> item.getAmount() != null)
                .map(item -> {
                    if (item.getType() == 0) {
                        return item.getAmount().negate();
                    } else {
                        return item.getAmount();
                    }
                }).reduce(BigDecimal.ZERO, BigDecimal::add);
    }

    /**
     * 导入
     *
     * @param file
     * @param createUser
     */
    public void importAdd(MultipartFile file, Long createUser) {
        List<Map<Integer, String>> mapList = ExcelUtil.doReadExcelMapList(file, 0, 0);
        Map<String, Long> name2IdMap = massagistService.findName2IdMap();
        Map<String, Long> name2ShopIdMap = massagistService.findName2ShopIdMap();
        Integer monthCodeKey = null;
        Integer massagistNameKey = null;
        Integer typeKey = null;
        Integer amountKey = null;
        Integer titleKey = null;
        Integer contentKey = null;
        List<SalaryOtherAmount> salaryOtherAmountList = new ArrayList<>();
        for (int i = 0; i < mapList.size(); i++) {
            Map<Integer, String> map = mapList.get(i);
            if (i == 0) {
                for (Integer key : map.keySet()) {
                    String value = map.get(key);
                    if ("计薪月份".equals(value)) {
                        monthCodeKey = key;
                    } else if ("技师姓名".equals(value)) {
                        massagistNameKey = key;
                    } else if ("调整类型".equals(value)) {
                        typeKey = key;
                    } else if ("调整金额".equals(value)) {
                        amountKey = key;
                    } else if ("动账标题".equals(value)) {
                        titleKey = key;
                    } else if ("动账原因".equals(value)) {
                        contentKey = key;
                    }
                }
                if (monthCodeKey == null) {
                    throw new BusinessException("未检测到计薪月份列存在，导入失败");
                }
                if (massagistNameKey == null) {
                    throw new BusinessException("未检测到技师姓名列存在，导入失败");
                }
                if (typeKey == null) {
                    throw new BusinessException("未检测到调整类型列存在，导入失败");
                }
                if (amountKey == null) {
                    throw new BusinessException("未检测到调整金额列存在，导入失败");
                }
                if (titleKey == null) {
                    throw new BusinessException("未检测到动账标题列存在，导入失败");
                }
                if (contentKey == null) {
                    throw new BusinessException("未检测到动账原因列存在，导入失败");
                }
                continue;
            }

            String monthCode = map.get(monthCodeKey);
            String massagistName = map.get(massagistNameKey);
            String type = map.get(typeKey);
            String amount = map.get(amountKey);
            String title = map.get(titleKey);
            String content = map.get(contentKey);
            if (StringUtils.isEmpty(monthCode) || StringUtils.isEmpty(massagistName) || StringUtils.isEmpty(type) || StringUtils.isEmpty(amount)) {
                continue;
            }
            SalaryOtherAmount salaryOtherAmount = new SalaryOtherAmount();
            salaryOtherAmount.setMonthCode(monthCode);
            Long massagistId = name2IdMap.get(massagistName);
            if (massagistId == null) {
                continue;
            }
            Long shopId = name2ShopIdMap.get(massagistName);
            if (shopId == null) {
                continue;
            }
            salaryOtherAmount.setShopId(shopId);
            salaryOtherAmount.setType("收入".equals(type) ? 1 : 0);
            salaryOtherAmount.setMassagistId(massagistId);
            salaryOtherAmount.setTitle(title);
            salaryOtherAmount.setContent(content);
            try {
                salaryOtherAmount.setAmount(new BigDecimal(amount.trim()));
            } catch (Exception e) {
                continue;
            }
            salaryOtherAmount.setCreateUser(createUser);
            salaryOtherAmountList.add(salaryOtherAmount);
        }
        if (CollectionUtils.isEmpty(salaryOtherAmountList)) {
            return;
        }
        saveBatch(salaryOtherAmountList);
    }

    public PageInfo pageInfo(Map<String, Object> params) {
        PageInfo<SalaryOtherAmount> page = page(params);
        buildSalaryOtherAmount(page.getList());
        return page;
    }
    private void buildSalaryOtherAmount(List<SalaryOtherAmount> list) {
        if (CollectionUtils.isEmpty(list)) {
            return;
        }
        list.forEach(e -> {
            e.setMassagistName(massagistService.getById(e.getMassagistId()).getName());
        });
    }
}