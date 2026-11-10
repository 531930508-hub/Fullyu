package com.macro.mall.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.macro.mall.common.exception.BusinessException;
import com.macro.mall.entity.AdminTodo;
import com.macro.mall.mapper.AdminTodoMapper;
import com.macro.mall.service.base.BaseService;
import com.github.pagehelper.PageHelper;
import com.github.pagehelper.PageInfo;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 门店待办服务。
 *
 * <p>待办按门店共享：任一员工创建，本门店所有员工可见；完成时记录操作人与时间。</p>
 *
 * @date 2026/11/07
 */
@Service
public class AdminTodoService extends BaseService<AdminTodoMapper, AdminTodo> {

    private static final DateTimeFormatter TIME_FORMAT = DateTimeFormatter.ofPattern("HH:mm");
    private static final DateTimeFormatter DAY_FORMAT = DateTimeFormatter.ofPattern("MM月dd日");

    @Override
    protected QueryWrapper<AdminTodo> buildWrapper(Map<String, Object> params, QueryWrapper<AdminTodo> queryWrapper) {
        queryWrapper.orderByDesc("create_time");
        return queryWrapper;
    }

    /**
     * 首页悬浮卡数据：待完成全部 + 近 7 天已完成。
     */
    public Map<String, Object> panel(Long shopId) {
        if (shopId == null || shopId <= 0) {
            throw new BusinessException("请先选择门店");
        }
        LocalDateTime now = LocalDateTime.now();
        List<AdminTodo> pending = list(new LambdaQueryWrapper<AdminTodo>()
                .eq(AdminTodo::getShopId, shopId)
                .eq(AdminTodo::getStatus, AdminTodo.STATUS_PENDING)
                .orderByAsc(AdminTodo::getCreateTime));
        pending.forEach(item -> decorate(item, now));

        List<AdminTodo> done = list(new LambdaQueryWrapper<AdminTodo>()
                .eq(AdminTodo::getShopId, shopId)
                .eq(AdminTodo::getStatus, AdminTodo.STATUS_DONE)
                .ge(AdminTodo::getCompleteTime, now.minusDays(7))
                .orderByDesc(AdminTodo::getCompleteTime)
                .last("limit 50"));
        done.forEach(item -> decorate(item, now));

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("pending", pending);
        result.put("done", done);
        result.put("pendingCount", pending.size());
        result.put("doneCount", done.size());
        return result;
    }

    /**
     * 待办记录：按状态与时间范围分页，供记录弹窗使用。
     */
    public Map<String, Object> records(Map<String, Object> params) {
        Long shopId = toLong(params.get("shopId"));
        if (shopId == null || shopId <= 0) {
            throw new BusinessException("请先选择门店");
        }
        int page = parseInt(params.get("page"), 1);
        int size = parseInt(params.get("size"), 50);
        int days = parseInt(params.get("days"), 7);
        LambdaQueryWrapper<AdminTodo> lqw = new LambdaQueryWrapper<>();
        lqw.eq(AdminTodo::getShopId, shopId);
        Object status = params.get("status");
        if (status != null && !"".equals(status.toString())) {
            lqw.eq(AdminTodo::getStatus, Integer.valueOf(status.toString()));
        }
        LocalDateTime from = LocalDateTime.now().minusDays(days);
        lqw.and(w -> w.ge(AdminTodo::getCreateTime, from)
                .or()
                .ge(AdminTodo::getCompleteTime, from));
        lqw.orderByDesc(AdminTodo::getCreateTime);
        PageHelper.startPage(page, size);
        List<AdminTodo> list = list(lqw);
        PageInfo<AdminTodo> pageInfo = new PageInfo<>(list);
        LocalDateTime now = LocalDateTime.now();
        pageInfo.getList().forEach(item -> decorate(item, now));
        Map<String, Object> result = new HashMap<>();
        result.put("list", pageInfo.getList());
        result.put("total", pageInfo.getTotal());
        result.put("pageNum", pageInfo.getPageNum());
        result.put("pageSize", pageInfo.getPageSize());
        return result;
    }

    public long pendingCount(Long shopId) {
        if (shopId == null || shopId <= 0) {
            return 0;
        }
        return count(new LambdaQueryWrapper<AdminTodo>()
                .eq(AdminTodo::getShopId, shopId)
                .eq(AdminTodo::getStatus, AdminTodo.STATUS_PENDING));
    }

    @Transactional(rollbackFor = Exception.class)
    public AdminTodo add(Map<String, Object> params, Long operatorId, String operatorName) {
        Long shopId = toLong(params.get("shopId"));
        if (shopId == null || shopId <= 0) {
            throw new BusinessException("请先选择门店");
        }
        Object content = params.get("content");
        if (content == null || content.toString().trim().isEmpty()) {
            throw new BusinessException("请填写待办内容");
        }
        if (content.toString().trim().length() > 500) {
            throw new BusinessException("待办内容不能超过 500 字");
        }
        AdminTodo todo = new AdminTodo();
        todo.setShopId(shopId);
        todo.setContent(content.toString().trim());
        todo.setStatus(AdminTodo.STATUS_PENDING);
        todo.setCreatorId(operatorId);
        todo.setCreatorName(operatorName);
        save(todo);
        decorate(todo, LocalDateTime.now());
        return todo;
    }

    @Transactional(rollbackFor = Exception.class)
    public AdminTodo complete(Long id, Long operatorId, String operatorName) {
        if (id == null) {
            throw new BusinessException("请选择待办");
        }
        AdminTodo todo = getById(id);
        if (todo == null) {
            throw new BusinessException("待办不存在");
        }
        if (todo.getStatus() != null && todo.getStatus() == AdminTodo.STATUS_DONE) {
            throw new BusinessException("该待办已完成");
        }
        todo.setStatus(AdminTodo.STATUS_DONE);
        todo.setCompleteId(operatorId);
        todo.setCompleteName(operatorName);
        todo.setCompleteTime(LocalDateTime.now());
        updateById(todo);
        decorate(todo, LocalDateTime.now());
        return todo;
    }

    /**
     * 撤销完成，仅用于误操作纠正。
     */
    @Transactional(rollbackFor = Exception.class)
    public AdminTodo reopen(Long id) {
        AdminTodo todo = getById(id);
        if (todo == null) {
            throw new BusinessException("待办不存在");
        }
        todo.setStatus(AdminTodo.STATUS_PENDING);
        todo.setCompleteId(null);
        todo.setCompleteName(null);
        todo.setCompleteTime(null);
        updateById(todo);
        decorate(todo, LocalDateTime.now());
        return todo;
    }

    private void decorate(AdminTodo todo, LocalDateTime now) {
        todo.setOverdue(todo.getStatus() != null && todo.getStatus() == AdminTodo.STATUS_PENDING
                && todo.getCreateTime() != null
                && todo.getCreateTime().toLocalDate().isBefore(LocalDate.now()));
        todo.setCreateTimeText(timeText(todo.getCreateTime(), now));
        todo.setCompleteTimeText(timeText(todo.getCompleteTime(), now));
    }

    private String timeText(LocalDateTime time, LocalDateTime now) {
        if (time == null) {
            return "";
        }
        if (time.toLocalDate().equals(now.toLocalDate())) {
            return "今日 " + time.format(TIME_FORMAT);
        }
        if (time.toLocalDate().equals(now.toLocalDate().minusDays(1))) {
            return "昨日 " + time.format(TIME_FORMAT);
        }
        return time.format(DAY_FORMAT) + " " + time.format(TIME_FORMAT);
    }

    private Long toLong(Object value) {
        if (value == null || value.toString().trim().isEmpty()) {
            return null;
        }
        try {
            return Long.valueOf(value.toString().trim());
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private int parseInt(Object value, int defaultValue) {
        if (value == null) {
            return defaultValue;
        }
        try {
            return Integer.parseInt(value.toString());
        } catch (NumberFormatException e) {
            return defaultValue;
        }
    }
}
