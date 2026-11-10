package com.macro.mall.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.macro.mall.common.exception.BusinessException;
import com.macro.mall.mapper.HomeConfigMapper;
import com.macro.mall.model.UmsRole;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.Arrays;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/**
 * 首页角色区块配置：仅超级管理员可维护；保存前校验区块/快捷入口键；
 * mine 按角色顺序取第一个已保存方案，未保存返回 null 由前端落默认预设。
 */
class HomeConfigServiceTest {
    HomeConfigMapper mapper;
    UmsAdminService admins;
    UmsRoleService roles;
    HomeConfigService service;
    final ObjectMapper json = new ObjectMapper();

    @BeforeEach
    void setup() {
        mapper = mock(HomeConfigMapper.class);
        admins = mock(UmsAdminService.class);
        roles = mock(UmsRoleService.class);
        service = new HomeConfigService();
        ReflectionTestUtils.setField(service, "homeConfigMapper", mapper);
        ReflectionTestUtils.setField(service, "adminService", admins);
        ReflectionTestUtils.setField(service, "roleService", roles);
    }

    UmsRole role(Long id, String name) {
        UmsRole r = new UmsRole();
        r.setId(id);
        r.setName(name);
        return r;
    }

    void superAdmin() {
        when(admins.getRoleList(1L)).thenReturn(Collections.singletonList(role(5L, "超级管理员")));
    }

    @Test
    void saveRequiresSuperAdmin() {
        when(admins.getRoleList(9L)).thenReturn(Collections.singletonList(role(9L, "店长")));
        BusinessException ex = assertThrows(BusinessException.class,
                () -> service.save(9L, 9L, Arrays.asList("schedule"), Arrays.asList("board")));
        assertTrue(ex.getMessage().contains("超级管理员"));
        verify(mapper, never()).save(anyLong(), anyString());
    }

    @Test
    void saveRejectsUnknownBlockKey() {
        superAdmin();
        BusinessException ex = assertThrows(BusinessException.class,
                () -> service.save(1L, 9L, Arrays.asList("kpiRevenue", "bogusBlock"), Collections.emptyList()));
        assertTrue(ex.getMessage().contains("未识别"));
        verify(mapper, never()).save(anyLong(), anyString());
    }

    @Test
    void saveRejectsUnknownLinkKey() {
        superAdmin();
        BusinessException ex = assertThrows(BusinessException.class,
                () -> service.save(1L, 9L, Collections.emptyList(), Arrays.asList("board", "bogusLink")));
        assertTrue(ex.getMessage().contains("未识别"));
        verify(mapper, never()).save(anyLong(), anyString());
    }

    @Test
    void saveRejectsMissingRole() {
        superAdmin();
        when(roles.list()).thenReturn(Collections.singletonList(role(9L, "店长")));
        BusinessException ex = assertThrows(BusinessException.class,
                () -> service.save(1L, 99L, Arrays.asList("schedule"), Collections.emptyList()));
        assertTrue(ex.getMessage().contains("角色不存在"));
        verify(mapper, never()).save(anyLong(), anyString());
    }

    @Test
    void savePersistsDedupedOrderedKeys() throws Exception {
        superAdmin();
        when(roles.list()).thenReturn(Collections.singletonList(role(9L, "店长")));
        service.save(1L, 9L, Arrays.asList("quick", "kpiOrders", "quick"), Arrays.asList("board", "leave", "board"));
        ArgumentCaptor<String> payload = ArgumentCaptor.forClass(String.class);
        verify(mapper, times(1)).save(eq(9L), payload.capture());
        Map<?, ?> saved = json.readValue(payload.getValue(), Map.class);
        assertEquals(Arrays.asList("quick", "kpiOrders"), saved.get("blocks"));
        assertEquals(Arrays.asList("board", "leave"), saved.get("links"));
    }

    @Test
    void mineReturnsFirstSavedRoleConfig() throws Exception {
        when(admins.getRoleList(7L)).thenReturn(Arrays.asList(role(9L, "店长"), role(10L, "财务")));
        when(mapper.config(9L)).thenReturn(null);
        when(mapper.config(10L)).thenReturn("{\"blocks\":[\"schedule\"],\"links\":[\"board\"]}");
        Map<String, Object> mine = service.mine(7L);
        assertEquals(Boolean.FALSE, mine.get("superAdmin"));
        assertEquals(2, ((List<?>) mine.get("roles")).size());
        Map<?, ?> config = (Map<?, ?>) mine.get("config");
        assertNotNull(config);
        assertEquals(Arrays.asList("schedule"), config.get("blocks"));
    }

    @Test
    void mineWithoutSavedConfigReturnsNull() {
        when(admins.getRoleList(7L)).thenReturn(Collections.singletonList(role(6L, "疗愈师")));
        when(mapper.config(6L)).thenReturn(null);
        Map<String, Object> mine = service.mine(7L);
        assertNull(mine.get("config"));
        assertEquals(Boolean.FALSE, mine.get("superAdmin"));
    }

    @Test
    void mineFlagsSuperAdmin() {
        superAdmin();
        when(mapper.config(5L)).thenReturn(null);
        assertEquals(Boolean.TRUE, service.mine(1L).get("superAdmin"));
    }

    @Test
    void listRequiresSuperAdmin() {
        when(admins.getRoleList(9L)).thenReturn(Collections.singletonList(role(9L, "店长")));
        assertThrows(BusinessException.class, () -> service.list(9L));
    }

    @Test
    void listMergesAllRolesWithSavedConfigs() {
        superAdmin();
        when(roles.list()).thenReturn(Arrays.asList(role(9L, "店长"), role(10L, "财务")));
        Map<String, Object> row = new HashMap<>();
        row.put("roleId", 10L);
        row.put("configJson", "{\"blocks\":[\"todo\"],\"links\":[]}");
        when(mapper.all()).thenReturn(Collections.singletonList(row));
        List<Map<String, Object>> list = service.list(1L);
        assertEquals(2, list.size());
        assertEquals(9L, list.get(0).get("roleId"));
        assertEquals("店长", list.get(0).get("roleName"));
        assertNull(list.get(0).get("config"));
        assertNotNull(list.get(1).get("config"));
        assertEquals(Arrays.asList("todo"), ((Map<?, ?>) list.get(1).get("config")).get("blocks"));
    }

    @Test
    void resetRequiresSuperAdmin() {
        when(admins.getRoleList(9L)).thenReturn(Collections.singletonList(role(9L, "店长")));
        assertThrows(BusinessException.class, () -> service.reset(9L, 9L));
        verify(mapper, never()).delete(anyLong());
    }

    @Test
    void resetDeletesSavedConfig() {
        superAdmin();
        service.reset(1L, 9L);
        verify(mapper, times(1)).delete(9L);
    }
}