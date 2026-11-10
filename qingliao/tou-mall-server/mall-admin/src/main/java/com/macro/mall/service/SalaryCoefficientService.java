package com.macro.mall.service;

import com.macro.mall.entity.SalaryCoefficient;
import com.macro.mall.mapper.SalaryCoefficientMapper;
import com.macro.mall.service.base.BaseService;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;

/**
 * 服务类
 *
 * @author
 * @date 2025/09/23
 */
@Service
public class SalaryCoefficientService extends BaseService<SalaryCoefficientMapper, SalaryCoefficient> {

    public void updatedata(double onevalue, double twovalue, double threevalue, double fourvalue, double samllvalue) {
        SalaryCoefficient obj1=getById(1);
        obj1.setCoefficient(BigDecimal.valueOf(onevalue));
        updateById(obj1);
        obj1=getById(2);
        obj1.setCoefficient(BigDecimal.valueOf(twovalue));
        updateById(obj1);
        obj1=getById(3);
        obj1.setCoefficient(BigDecimal.valueOf(threevalue));
        updateById(obj1);
        obj1=getById(4);
        obj1.setCoefficient(BigDecimal.valueOf(fourvalue));
        updateById(obj1);
        obj1=getById(5);
        obj1.setCoefficient(BigDecimal.valueOf(samllvalue));
        updateById(obj1);
    }
}