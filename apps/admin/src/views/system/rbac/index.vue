<template>
  <div class="page-container">
    <div class="page-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px;">
      <h2 class="page-title">权限管理</h2>
      <a-button type="primary" @click="openAddRole">添加角色</a-button>
    </div>

    <a-row :gutter="24">
      <!-- 左侧：角色列表 -->
      <a-col :span="8">
        <a-card title="角色列表" :loading="loadingRoles">
          <a-list :data-source="roles" size="small">
            <template #renderItem="{ item }">
              <a-list-item :class="{ 'role-active': selectedRole?.id === item.id }" @click="selectRole(item)" style="cursor: pointer; padding: 12px; border-radius: 8px;">
                <a-list-item-meta :title="item.name" :description="item.description || '—'" />
                <template #actions>
                  <a-tag>{{ (item.permissions || []).length }} 权限</a-tag>
                  <a-popconfirm title="确定删除该角色？" @confirm="handleRemoveRole(item)">
                    <a style="color: #C0392B;" @click.stop>删除</a>
                  </a-popconfirm>
                </template>
              </a-list-item>
            </template>
          </a-list>
        </a-card>
      </a-col>

      <!-- 右侧：权限配置 -->
      <a-col :span="16">
        <a-card :title="selectedRole ? `${selectedRole.name} - 权限配置` : '请选择角色'">
          <template v-if="selectedRole">
            <a-alert type="info" style="margin-bottom: 16px">
              <template #message>
                勾选权限后点击「保存权限」生效。当前已选 {{ effectivePermissionIds.length }} 项权限。
              </template>
            </a-alert>

            <a-tree
              v-model:checkedKeys="checkedKeys"
              :tree-data="permissionTree"
              checkable
              default-expand-all
              :field-names="{ title: 'title', key: 'key', children: 'children' }"
            />

            <div style="margin-top: 16px;">
              <a-button type="primary" :loading="savingPerms" @click="savePermissions">保存权限</a-button>
            </div>

            <a-divider>角色成员</a-divider>
            <a-space wrap>
              <a-tag v-for="admin in roleMembers" :key="admin.id" closable style="padding: 4px 12px;" @close="removeMember(admin)">
                {{ admin.name }}（{{ admin.username }}）
              </a-tag>
              <a-button type="dashed" size="small" @click="openAddMember">+ 添加成员</a-button>
            </a-space>
          </template>
          <a-empty v-else description="请从左侧选择角色查看权限" />
        </a-card>
      </a-col>
    </a-row>

    <!-- 添加角色 -->
    <a-modal v-model:open="showAddRoleModal" title="添加角色" :confirm-loading="creatingRole" @ok="handleAddRole">
      <a-form layout="vertical">
        <a-form-item label="角色名称" required><a-input v-model:value="newRole.name" placeholder="如：运营主管" /></a-form-item>
        <a-form-item label="角色描述"><a-input v-model:value="newRole.description" placeholder="描述该角色的职责范围" /></a-form-item>
      </a-form>
    </a-modal>

    <!-- 添加成员 -->
    <a-modal v-model:open="showAddMemberModal" title="添加成员" @ok="handleAddMember">
      <a-select v-model:value="newMemberId" style="width: 100%" placeholder="选择管理员" show-search :filter-option="filterAdminOption" :options="nonMemberOptions" />
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { message } from 'ant-design-vue'
import { listRoles, createRole, updateRole, removeRole, listPermissions, listAdmins, updateAdmin } from '@/api/rbac'

const moduleLabels: Record<string, string> = { education: '教务管理', sales: '销售管理', system: '系统管理' }

const loadingRoles = ref(false)
const roles = ref<any[]>([])
const permissions = ref<any[]>([])
const admins = ref<any[]>([])
const selectedRole = ref<any>(null)
const checkedKeys = ref<string[]>([])

// 权限点 ID 集合（用于从 checkedKeys 中过滤掉模块父节点 key）
const permissionIdSet = computed(() => new Set(permissions.value.map((p: any) => p.id)))
const effectivePermissionIds = computed(() => checkedKeys.value.filter(k => permissionIdSet.value.has(k)))

// 按 module 分组构建两级权限树
const permissionTree = computed(() => {
  const groups: Record<string, any[]> = {}
  permissions.value.forEach((p: any) => {
    const mod = p.module || 'other'
    if (!groups[mod]) groups[mod] = []
    groups[mod].push({ title: `${p.name}（${p.code}）`, key: p.id })
  })
  return Object.keys(groups).map(mod => ({
    title: moduleLabels[mod] || mod,
    key: `module:${mod}`,
    children: groups[mod],
  }))
})

const roleMembers = computed(() => {
  if (!selectedRole.value) return []
  return admins.value.filter((a: any) => (a.roles || []).some((r: any) => r.role?.id === selectedRole.value.id))
})

const nonMemberOptions = computed(() =>
  admins.value
    .filter((a: any) => !roleMembers.value.some((m: any) => m.id === a.id))
    .map((a: any) => ({ label: `${a.name}（${a.username}）`, value: a.id }))
)

function filterAdminOption(input: string, option: any) {
  return String(option.label || '').toLowerCase().includes(input.toLowerCase())
}

async function loadAll() {
  loadingRoles.value = true
  try {
    const [r, p, a] = await Promise.all([listRoles(), listPermissions(), listAdmins()])
    roles.value = Array.isArray(r) ? r : (r?.list || [])
    permissions.value = Array.isArray(p) ? p : (p?.list || [])
    admins.value = Array.isArray(a) ? a : (a?.list || [])
    if (selectedRole.value) {
      const fresh = roles.value.find((x: any) => x.id === selectedRole.value.id)
      if (fresh) selectRole(fresh)
    }
  } catch (e) {
    // 错误已由拦截器统一提示
  } finally {
    loadingRoles.value = false
  }
}

function selectRole(role: any) {
  selectedRole.value = role
  checkedKeys.value = (role.permissions || []).map((rp: any) => rp.permission?.id).filter(Boolean)
}

const savingPerms = ref(false)
async function savePermissions() {
  if (!selectedRole.value) return
  savingPerms.value = true
  try {
    await updateRole(selectedRole.value.id, { permissionIds: effectivePermissionIds.value })
    message.success('权限已保存')
    loadAll()
  } catch (e) {
    // 错误已由拦截器统一提示
  } finally {
    savingPerms.value = false
  }
}

// 添加角色
const showAddRoleModal = ref(false)
const creatingRole = ref(false)
const newRole = ref({ name: '', description: '' })

function openAddRole() {
  newRole.value = { name: '', description: '' }
  showAddRoleModal.value = true
}

async function handleAddRole() {
  if (!newRole.value.name) {
    message.warning('请填写角色名称')
    return
  }
  creatingRole.value = true
  try {
    await createRole({ name: newRole.value.name, description: newRole.value.description })
    message.success('角色添加成功')
    showAddRoleModal.value = false
    loadAll()
  } catch (e) {
    // 错误已由拦截器统一提示
  } finally {
    creatingRole.value = false
  }
}

async function handleRemoveRole(role: any) {
  try {
    await removeRole(role.id)
    message.success('角色已删除')
    if (selectedRole.value?.id === role.id) selectedRole.value = null
    loadAll()
  } catch (e) {
    // 错误已由拦截器统一提示
  }
}

// 成员管理（通过 updateAdmin 的 roleIds 增减）
const showAddMemberModal = ref(false)
const newMemberId = ref<string | undefined>(undefined)

function openAddMember() {
  newMemberId.value = undefined
  showAddMemberModal.value = true
}

function adminRoleIds(admin: any): string[] {
  return (admin.roles || []).map((r: any) => r.role?.id).filter(Boolean)
}

async function handleAddMember() {
  if (!selectedRole.value || !newMemberId.value) {
    showAddMemberModal.value = false
    return
  }
  const admin = admins.value.find((a: any) => a.id === newMemberId.value)
  if (!admin) return
  const roleIds = Array.from(new Set([...adminRoleIds(admin), selectedRole.value.id]))
  try {
    await updateAdmin(admin.id, { roleIds })
    message.success(`${admin.name} 已加入 ${selectedRole.value.name}`)
    showAddMemberModal.value = false
    loadAll()
  } catch (e) {
    // 错误已由拦截器统一提示
  }
}

async function removeMember(admin: any) {
  if (!selectedRole.value) return
  const roleIds = adminRoleIds(admin).filter((id: string) => id !== selectedRole.value.id)
  try {
    await updateAdmin(admin.id, { roleIds })
    message.success(`${admin.name} 已移出 ${selectedRole.value.name}`)
    loadAll()
  } catch (e) {
    // 错误已由拦截器统一提示
  }
}

onMounted(() => loadAll())
</script>

<style scoped>
.role-active {
  background: #faf5f0 !important;
  border-left: 3px solid #6B463C;
}
</style>
