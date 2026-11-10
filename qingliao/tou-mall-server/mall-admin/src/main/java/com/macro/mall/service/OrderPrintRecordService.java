package com.macro.mall.service;

import com.macro.mall.entity.OrderPrintRecord;
import com.macro.mall.mapper.OrderPrintRecordMapper;
import com.macro.mall.service.base.BaseService;
import com.macro.mall.service.impl.UmsAdminServiceImpl;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;

/**
 * 小票打印记录 服务类
 *
 * @author zkl
 * @date 2025/07/02
 */
@Service
public class OrderPrintRecordService extends BaseService<OrderPrintRecordMapper, OrderPrintRecord> {
    @Autowired
    UmsAdminServiceImpl umsAdminService;

    public void addRecord(Long orderId, String printContent, Long shopId) {
        OrderPrintRecord record = new OrderPrintRecord();
        record.setOrderId(orderId);
        record.setContent(printContent);
        record.setCreateUser(umsAdminService.currentId());
        record.setShopId(shopId);
        record.setCreateTime(LocalDateTime.now());
        save(record);
    }
}