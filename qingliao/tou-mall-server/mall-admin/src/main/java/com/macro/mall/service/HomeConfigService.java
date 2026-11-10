package com.macro.mall.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.macro.mall.common.exception.BusinessException;
import com.macro.mall.mapper.HomeConfigMapper;
import com.macro.mall.model.UmsRole;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;

/**
 * 首页角色区块配置。
 *
 * <p>每个角色可保存一份 {blocks,links} 方案；未保存的角色由前端落默认预设
 * （疗愈师默认不展示今日收入等经营区块）。仅超级管理员可维护，
 * 因为未注册 URL 在安全配置中只要求登录，权限必须在这里显式校验。</p>
 */
@Service
public class HomeConfigService {

    /** 首页区块键，与前端 home/index.vue 的 block 定义一一对应 */
    public static final List<String> BLOCK_KEYS = Arrays.asList(
            "kpiRevenue", "kpiOrders", "kpiCustomers", "kpiPending",
            "schedule", "todo", "quick", "projects");

    /** 快捷入口键，与前端首页快捷入口目录一一对应 */
    public static final List<String> LINK_KEYS = Arrays.asList(
            "board", "customer", "shiftCenter", "leave", "statisticsOverview",
            "orderCenter", "product", "incentiveCenter", "salaryDetail", "todo");

    @Autowired
    private HomeConfigMapper homeConfigMapper;

    @Autowired
    private UmsAdminService adminService;

    @Autowired
    private UmsRoleService roleService;

    private final ObjectMapper json = new ObjectMapper();

    public boolean isSuperAdmin(Long adminId) {
        return hasSuperRole(adminService.getRoleList(adminId));
    }

    private boolean hasSuperRole(List<UmsRole> roles) {
        if (roles == null) {
            return false;
        }
        for (UmsRole role : roles) {
            if (role.getName() != null && "超级管理员".equals(role.getName().trim())) {
                return true;
            }
        }
        return false;
    }

    private void requireSuperAdmin(Long adminId) {
        if (!isSuperAdmin(adminId)) {
            throw new BusinessException("仅超级管理员可配置首页区块");
        }
    }

    /** 当前账号的首页方案：按角色顺序取第一个已保存配置，未保存返回 null */
    public Map<String, Object> mine(Long adminId) {
        List<UmsRole> roles = adminService.getRoleList(adminId);
        List<Map<String, Object>> roleItems = new ArrayList<>();
        Map<String, Object> config = null;
        if (roles != null) {
            for (UmsRole role : roles) {
                Map<String, Object> item = new HashMap<>();
                item.put("id", role.getId());
                item.put("name", role.getName());
                roleItems.add(item);
                if (config == null) {
                    config = parse(homeConfigMapper.config(role.getId()));
                }
            }
        }
        Map<String, Object> result = new HashMap<>();
        result.put("superAdmin", hasSuperRole(roles));
        result.put("roles", roleItems);
        result.put("config", config);
        return result;
    }

    /** 全部角色 + 已保存方案，供首页配置页使用 */
    public List<Map<String, Object>> list(Long adminId) {
        requireSuperAdmin(adminId);
        Map<Long, Map<String, Object>> saved = new HashMap<>();
        List<Map<String, Object>> rows = homeConfigMapper.all();
        if (rows != null) {
            for (Map<String, Object> row : rows) {
                Object rawId = row.get("roleId");
                if (rawId instanceof Number) {
                    Map<String, Object> entry = new HashMap<>();
                    entry.put("config", parse((String) row.get("configJson")));
                    entry.put("updateTime", row.get("updateTime"));
                    saved.put(((Number) rawId).longValue(), entry);
                }
            }
        }
        List<Map<String, Object>> result = new ArrayList<>();
        List<UmsRole> roles = roleService.list();
        if (roles != null) {
            for (UmsRole role : roles) {
                Map<String, Object> item = new HashMap<>();
                item.put("roleId", role.getId());
                item.put("roleName", role.getName());
                Map<String, Object> entry = saved.get(role.getId());
                item.put("config", entry == null ? null : entry.get("config"));
                item.put("updateTime", entry == null ? null : entry.get("updateTime"));
                result.add(item);
            }
        }
        return result;
    }

    /** 保存角色方案：校验键名、去重保序后落库 */
    public void save(Long adminId, Long roleId, List<String> blocks, List<String> links) {
        requireSuperAdmin(adminId);
        if (roleId == null) {
            throw new BusinessException("请选择角色");
        }
        List<String> cleanBlocks = sanitize(blocks, BLOCK_KEYS, "首页区块");
        List<String> cleanLinks = sanitize(links, LINK_KEYS, "快捷入口");
        boolean exists = false;
        List<UmsRole> roles = roleService.list();
        if (roles != null) {
            for (UmsRole role : roles) {
                if (roleId.equals(role.getId())) {
                    exists = true;
                    break;
                }
            }
        }
        if (!exists) {
            throw new BusinessException("角色不存在");
        }
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("blocks", cleanBlocks);
        payload.put("links", cleanLinks);
        try {
            homeConfigMapper.save(roleId, json.writeValueAsString(payload));
        } catch (BusinessException e) {
            throw e;
        } catch (Exception e) {
            throw new BusinessException("首页配置保存失败", e);
        }
    }

    /** 恢复默认：删除已保存方案，前端重新落预设 */
    public void reset(Long adminId, Long roleId) {
        requireSuperAdmin(adminId);
        if (roleId == null) {
            throw new BusinessException("请选择角色");
        }
        homeConfigMapper.delete(roleId);
    }

    private List<String> sanitize(List<String> values, List<String> allowed, String label) {
        LinkedHashSet<String> result = new LinkedHashSet<>();
        if (values != null) {
            for (String value : values) {
                if (value == null) {
                    continue;
                }
                String key = value.trim();
                if (key.isEmpty()) {
                    continue;
                }
                if (!allowed.contains(key)) {
                    throw new BusinessException(label + "配置包含未识别项：" + key);
                }
                result.add(key);
            }
        }
        return new ArrayList<>(result);
    }

    /** 脏数据不阻断首页：解析失败按未保存处理 */
    private Map<String, Object> parse(String raw) {
        if (raw == null || raw.trim().isEmpty()) {
            return null;
        }
        try {
            return json.readValue(raw, Map.class);
        } catch (Exception e) {
            return null;
        }
    }
}