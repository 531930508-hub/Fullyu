package com.macro.mall.service;

import com.alibaba.fastjson2.JSONObject;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.macro.mall.common.exception.BusinessException;
import com.macro.mall.entity.Massagist;
import com.macro.mall.entity.SalaryCoefficient;
import com.macro.mall.entity.SalaryOtherAmount;
import com.macro.mall.entity.SalaryRecord;
import com.macro.mall.mapper.SalaryRecordMapper;
import com.macro.mall.service.base.BaseService;
import com.macro.mall.service.serviceStatistics.StatisticsService;
import com.macro.mall.service.shop.ShopService;
import com.macro.mall.utils.DateUtil;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.CollectionUtils;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.Month;
import java.time.YearMonth;
import java.util.*;
import java.util.stream.Collectors;

/**
 * 服务类
 *
 * @author
 * @date 2025/09/23
 */
@Service
public class SalaryRecordService extends BaseService<SalaryRecordMapper, SalaryRecord> {
    @Autowired
    ShopService shopService;
    @Autowired
    StatisticsService statisticsService;
    @Autowired
    SalaryCoefficientService salaryCoefficientService;
    @Autowired
    SalaryOtherAmountService salaryOtherAmountService;

    private final BigDecimal MONTHLY_DEDUCTION = BigDecimal.valueOf(5000);

    private Map<Integer, JSONObject> getTaxBracketMap() {
        Map<Integer, JSONObject> taxBracketMap = new HashMap<>();
        Integer[][] taxBracketData = {
                {1, 3, 36000, 0},
                {2, 10, 144000, 2520},
                {3, 20, 300000, 16920},
                {4, 25, 420000, 31920},
                {5, 30, 660000, 52920},
                {6, 35, 960000, 85920},
                {7, 45, Integer.MAX_VALUE, 181920}
        };
        for (Integer[] bracket : taxBracketData) {
            int level = bracket[0];
            JSONObject jsonObject = new JSONObject();
            jsonObject.put("taxRate", bracket[1]);
            jsonObject.put("threshold", bracket[2]);
            jsonObject.put("quickDeduction", bracket[3]);
            taxBracketMap.put(level, jsonObject);
        }
        return taxBracketMap;
    }

    private final BigDecimal VAT_DIVISOR = BigDecimal.valueOf(1.01);
    private final BigDecimal VAT_RATE_3 = BigDecimal.valueOf(0.03);
    private final BigDecimal VAT_RATE_2 = BigDecimal.valueOf(0.02);
    private final BigDecimal URBAN_TAX_RATE = BigDecimal.valueOf(0.07);
    private final BigDecimal EDU_TAX_RATE = BigDecimal.valueOf(0.03);
    private final BigDecimal LOCAL_EDU_TAX_RATE = BigDecimal.valueOf(0.02);

    /**
     * 按月份计算
     *
     * @param monthCode
     */
    @Transactional(rollbackFor = Exception.class)
    public void calcSalaryRecordByMonthCode(String monthCode) {
        removeOldSalaryRecord(monthCode);
        LocalDate firstDay = DateUtil.getFirstDayOfMonth(monthCode);
        LocalDate endDay = DateUtil.getEndDayOfMonth(monthCode);
        String startTime = DateUtil.toYYYYMMDD(firstDay) + " 00:00:00";
        String endTime = DateUtil.toYYYYMMDD(endDay) + " 23:59:59";
        List<JSONObject> massagistDurationList = statisticsService.serviceDuration(null, startTime, endTime, null);
        if (CollectionUtils.isEmpty(massagistDurationList)) {
            return;
        }
        saveBatchSalaryRecord(massagistDurationList, monthCode);
    }

    /**
     * 按月份重置
     *
     * @param monthCode yyyy-MM
     * @return
     */
    public void removeOldSalaryRecord(String monthCode) {
        LambdaQueryWrapper<SalaryRecord> lqw = new LambdaQueryWrapper<>();
        lqw.eq(SalaryRecord::getMonthCode, monthCode);
        remove(lqw);
    }

    /**
     * 获取技师所有明细月份
     *
     * @param massagistId
     * @return
     */
    public List<String> findMassagistAllMonthCode(Long massagistId) {
        LambdaQueryWrapper<SalaryRecord> lqw = new LambdaQueryWrapper<>();
        lqw.eq(SalaryRecord::getMassagistId, massagistId);
        lqw.orderByDesc(SalaryRecord::getCreateTime);
        lqw.select(SalaryRecord::getMonthCode);
        List<SalaryRecord> list = list(lqw);
        list.sort(Comparator.comparing(SalaryRecord::getMonthCode).reversed());
        return list.stream().map(SalaryRecord::getMonthCode).distinct().collect(Collectors.toList());
    }

    /**
     * 获取技师计薪记录
     *
     * @param massagistId
     * @param monthCode   yyyy-MM
     * @return
     */
    public SalaryRecord findMassagistSalaryRecord(Long massagistId, String monthCode) {
        List<SalaryRecord> list = getSalaryRecordListByMonth(massagistId, monthCode);
        SalaryRecord salaryRecord = list.stream().filter(s -> monthCode.equals(s.getMonthCode())).findFirst().orElse(null);
        if (salaryRecord == null) {
            throw new BusinessException("未找到[" + monthCode + "]的薪资明细");
        }
        list = list.stream().filter(s -> monthCode.compareTo(s.getMonthCode()) > 0).collect(Collectors.toList());
        calcAnnualPaidTax(list, salaryRecord);
        List<SalaryOtherAmount> salaryOtherAmountList = salaryOtherAmountService.findSalaryOtherAmountList(salaryRecord.getMonthCode(), salaryRecord.getMassagistId());
        salaryRecord.setSalaryOtherAmountList(salaryOtherAmountList);
        return salaryRecord;
    }

    /**
     * 薪资详情：在基础计薪记录上补充接待工时封顶明细。
     * 仅详情接口使用，避免批量结算场景重复查询。
     */
    public SalaryRecord findMassagistSalaryRecordDetail(Long massagistId, String monthCode) {
        SalaryRecord salaryRecord = findMassagistSalaryRecord(massagistId, monthCode);
        fillReceptionCapDetail(salaryRecord);
        return salaryRecord;
    }

    /**
     * 回填接待工时封顶明细，供薪资详情展示「实际接待 / 封顶计入 / 超出不计」。
     */
    private void fillReceptionCapDetail(SalaryRecord salaryRecord) {
        LocalDate firstDay = DateUtil.getFirstDayOfMonth(salaryRecord.getMonthCode());
        LocalDate endDay = DateUtil.getEndDayOfMonth(salaryRecord.getMonthCode());
        String startTime = DateUtil.toYYYYMMDD(firstDay) + " 00:00:00";
        String endTime = DateUtil.toYYYYMMDD(endDay) + " 23:59:59";
        List<JSONObject> durationList = statisticsService.serviceDuration(null, startTime, endTime, salaryRecord.getMassagistId());
        if (CollectionUtils.isEmpty(durationList)) {
            return;
        }
        JSONObject monthDuration = durationList.stream()
                .filter(e -> salaryRecord.getMonthCode().equals(e.getString("periodCode")))
                .findFirst().orElse(null);
        if (monthDuration == null) {
            return;
        }
        salaryRecord.setReceptionDuration(monthDuration.getIntValue("receptionDuration"));
        salaryRecord.setReceptionCountedDuration(monthDuration.getIntValue("receptionCountedDuration"));
        salaryRecord.setReceptionExcessDuration(monthDuration.getIntValue("receptionExcessDuration"));
        salaryRecord.setReceptionCapMinutes(monthDuration.getIntValue("receptionCapMinutes"));
        salaryRecord.setReceptionCapApplied(monthDuration.getBoolean("receptionCapApplied"));
    }

//    public List<JSONObject> allMassagistDuration(String startTime, String endTime) {
//        List<Shop> list = shopService.findAvailableShopList();
//        List<JSONObject> jsonObjectList = new ArrayList<>();
//        for (Shop shop : list) {
//            List<JSONObject> jsonObjects = statisticsService.serviceDuration(shop.getId(), startTime, endTime, null);
//            if (CollectionUtils.isEmpty(jsonObjects)) {
//                continue;
//            }
//            jsonObjectList.addAll(jsonObjects);
//        }
//        return jsonObjectList;
//    }

    /**
     * 按月份添加
     *
     * @param massagistDurationList
     * @param monthCode             yyyy-MM
     */
    public void saveBatchSalaryRecord(List<JSONObject> massagistDurationList, String monthCode) {
        List<Long> massagistIdList = massagistDurationList.stream().map(s -> s.getLong("massagistId")).collect(Collectors.toList());
        Map<Long, List<SalaryRecord>> historyRecordMap = getSalaryRecordList(massagistIdList, monthCode);
        List<SalaryRecord> salaryRecordList = massagistDurationList.stream().map(s -> {
            Massagist massagist = s.getObject("massagist", Massagist.class);
            double totalDuration = s.getDouble("totalWorkingHours");
            Long massagistId = s.getLong("massagistId");
            return buildSalaryRecord(massagist, totalDuration, monthCode, historyRecordMap.getOrDefault(massagistId, new ArrayList<>()));
        }).collect(Collectors.toList());
        saveBatch(salaryRecordList);
    }

    /**
     * 重置技师指定月份及之后的计薪记录
     *
     * @param massagistId
     * @param monthCode   起始重置月份 yyyy-MM
     */
    @Transactional(rollbackFor = Exception.class)
    public void resetMassagistSalaryRecords(Long massagistId, String monthCode) {
        String currentMonthCode = DateUtil.getCurrentMonthCode();

        if (monthCode.compareTo(currentMonthCode) > 0) {
            throw new BusinessException("无法重置未结算月份[" + monthCode + "]的薪资明细");
        }

        List<SalaryRecord> salaryRecordList = getSalaryRecordListByYear(massagistId, getYearByMonthCode(monthCode));
        List<SalaryRecord> resetRecordList = salaryRecordList.stream()
                .filter(record -> record.getMonthCode().compareTo(monthCode) >= 0)
                .collect(Collectors.toList());
        if (resetRecordList.isEmpty()) {
            return;
        }
        List<SalaryRecord> historyRecordList = salaryRecordList.stream()
                .filter(record -> record.getMonthCode().compareTo(monthCode) < 0)
                .collect(Collectors.toList());
        String endMonthCode = monthCode;
        for (SalaryRecord salaryRecord : resetRecordList) {
            if (salaryRecord.getMonthCode().compareTo(endMonthCode) > 0) {
                endMonthCode = salaryRecord.getMonthCode();
            }
        }
        LocalDate firstDay = DateUtil.getFirstDayOfMonth(monthCode);
        LocalDate endDay = DateUtil.getEndDayOfMonth(endMonthCode);
        String startTime = DateUtil.toYYYYMMDD(firstDay) + " 00:00:00";
        String endTime = DateUtil.toYYYYMMDD(endDay) + " 23:59:59";
        List<JSONObject> jsonObjectList = statisticsService.serviceDuration(null, startTime, endTime, massagistId);
        Map<String, Double> totalDurationMap = new HashMap<>();
        if (!CollectionUtils.isEmpty(jsonObjectList)) {
            totalDurationMap = jsonObjectList.stream().collect(Collectors.toMap(s -> s.getString("periodCode"), s -> s.getDouble("totalWorkingHours")));
        }
        String currentMonth = monthCode;
        for (SalaryRecord salaryRecord : resetRecordList) {
            double totalDuration = totalDurationMap.getOrDefault(salaryRecord.getMonthCode(), 0.0);
            calcSalary(historyRecordList, salaryRecord, totalDuration);
            historyRecordList.add(salaryRecord);
            currentMonth = DateUtil.plusMonth(currentMonth, 1);
        }
        if (!updateBatchById(resetRecordList)) {
            throw new BusinessException("结算记录更新失败，请重试");
        }
    }

    /**
     * 计算系数
     *
     * @param massagist
     * @param totalDuration
     * @param monthCode     yyyy-MM
     * @return
     */
    private BigDecimal calcCoefficient(Massagist massagist, double totalDuration, String monthCode) {
        List<SalaryCoefficient> salaryCoefficientList = salaryCoefficientService.list();
        String formalMonth = massagist.getFormalMonth();
        if (StringUtils.hasText(formalMonth) && monthCode.compareTo(formalMonth) < 0) {
            salaryCoefficientList = salaryCoefficientList.stream().filter(s -> s.getType() == 0).collect(Collectors.toList());
        } else {
            salaryCoefficientList = salaryCoefficientList.stream().filter(s -> s.getType() == 1).collect(Collectors.toList());
        }
        SalaryCoefficient salaryCoefficient = getSalaryCoefficient(salaryCoefficientList, totalDuration);
        return salaryCoefficient.getCoefficient();
    }

    /**
     * 获取系数
     *
     * @param salaryCoefficientList
     * @param totalDuration
     * @return
     */
    private SalaryCoefficient getSalaryCoefficient(List<SalaryCoefficient> salaryCoefficientList, double totalDuration) {
        salaryCoefficientList.sort(Comparator.comparing(SalaryCoefficient::getWorkingHours));
        for (SalaryCoefficient salaryCoefficient : salaryCoefficientList) {
            if (salaryCoefficient.getWorkingHours() >= totalDuration) {
                return salaryCoefficient;
            }
        }
        return salaryCoefficientList.get(0);
    }

    /**
     * 构建记录
     *
     * @param massagist
     * @param totalDuration
     * @param monthCode         yyyy-MM
     * @param historyRecordList
     * @return
     */
    private SalaryRecord buildSalaryRecord(Massagist massagist, double totalDuration, String monthCode, List<SalaryRecord> historyRecordList) {
        BigDecimal coefficient = calcCoefficient(massagist, totalDuration, monthCode);
        SalaryRecord salaryRecord = new SalaryRecord();
        salaryRecord.setMonthCode(monthCode);
        salaryRecord.setYear(getYearByMonthCode(monthCode));
        salaryRecord.setMassagistId(massagist.getId());
        salaryRecord.setCoefficient(coefficient);
        calcSalary(historyRecordList, salaryRecord, totalDuration);
        return salaryRecord;
    }

    /**
     * 计薪
     *
     * @param historyRecordList 历史记录
     * @param salaryRecord      目标记录
     * @param totalDuration     时长
     * @return
     */
    private void calcSalary(List<SalaryRecord> historyRecordList, SalaryRecord salaryRecord, double totalDuration) {
        //BigDecimal coefficient = calcCoefficient(salaryRecord.getMassagistId(), totalDuration, salaryRecord.getMonthCode());
        salaryRecord.setTotalDuration(totalDuration);
        salaryRecord.setSalary(BigDecimal.valueOf(totalDuration).multiply(salaryRecord.getCoefficient()));
        salaryRecord.setPreTaxIncome(calcPreTaxIncome(salaryRecord));
        salaryRecord.setPreDeduction(calcPreDeduction(salaryRecord.getPreTaxIncome()));
        calcActualIncome(historyRecordList, salaryRecord);
    }

    /**
     * 税前收入,即(本月计薪+其他调整)÷1.062
     *
     * @param salaryRecord 计薪
     * @return
     */
    private BigDecimal calcPreTaxIncome(SalaryRecord salaryRecord) {
        BigDecimal salary = salaryRecord.getSalary();
        if (salary == null) {
            return BigDecimal.ZERO;
        }
        BigDecimal otherAmount = salaryOtherAmountService.calcOtherAmount(salaryRecord.getMonthCode(), salaryRecord.getMassagistId());
        if (!BigDecimal.ZERO.equals(otherAmount)) {
            salaryRecord.setOtherAmount(otherAmount);
            salary = salary.add(otherAmount);
        }
        if (salary.compareTo(BigDecimal.ZERO) < 0) {
            return BigDecimal.ZERO;
        }
        //大于2026年6月份
        /*if (salaryRecord.getMonthCode().compareTo("2026-05") >= 0) {
            BigDecimal divisor = new BigDecimal("1.066");
            return salary.divide(divisor, 0, RoundingMode.HALF_UP);
        }else{
            BigDecimal divisor = new BigDecimal("1.062");
            return salary.divide(divisor, 0, RoundingMode.HALF_UP);
        }*/
        BigDecimal divisor = new BigDecimal("1.068");
        return salary.divide(divisor, 0, RoundingMode.HALF_UP);

    }

    /**
     * 本月扣除
     *
     * @param salary 计薪
     * @return
     */
    private BigDecimal calcPreDeduction(BigDecimal salary) {
        if (salary == null) {
            return BigDecimal.ZERO;
        }
        if (salary.compareTo(BigDecimal.ZERO) < 0) {
            return BigDecimal.ZERO;
        }
        if (salary.compareTo(BigDecimal.ZERO) == 0) {
            return BigDecimal.ZERO;
        }
        BigDecimal preVatIncome = salary.divide(VAT_DIVISOR, 2, RoundingMode.HALF_UP);

        // 计算增值税 = Round(不含增值税收入*0.03,2) - Floor(不含增值税收入*0.02,0.01)
        BigDecimal vatPart1 = preVatIncome.multiply(VAT_RATE_3).setScale(2, RoundingMode.HALF_UP);
        BigDecimal vatPart2 = preVatIncome.multiply(VAT_RATE_2).setScale(2, RoundingMode.FLOOR);
        BigDecimal vat = vatPart1.subtract(vatPart2).setScale(2, RoundingMode.HALF_UP);

        // 计算城建税 = ROUND(增值税*0.07,2) - FLOOR((ROUND(增值税*0.07,2)*0.5),0.01)
        BigDecimal urbanTaxPart1 = vat.multiply(URBAN_TAX_RATE).setScale(2, RoundingMode.HALF_UP);
        BigDecimal urbanTaxPart2 = urbanTaxPart1.multiply(new BigDecimal("0.5")).setScale(2, RoundingMode.FLOOR);
        BigDecimal urbanConstructionTax = urbanTaxPart1.subtract(urbanTaxPart2).setScale(2, RoundingMode.HALF_UP);

        // 计算教育附加税 = ROUND(增值税*0.03,2) - FLOOR((ROUND(增值税*0.03,2)*0.5),0.01)
        BigDecimal eduTaxPart1 = vat.multiply(EDU_TAX_RATE).setScale(2, RoundingMode.HALF_UP);
        BigDecimal eduTaxPart2 = eduTaxPart1.multiply(new BigDecimal("0.5")).setScale(2, RoundingMode.FLOOR);
        BigDecimal educationSurcharge = eduTaxPart1.subtract(eduTaxPart2).setScale(2, RoundingMode.HALF_UP);

        // 计算地方教育附加税 = Round(增值税*0.02,2) - Floor((Round(增值税*0.02,2)*0.5),0.01)
        BigDecimal localEduTaxPart1 = vat.multiply(LOCAL_EDU_TAX_RATE).setScale(2, RoundingMode.HALF_UP);
        BigDecimal localEduTaxPart2 = localEduTaxPart1.multiply(new BigDecimal("0.5")).setScale(2, RoundingMode.FLOOR);
        BigDecimal localEducationSurcharge = localEduTaxPart1.subtract(localEduTaxPart2).setScale(2, RoundingMode.HALF_UP);
        BigDecimal totalAdditionalTax = urbanConstructionTax.add(educationSurcharge).add(localEducationSurcharge)
                .setScale(2, RoundingMode.HALF_UP);
        //return vat.add(totalAdditionalTax).setScale(2, RoundingMode.HALF_UP);
        return BigDecimal.ZERO;
    }

    /**
     * 计算本月实际收入
     *
     * @param historyRecordList 已缴纳月份
     * @param salaryRecord
     */
    private void calcActualIncome(List<SalaryRecord> historyRecordList, SalaryRecord salaryRecord) {
        calcAnnualPaidTax(historyRecordList, salaryRecord);

        String currentMonthCode = salaryRecord.getMonthCode();
        String lastMonthCode = DateUtil.minusMonth(currentMonthCode, 1);
        SalaryRecord lastSalaryRecord = historyRecordList.stream().filter(s -> lastMonthCode.equals(s.getMonthCode())).findFirst().orElse(null);
        if (lastSalaryRecord != null) {
            salaryRecord.setPreDeductionReturned(lastSalaryRecord.getPreDeduction());
        } else {
            salaryRecord.setPreDeductionReturned(BigDecimal.ZERO);
        }
        BigDecimal totalAnnualTax = salaryRecord.getTotalAnnualTax();
        BigDecimal totalPaidTax = salaryRecord.getTotalPaidTax();
        BigDecimal subtract = totalAnnualTax.subtract(totalPaidTax);
        if (BigDecimal.ZERO.equals(totalAnnualTax)) {
            salaryRecord.setPayableIncomeTax(BigDecimal.ZERO);
        } else if (BigDecimal.ZERO.compareTo(subtract) >= 0) {
            salaryRecord.setPayableIncomeTax(BigDecimal.ZERO);
        } else {
            salaryRecord.setPayableIncomeTax(totalAnnualTax.subtract(totalPaidTax));
        }
        BigDecimal preDeduction = salaryRecord.getPreDeduction();
        //BigDecimal preDeductionReturned = salaryRecord.getPreDeductionReturned();
        BigDecimal preDeductionReturned =BigDecimal.ZERO;
        BigDecimal preTaxIncome = salaryRecord.getPreTaxIncome();
        BigDecimal payableIncomeTax = salaryRecord.getPayableIncomeTax();
        BigDecimal actualIncome = preTaxIncome.subtract(preDeduction).add(preDeductionReturned).subtract(payableIncomeTax);
        salaryRecord.setActualIncome(actualIncome);
    }

    /**
     * 计算年度纳税情况
     *
     * @param historyRecordList 历史记录
     * @param salaryRecord
     */
    private void calcAnnualPaidTax(List<SalaryRecord> historyRecordList, SalaryRecord salaryRecord) {
        String currentMonthCode = salaryRecord.getMonthCode();
        String lastMonthCode = DateUtil.minusMonth(currentMonthCode, 1);
        //获取表SalaryRecord创建日期create_time 大于8月1号的记录
        LocalDateTime targetDate = LocalDate.of(2026, Month.AUGUST, 1).atStartOfDay();
        historyRecordList=historyRecordList.stream()
                .filter(record -> record.getCreateTime() != null && record.getCreateTime().isAfter(targetDate))
                .collect(Collectors.toList());
        historyRecordList = getContinuousSalaryRecords(historyRecordList, lastMonthCode);
        BigDecimal totalPaidTax = historyRecordList.stream().map(SalaryRecord::getPayableIncomeTax).reduce(BigDecimal.ZERO, BigDecimal::add);
        salaryRecord.setTotalPaidTax(totalPaidTax);
        historyRecordList.add(salaryRecord);
        BigDecimal totalSalary = historyRecordList.stream().map(SalaryRecord::getPreTaxIncome).reduce(BigDecimal.ZERO, BigDecimal::add);
        salaryRecord.setTotalSalary(totalSalary);
        BigDecimal totalAnnualTaxableIncome = getTotalAnnualTaxableIncome(totalSalary, historyRecordList.size());
        salaryRecord.setTotalAnnualTaxableIncome(totalAnnualTaxableIncome);
        if (BigDecimal.ZERO.equals(totalAnnualTaxableIncome)) {
            salaryRecord.setTaxRate(BigDecimal.ZERO);
            salaryRecord.setQuickDeduction(BigDecimal.ZERO);
            salaryRecord.setTotalAnnualTax(BigDecimal.ZERO);
        } else {
            JSONObject bracket = getTaxBracket(totalAnnualTaxableIncome);
            BigDecimal taxRate = bracket.getBigDecimal("taxRate");
            salaryRecord.setTaxRate(taxRate);
            BigDecimal quickDeduction = bracket.getBigDecimal("quickDeduction");
            salaryRecord.setQuickDeduction(quickDeduction);
            BigDecimal totalAnnualTax = totalAnnualTaxableIncome.multiply(taxRate).divide(BigDecimal.valueOf(100), 2, RoundingMode.HALF_UP).subtract(quickDeduction);
            salaryRecord.setTotalAnnualTax(totalAnnualTax);
        }
    }

    /**
     * 计算并返回连续的薪资记录列表
     *
     * @param historyRecordList 历史薪资记录列表
     * @param lastMonthCode     最后一个月份，格式yyyy-MM
     * @return
     */
    private List<SalaryRecord> getContinuousSalaryRecords(List<SalaryRecord> historyRecordList, String lastMonthCode) {
        if (CollectionUtils.isEmpty(historyRecordList)) {
            return new ArrayList<>();
        }
        Map<String, SalaryRecord> recordMap = historyRecordList.stream()
                .collect(Collectors.toMap(SalaryRecord::getMonthCode, record -> record));
        if (!recordMap.containsKey(lastMonthCode)) {
            return new ArrayList<>();
        }
        List<SalaryRecord> continuousList = new ArrayList<>();
        String currentMonthCode = lastMonthCode;
        continuousList.add(recordMap.get(currentMonthCode));

        LocalDate lastLocalDate = DateUtil.stringToLocalDate(currentMonthCode + "-01");
        if (!Month.NOVEMBER.equals(lastLocalDate.getMonth())) {
            while (true) {
                currentMonthCode = DateUtil.minusMonth(currentMonthCode, 1);
                if (!recordMap.containsKey(currentMonthCode)) {
                    break;
                }
                continuousList.add(recordMap.get(currentMonthCode));
            }
        }
        return continuousList;
    }

    /**
     * 获取年度应纳税所得额，若结果为负数则返回0
     *
     * @param totalSalary 年度总薪资
     * @param size        计算的月份数量
     * @return
     */
    private BigDecimal getTotalAnnualTaxableIncome(BigDecimal totalSalary, Integer size) {
        BigDecimal taxExemptionLimit = MONTHLY_DEDUCTION.multiply(BigDecimal.valueOf(size));
        BigDecimal taxableIncome = totalSalary.multiply(BigDecimal.valueOf(0.8))
                .subtract(taxExemptionLimit);
        return taxableIncome.compareTo(BigDecimal.ZERO) < 0 ? BigDecimal.ZERO : taxableIncome.setScale(2, RoundingMode.HALF_UP);
    }

    /**
     * 获取纳税等级
     *
     * @param taxableIncome
     * @return
     */
    private JSONObject getTaxBracket(BigDecimal taxableIncome) {
        Map<Integer, JSONObject> taxBracketMap = getTaxBracketMap();
        for (JSONObject bracket : taxBracketMap.values()) {
            if (taxableIncome.compareTo(bracket.getBigDecimal("threshold")) <= 0) {
                return bracket;
            }
        }
        return taxBracketMap.get(1);
    }

    /**
     * 根据技师获取记录
     *
     * @param massagistId
     * @param monthCode   yyyy-MM
     * @return
     */
    private List<SalaryRecord> getSalaryRecordListByMonth(Long massagistId, String monthCode) {
        Map<Long, List<SalaryRecord>> map = getSalaryRecordList(Collections.singletonList(massagistId), monthCode);
        return map.getOrDefault(massagistId, new ArrayList<>());
    }

    /**
     * 根据技师获取记录
     *
     * @param massagistId
     * @param year        yyyy
     * @return
     */
    private List<SalaryRecord> getSalaryRecordListByYear(Long massagistId, String year) {
        Map<Long, List<SalaryRecord>> map = getSalaryRecordList(Collections.singletonList(massagistId), null, year);
        return map.getOrDefault(massagistId, new ArrayList<>());
    }

    /**
     * 根据技师获取记录
     *
     * @param massagistIdList
     * @param monthCode       yyyy-MM
     * @return
     */
    private Map<Long, List<SalaryRecord>> getSalaryRecordList(List<Long> massagistIdList, String monthCode) {
        return getSalaryRecordList(massagistIdList, monthCode, getYearByMonthCode(monthCode));
    }

    /**
     * 根据技师获取记录
     *
     * @param massagistIdList
     * @param monthCode       yyyy-MM
     * @param year            yyyy
     * @return
     */
    private Map<Long, List<SalaryRecord>> getSalaryRecordList(List<Long> massagistIdList, String monthCode, String year) {
        if (CollectionUtils.isEmpty(massagistIdList)) {
            return new HashMap<>();
        }
        LambdaQueryWrapper<SalaryRecord> lqw = new LambdaQueryWrapper<>();
        lqw.in(SalaryRecord::getMassagistId, massagistIdList);
        if (monthCode != null) {
            lqw.le(SalaryRecord::getMonthCode, monthCode);
        }
        if (year != null) {
            lqw.eq(SalaryRecord::getYear, year);
        }
        lqw.orderByAsc(SalaryRecord::getMonthCode);
        return list(lqw).stream().collect(Collectors.groupingBy(SalaryRecord::getMassagistId));
    }

    /**
     * 获取所属年度
     *
     * @param monthCode 月份 yyyy-MM
     * @return
     */
    private String getYearByMonthCode(String monthCode) {
        YearMonth yearMonth = DateUtil.string2YearMonth(monthCode);
        if (yearMonth == null) {
            throw new BusinessException("获取所属年度失败");
        }
        int year = yearMonth.getYear();
        int month = yearMonth.getMonthValue();
        if (month == 12) {
            return String.valueOf(year + 1);
        } else {
            return String.valueOf(year);
        }
    }

}