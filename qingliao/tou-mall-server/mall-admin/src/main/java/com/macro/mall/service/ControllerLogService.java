package com.macro.mall.service;

import com.macro.mall.entity.ControllerLog;
import com.macro.mall.mapper.ControllerLogMapper;
import com.macro.mall.service.base.BaseService;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

/**
 * 操作记录 服务类
 *
 * @author ST
 * @date 2025/07/03
 */
@Service
public class ControllerLogService extends BaseService<ControllerLogMapper, ControllerLog> {

    @Async("ppzAsync")
    public void add(ControllerLog log) {
        save(log);
    }
}