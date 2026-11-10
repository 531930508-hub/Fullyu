package com.macro.mall.crm;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.macro.mall.bo.AdminUserDetails;
import com.macro.mall.common.api.CommonResult;
import com.macro.mall.common.exception.BusinessException;
import com.macro.mall.entity.Customer;
import com.macro.mall.service.CustomerService;
import io.swagger.annotations.Api;
import io.swagger.annotations.ApiOperation;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 会员中心（CRM）管理入口：把轻疗已有客户导入为 CRM 会员身份。
 *
 * <p>仅后台管理员可调用；只同步身份，不迁移本地积分（积分以 CRM 为唯一账本）。</p>
 */
@RestController
@RequestMapping("/customer/crm")
@Api(tags = "会员中心对接")
@Slf4j
public class CrmController {
    private static final int MAX_BATCH = 500;
    private static final int MAX_TOTAL = 20000;

    @Autowired
    private CustomerService customerService;

    @Autowired
    private CrmSyncService crmSyncService;

    @Autowired
    private CrmProperties crmProperties;

    @GetMapping("/status")
    @ApiOperation("会员中心对接状态")
    public CommonResult status() {
        requireAdmin();
        Map<String, Object> data = new HashMap<>();
        data.put("enabled", crmProperties.isActive());
        data.put("baseUrl", crmProperties.getBaseUrl());
        data.put("timeoutMs", crmProperties.getTimeoutMs());
        return CommonResult.success(data);
    }

    @PostMapping("/import")
    @ApiOperation("把轻疗客户按 id 升序分批导入会员中心")
    public CommonResult importCustomers(@RequestParam(defaultValue = "500") Integer batchSize,
                                        @RequestParam(required = false) Long startId,
                                        @RequestParam(defaultValue = "20000") Integer maxTotal,
                                        @RequestParam(defaultValue = "false") boolean includeBalance) {
        requireAdmin();
        if (!crmSyncService.isActive()) {
            throw new BusinessException("会员中心未开启，请先配置 crm.base-url 等参数");
        }
        int size = batchSize == null ? MAX_BATCH : batchSize;
        if (size < 1 || size > MAX_BATCH) {
            throw new BusinessException("batchSize 需在 1-" + MAX_BATCH + " 之间");
        }
        int totalLimit = maxTotal == null ? MAX_TOTAL : maxTotal;
        if (totalLimit < 1 || totalLimit > MAX_TOTAL) {
            throw new BusinessException("maxTotal 需在 1-" + MAX_TOTAL + " 之间");
        }

        long cursor = startId == null ? 0L : startId;
        int submitted = 0;
        CrmImportResult summary = new CrmImportResult();
        while (submitted < totalLimit) {
            int limit = Math.min(size, totalLimit - submitted);
            QueryWrapper<Customer> wrapper = new QueryWrapper<>();
            wrapper.gt("id", cursor).orderByAsc("id").last("limit " + limit);
            List<Customer> customers = customerService.list(wrapper);
            if (customers == null || customers.isEmpty()) {
                break;
            }
            CrmImportResult batch = crmSyncService.importBatch(customers, includeBalance);
            summary.add(batch);
            submitted += customers.size();
            cursor = customers.get(customers.size() - 1).getId();
            if (customers.size() < limit) {
                break;
            }
        }
        summary.setSubmitted(submitted);

        Map<String, Object> data = new HashMap<>();
        data.put("submitted", summary.getSubmitted());
        data.put("created", summary.getCreated());
        data.put("bound", summary.getBound());
        data.put("unchanged", summary.getUnchanged());
        data.put("migratedMembers", summary.getMigratedMembers());
        data.put("migratedPoints", summary.getMigratedPoints());
        data.put("failed", summary.getFailed());
        data.put("nextStartId", cursor);
        log.info("轻疗客户导入会员中心完成，提交 {} 条，新建 {}，绑定 {}，已存在 {}，迁移积分 {} 人/{} 分，失败 {}",
                summary.getSubmitted(), summary.getCreated(), summary.getBound(), summary.getUnchanged(),
                summary.getMigratedMembers(), summary.getMigratedPoints(), summary.getFailed().size());
        return CommonResult.success(data);
    }

    /**
     * 客户 token 与后台 token 共用请求头，这里必须校验主体确实是后台管理员，
     * 防止小程序端调用导入接口。
     */
    private void requireAdmin() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication != null && authentication.getPrincipal() instanceof AdminUserDetails) {
            AdminUserDetails details = (AdminUserDetails) authentication.getPrincipal();
            if (details.getUmsAdmin() != null && details.getUmsAdmin().getId() != null) {
                return;
            }
        }
        throw new BusinessException("仅后台管理员可执行该操作", 403);
    }
}
