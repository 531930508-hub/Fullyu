package com.macro.mall.service.serviceStatistics;

import cn.hutool.core.util.ObjUtil;
import com.alibaba.excel.EasyExcel;
import com.alibaba.excel.ExcelWriter;
import com.alibaba.excel.support.ExcelTypeEnum;
import com.alibaba.excel.write.handler.WriteHandler;
import com.alibaba.excel.write.metadata.WriteSheet;
import com.alibaba.excel.write.metadata.fill.FillConfig;
import com.alibaba.excel.write.metadata.fill.FillWrapper;
import com.alibaba.fastjson2.JSONObject;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.github.pagehelper.PageHelper;
import com.github.pagehelper.PageInfo;
import com.macro.mall.common.exception.BusinessException;
import com.macro.mall.dto.OperatingRevenueDto;
import com.macro.mall.dto.SalaryRecordDto;
import com.macro.mall.dto.SalaryRecordNewDto;
import com.macro.mall.dto.ServiceDurationDto;
import com.macro.mall.entity.*;
import com.macro.mall.enums.AdjustType;
import com.macro.mall.enums.OrderState;
import com.macro.mall.enums.OrderType;
import com.macro.mall.enums.approval.FlowCategoryCode;
import com.macro.mall.mapper.PayoutMapper;
import com.macro.mall.service.*;
import com.macro.mall.service.base.BaseService;
import com.macro.mall.service.base.WrapperBuilder;
import com.macro.mall.service.shop.ShopService;
import com.macro.mall.utils.DateUtil;
import com.macro.mall.utils.ExcelUtil;
import lombok.Cleanup;
import org.apache.logging.log4j.util.Strings;
import org.apache.poi.ss.usermodel.Workbook;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Service;
import org.springframework.util.CollectionUtils;
import org.springframework.util.StringUtils;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

import javax.servlet.http.HttpServletResponse;
import java.io.*;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.net.URLEncoder;
import java.time.LocalDate;
import java.util.*;
import java.util.stream.Collectors;

/**
 * @author zkl on 2025/6/13
 */
@Service
public class PayoutService extends BaseService<PayoutMapper, payout> {
    @Autowired
    @Lazy
    OrderDetailService orderDetailService;
    @Autowired
    MassagistService massagistService;
    @Autowired
    AdjustService adjustService;
    @Autowired
    OrderService orderService;
    @Autowired
    ShopService shopService;
    @Autowired
    MassagistSchedulesService massagistSchedulesService;
    @Autowired
    SalaryRecordService salaryRecordService;
    @Autowired
    StatisticsService statisticsService;
    @Override
    protected QueryWrapper<payout> buildWrapper(Map<String, Object> params, QueryWrapper<payout> queryWrapper) {
        if(params.get("month_number")!=null) {
            LocalDate monthNumber = LocalDate.parse(params.get("month_number").toString());
            //monthNumber 增加一月
            LocalDate monthEnd=monthNumber.plusMonths(1);
            queryWrapper.ge("dtime", monthNumber);
            queryWrapper.lt("dtime", monthEnd);
        }
        if(params.get("shop_id_arr_new")!=null) {
            int[] shopIdArrNew = (int[])params.get("shop_id_arr_new");
            List<Long> shopIdArrNewList = Arrays.stream(shopIdArrNew).mapToObj(Long::valueOf) .collect(Collectors.toList());
            queryWrapper.in("shop_id",shopIdArrNewList);
        }
        return WrapperBuilder.init(queryWrapper, params)
                .equal("create_time")
                .getQueryWrapper();
    }

    public payout add(payout objpayout) {
        objpayout.setCreateTime(DateUtil.string2DateTime(DateUtil.nowString()));
        save(objpayout);

        return objpayout;
    }
    public PageInfo pageInfo(Map<String, Object> params) {
        PageInfo<payout> page = page(params);
        return page;
    }

    public Object topAlldata(Map<String, Object> params) {
        LambdaQueryWrapper<payout> lambdaQueryWrapper = new LambdaQueryWrapper();
        if (params.get("shopIdArrNew") != null) {
            int[] shopIdArrNew = (int[]) params.get("shopIdArrNew");
            List<Long> shopIdArrNewList = Arrays.stream(shopIdArrNew).mapToObj(Long::valueOf).collect(Collectors.toList());
            lambdaQueryWrapper.in(payout::getShopId, shopIdArrNewList);
        }else{
            List<Long> shopid= shopService.list().stream().map(Shop::getId).collect(Collectors.toList());
            int i=0;
        }
        LocalDate monthNumber = LocalDate.parse(params.get("monthNumber").toString());
        //monthNumber 增加一月
        LocalDate monthEnd = monthNumber.plusMonths(1);
        lambdaQueryWrapper.ge(payout::getDtime, monthNumber);
        lambdaQueryWrapper.lt(payout::getDtime, monthEnd);
        List<payout> listPayout = list(lambdaQueryWrapper);

        //支出
        double payoutMoneyPriceSum = listPayout.stream()
                .mapToDouble(payout::getMoneyprice)
                .sum();
        List<Long> shopIdList=new ArrayList<>();
        if (params.get("shopIdArrNew") != null) {
            int[] shopIdArrNew = (int[]) params.get("shopIdArrNew");
            shopIdList = Arrays.stream(shopIdArrNew).mapToObj(Long::valueOf).collect(Collectors.toList());
        }else{
            shopIdList= shopService.list().stream().map(Shop::getId).collect(Collectors.toList());
        }
        Long serviceCountNew=0L;
        double totalWorkingHoursNew=0L;
        BigDecimal totalAmountNew = BigDecimal.ZERO;
        BigDecimal totalActualAmountNew = BigDecimal.ZERO;
        BigDecimal actualIncomeNew = BigDecimal.ZERO;
        if(params.get("shopIdArrNew") != null) {

            for (int i = 0; i < shopIdList.size(); i++) {
                long shopId = shopIdList.get(i);
                // 服务次数与工时统一走 StatisticsService：与薪资口径一致，并包含接待工时封顶
                List<JSONObject> resultList = statisticsService.serviceDuration(shopId,
                        monthNumber.toString(), monthEnd.toString(), null);
                long serviceCount = resultList.stream().mapToInt(e -> e.getInteger("serviceCount")).sum();
                double totalWorkingHours = resultList.stream().mapToDouble(e -> e.getDoubleValue("totalWorkingHours")).sum();

                //预收款和实际收入
                OperatingRevenueDto operatingRevenueDto = new OperatingRevenueDto();
                operatingRevenueDto.setShopId(shopId);
                operatingRevenueDto.setStartPayTime(monthNumber.toString());
                operatingRevenueDto.setEndPayTime(monthEnd.toString());
                JSONObject jsonObjectOperatingRevenueDto = orderService.operatingRevenueTop(operatingRevenueDto);
                BigDecimal totalAmount = jsonObjectOperatingRevenueDto.getBigDecimal("totalAmount");
                BigDecimal totalActualAmount = jsonObjectOperatingRevenueDto.getBigDecimal("totalActualAmount");

                //疗愈师薪资总和
                List<Massagist> massagistList = massagistService.listByShopId(shopId, null);
                BigDecimal actualIncome = BigDecimal.ZERO;
                for (Massagist massagist : massagistList) {
                    try {
                        SalaryRecord salaryRecord = salaryRecordService.findMassagistSalaryRecord(massagist.getId(), DateUtil.toYYYYMM(monthNumber));
                        if (!Objects.isNull(salaryRecord)) {
                            actualIncome = actualIncome.add(salaryRecord.getActualIncome());
                        }
                    } catch (Exception e) {
                        continue;
                    }
                }
                serviceCountNew += serviceCount;
                totalWorkingHoursNew += totalWorkingHours;
                totalAmountNew = totalAmountNew.add(totalAmount);
                totalActualAmountNew = totalActualAmountNew.add(totalActualAmount);
                actualIncomeNew = actualIncomeNew.add(actualIncome);
            }
        }else{
            List<Massagist> massagistList = massagistService.listByShopId(null, null);
            // 服务次数与工时统一走 StatisticsService：与薪资口径一致，并包含接待工时封顶
            List<JSONObject> resultList = statisticsService.serviceDuration(null,
                    monthNumber.toString(), monthEnd.toString(), null);
            long serviceCount = resultList.stream().mapToInt(e -> e.getInteger("serviceCount")).sum();
            double totalWorkingHours = resultList.stream().mapToDouble(e -> e.getDoubleValue("totalWorkingHours")).sum();

            //预收款和实际收入
            OperatingRevenueDto operatingRevenueDto = new OperatingRevenueDto();
            operatingRevenueDto.setShopId(null);
            operatingRevenueDto.setStartPayTime(monthNumber.toString());
            operatingRevenueDto.setEndPayTime(monthEnd.toString());
            JSONObject jsonObjectOperatingRevenueDto = orderService.operatingRevenueTop(operatingRevenueDto);
            BigDecimal totalAmount = jsonObjectOperatingRevenueDto.getBigDecimal("totalAmount");
            BigDecimal totalActualAmount = jsonObjectOperatingRevenueDto.getBigDecimal("totalActualAmount");

            //疗愈师薪资总和
            BigDecimal actualIncome = BigDecimal.ZERO;
            for (Massagist massagist : massagistList) {
                try {
                    SalaryRecord salaryRecord = salaryRecordService.findMassagistSalaryRecord(massagist.getId(), DateUtil.toYYYYMM(monthNumber));
                    if (!Objects.isNull(salaryRecord)) {
                        actualIncome = actualIncome.add(salaryRecord.getActualIncome());
                    }
                } catch (Exception e) {
                    continue;
                }
            }
            serviceCountNew += serviceCount;
            totalWorkingHoursNew += totalWorkingHours;
            totalAmountNew = totalAmountNew.add(totalAmount);
            totalActualAmountNew = totalActualAmountNew.add(totalActualAmount);
            actualIncomeNew = actualIncomeNew.add(actualIncome);
        }

        //疗愈师薪资占实际收入的%
        BigDecimal percentage = BigDecimal.ZERO;
        if (totalActualAmountNew.compareTo(BigDecimal.ZERO) != 0) {
            // 3. 计算逻辑：(疗愈师薪资 / 实际收入) * 100
            // divide 的第二个参数 "4" 代表保留 4 位小数
            // BigDecimal.ROUND_HALF_UP 代表四舍五入
            percentage = actualIncomeNew
                    .divide(totalActualAmountNew, 4, BigDecimal.ROUND_HALF_UP)
                    .multiply(new BigDecimal("100"));
        }

        //毛利
        BigDecimal maoliPrice = BigDecimal.ZERO;
        BigDecimal payoutMoneyPriceSumBD = new BigDecimal(String.valueOf(payoutMoneyPriceSum));
        maoliPrice = totalActualAmountNew.subtract(actualIncomeNew).subtract(payoutMoneyPriceSumBD);


        Map<String, Object> map = new HashMap<>();
        map.put("payoutMoneyPriceSum", payoutMoneyPriceSum);//支出总和
        map.put("serviceCount", serviceCountNew);//服务次数
        map.put("totalWorkingHours", totalWorkingHoursNew);//疗愈师总时长
        map.put("totalAmount", totalAmountNew);//预收入
        map.put("totalActualAmount", totalActualAmountNew);//实际收入
        map.put("actualIncome", actualIncomeNew);//疗愈师薪资总和
        map.put("percentage", percentage);//疗愈师薪资占实际收入的%
        map.put("maoliPrice", maoliPrice);//疗愈师薪资占实际收入的%
        return map;
    }

    public void operatingRevenueXinZiExport(Map<String, Object> params) throws IOException {

        HttpServletResponse response = ((ServletRequestAttributes) RequestContextHolder.getRequestAttributes()).getResponse();
        response.setContentType("application/vnd.ms-excel");
        LocalDate date= LocalDate.now();
        ;
        String filename="Full愈"+DateUtil.toMMDD(date).replace("-","");
        if (Strings.isNotBlank("Full愈0310")) {
            response.setHeader("Access-Control-Expose-Headers", "Content-Disposition");

            response.setHeader("Content-Disposition", "attachment;filename=" + URLEncoder.encode(filename, "utf-8")+".xlsx");
        }
        @Cleanup OutputStream out = response.getOutputStream();
        // 1.写入文件方式
        String filePath = "D:\\1\\Full愈0310.xlsx";//src/main/resources/static/Full愈0310.xlsx
       // InputStream templateFile = new FileInputStream(filePath);
       // InputStream templateFile = PayoutService.class.getResourceAsStream("/static/Full愈0806.xlsx");
        InputStream templateFile = PayoutService.class.getResourceAsStream("/static/Full愈0310.xlsx");
        //String targetFile = "D:\\test.xlsx";
        ExcelWriter excelWriter = EasyExcel.write(out,SalaryRecordNewDto.class).withTemplate(templateFile).inMemory(true).build();

        WriteSheet sheet = EasyExcel.writerSheet().build();
        // 当前日期
        HashMap<String, String> dateMap = new HashMap<String, String>();
        dateMap.put("filename",filename);
        //填充单个字段信息
        excelWriter.fill(dateMap,sheet);
        //换行填充
        FillConfig fillConfig = FillConfig.builder().forceNewRow(true).build();

        List<SalaryRecordNewDto> teacherInfoList=new ArrayList();

        List<Long> shopIdList=new ArrayList<>();
        if (params.get("shopIdArrNew") != null) {
            int[] shopIdArrNew = (int[]) params.get("shopIdArrNew");
            shopIdList = Arrays.stream(shopIdArrNew).mapToObj(Long::valueOf).collect(Collectors.toList());
        }else{
            shopIdList= shopService.list().stream().map(Shop::getId).collect(Collectors.toList());
        }
        LocalDate monthNumber = LocalDate.parse(params.get("monthNumber").toString());
        List<SalaryRecordDto> salaryRecordDtoList = new ArrayList<>();
        for (int i = 0; i < shopIdList.size(); i++) {
            long shopId = shopIdList.get(i);
            List<Massagist> massagistList = massagistService.listByShopId(shopId, null);
            for (Massagist massagist : massagistList) {
                try {
                    SalaryRecord salaryRecord = salaryRecordService.findMassagistSalaryRecord(massagist.getId(), DateUtil.toYYYYMM(monthNumber));
                    SalaryRecordNewDto teacher2=SalaryRecordNewDto.builder()
                            .massagistName(massagist.getRealName())
                            .massagistCard(massagist.getBankCard())
                            .massagistRealName(massagist.getRealName())
                            .massagistMobile(massagist.getPhone())
                            .massagistSfzCard(massagist.getSfzCard())
                            .webName("云账户APP/云账户微信助手小程序")
                            .actualIncome(salaryRecord.getPreTaxIncome()
                                    .setScale(2, RoundingMode.HALF_UP)
                                    .doubleValue())
                            .build();
                    teacherInfoList.add(teacher2);
                } catch (Exception e) {
                    continue;
                }
            }
        }

      /*  SalaryRecordNewDto teacher2=SalaryRecordNewDto.builder()
                .massagistName("张竹")
                .massagistCard("611124")
                .massagistRealName("张竹")
                .massagistMobile("1348270")
                .massagistSfzCard("41424")
                .webName("云账户APP/云账户微信助手小程序")
                .actualIncome(123.00)
                .build();
        SalaryRecordNewDto teacher3=SalaryRecordNewDto.builder()
                .massagistName("张竹")
                .massagistCard("611124")
                .massagistRealName("张竹")
                .massagistMobile("1348270")
                .massagistSfzCard("41424")
                .webName("云账户APP/云账户微信助手小程序")
                .actualIncome(123.00)
                .build();
        SalaryRecordNewDto teacher4=SalaryRecordNewDto.builder()
                .massagistName("张竹")
                .massagistCard("611124")
                .massagistRealName("张竹")
                .massagistMobile("1348270")
                .massagistSfzCard("41424")
                .webName("云账户APP/云账户微信助手小程序")
                .actualIncome(123.00)
                .build();

        teacherInfoList.add(teacher2);
        teacherInfoList.add(teacher3);
        teacherInfoList.add(teacher4);*/
        excelWriter.fill(new FillWrapper("user",teacherInfoList),fillConfig ,sheet);
        Workbook workbook = excelWriter.writeContext().writeWorkbookHolder().getWorkbook();
        workbook.getCreationHelper().createFormulaEvaluator().evaluateAll();
        //结束填充
        excelWriter.finish();




       /* List<Long> shopIdList=new ArrayList<>();
        if (params.get("shopIdArrNew") != null) {
            int[] shopIdArrNew = (int[]) params.get("shopIdArrNew");
            shopIdList = Arrays.stream(shopIdArrNew).mapToObj(Long::valueOf).collect(Collectors.toList());
        }else{
            shopIdList= shopService.list().stream().map(Shop::getId).collect(Collectors.toList());
        }
        LocalDate monthNumber = LocalDate.parse(params.get("monthNumber").toString());
        List<SalaryRecordDto> salaryRecordDtoList = new ArrayList<>();
        for (int i = 0; i < shopIdList.size(); i++) {
            long shopId = shopIdList.get(i);
            List<Massagist> massagistList = massagistService.listByShopId(shopId, null);
            for (Massagist massagist : massagistList) {
                try {
                    SalaryRecord salaryRecord = salaryRecordService.findMassagistSalaryRecord(massagist.getId(), DateUtil.toYYYYMM(monthNumber));
                    SalaryRecordDto salaryRecordDto = new SalaryRecordDto();
                    salaryRecordDto.setMassagistName(massagist.getName());
                    salaryRecordDto.setMassagistRealName(massagist.getRealName());
                    salaryRecordDto.setMassagistMobile(massagist.getPhone());
                    salaryRecordDto.setMassagistSfzCard(massagist.getSfzCard());
                    salaryRecordDto.setSalary(salaryRecord.getSalary().toString());
                    salaryRecordDto.setOtherAmount(salaryRecord.getOtherAmount().toString());
                    salaryRecordDto.setPreTaxIncome(salaryRecord.getPreTaxIncome().toString());
                    salaryRecordDto.setPreDeduction(salaryRecord.getPreDeduction().toString());
                    salaryRecordDto.setPreDeductionReturned(salaryRecord.getPreDeductionReturned().toString());
                    salaryRecordDto.setPayableIncomeTax(salaryRecord.getPayableIncomeTax().toString());
                    salaryRecordDto.setActualIncome(salaryRecord.getActualIncome().toString());
                    salaryRecordDtoList.add(salaryRecordDto);
                } catch (Exception e) {
                    continue;
                }
            }
        }
        //ExcelUtil.doReadExcelMapList("",0,0)
        ExcelUtil.export(salaryRecordDtoList, SalaryRecordDto.class, "疗愈师薪资.xlsx");*/
    }



}
