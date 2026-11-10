<template>
  <div class="page-container">
    <div class="page-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px;">
      <h2 class="page-title">权限管理</h2>
      <a-button v-perm="'rbac:create'" type="primary" @click="openAddRole">添加角色</a-button>
    </div>

    <a-row :gutter="24">
      <!-- 左侧：角色列表 -->
      <a-col :span="8">
        <a-card title="角色列表" :loading="loadingRoles">
          <a-list :data-source="roles" size="small">
            <template #renderItem="{ item }">
              <a-list-item :class="{ 'role-active': selectedRole?.id === item.id }" @click="selectRole(item)" style="cursor: pointer; padding: 12px; border-radius: 8px;">
                <a-list-item-meta :description="roleDesc(item) || '—'">
                  <template #title>
                    <a-space :size="4">
                      <span :title="item.name">{{ roleLabel(item) }}</span>
                      <a-tag v-if="item.isBuiltin" color="gold">内置</a-tag>
                      <a-tag color="blue">{{ scopeName(item.dataScope) }}</a-tag>
                    </a-space>
                  </template>
                </a-list-item-meta>
                <template #actions>
                  <a-tag>{{ item.permissionIds.length }}</a-tag>
                  <a-popconfirm
                    v-if="!item.isBuiltin && auth.hasPerm('rbac:delete')"
                    title="确定删除该角色？"
                    @confirm="handleRemoveRole(item)"
                  >
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
            <a-alert v-if="selectedRole.isBuiltin" type="warning" show-icon style="margin-bottom: 16px">
              <template #message>
                内置角色的权限与数据范围由系统统一维护，不可直接修改。如需调整，请复制为自定义角色后再配置。
              </template>
              <template #action>
                <a-button v-perm="'rbac:create'" size="small" @click="openClone">复制为自定义角色</a-button>
              </template>
            </a-alert>
            <a-alert v-else type="info" style="margin-bottom: 16px">
              <template #message>
                当前已选 {{ effectivePermissionIds.length }} / {{ totalPermCount }} 项权限。修改后点击「保存配置」生效。
              </template>
            </a-alert>

            <a-form layout="vertical">
              <a-form-item label="数据范围（行级）">
                <a-select
                  v-model:value="scopeValue"
                  style="width: 260px"
                  :disabled="selectedRole.isBuiltin || !auth.hasPerm('rbac:scope')"
                >
                  <a-select-option v-for="s in dataScopes" :key="s.value" :value="s.value">
                    {{ s.name }}
                  </a-select-option>
                </a-select>
                <div class="scope-desc">{{ scopeDesc }}</div>
              </a-form-item>
            </a-form>

            <a-input v-model:value="treeFilter" allow-clear placeholder="搜索权限名称或权限码" style="margin-bottom: 12px" />

            <a-tree
              v-model:checkedKeys="checkedKeys"
              v-model:expandedKeys="expandedKeys"
              :tree-data="filteredTree"
              checkable
              :selectable="false"
              :disabled="selectedRole.isBuiltin || !auth.hasPerm('rbac:update')"
            >
              <template #title="node">
                <span>{{ node.title }}</span>
                <a-tag v-if="node.levelName" :color="levelColor[node.level as string]" style="margin-left: 6px">
                  {{ node.levelName }}
                </a-tag>
                <span v-if="node.code" class="perm-code">{{ node.code }}</span>
              </template>
            </a-tree>

            <div style="margin-top: 16px;">
              <a-button
                v-if="!selectedRole.isBuiltin"
                v-perm="'rbac:update'"
                type="primary"
                :loading="savingPerms"
                @click="savePermissions"
              >
                保存配置
              </a-button>
            </div>

            <a-divider>角色成员（{{ roleMembers.length }}）</a-divider>
            <a-space wrap>
              <a-tag
                v-for="admin in roleMembers"
                :key="admin.id"
                :closable="auth.hasPerm('rbac:update')"
                style="padding: 4px 12px;"
                @close="removeMember(admin)"
              >
                {{ admin.name }}（{{ admin.username }}）
              </a-tag>
              <a-button v-perm="'rbac:update'" type="dashed" size="small" @click="openAddMember">+ 添加成员</a-button>
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
        <a-form-item label="数据范围（行级）">
          <a-select v-model:value="newRole.dataScope" :disabled="!auth.hasPerm('rbac:scope')">
            <a-select-option v-for="s in dataScopes" :key="s.value" :value="s.value">{{ s.name }}</a-select-option>
          </a-select>
          <div class="scope-desc">{{ descOf(newRole.dataScope) }}</div>
        </a-form-item>
      </a-form>
    </a-modal>

    <!-- 复制内置角色 -->
    <a-modal v-model:open="showCloneModal" title="复制为自定义角色" :confirm-loading="cloning" @ok="handleClone">
      <a-alert
        type="info"
        show-icon
        style="margin-bottom: 16px"
        message="新角色会继承源角色当前的全部权限与数据范围，创建后可自由增减"
      />
      <a-form layout="vertical">
        <a-form-item label="新角色名称" required>
          <a-input v-model:value="cloneForm.name" placeholder="如：华南区财务" />
        </a-form-item>
        <a-form-item label="角色描述">
          <a-input v-model:value="cloneForm.description" placeholder="不填则自动标注源角色" />
        </a-form-item>
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
import {
  listRoles,
  createRole,
  cloneRole,
  updateRole,
  removeRole,
  getPermissionTree,
  listAdmins,
  updateAdmin,
} from '@/api/rbac'
import type { AdminRow, PermTreeNode, RoleRow } from '@/api/rbac'
import { roleLabel, roleDesc } from '@/utils/role'
import { useAuthStore } from '@/stores/auth'
import type { DataScope } from '@fullyu/shared'

const auth = useAuthStore()

/** 四级粒度的颜色标识，让配权限的人一眼看出这是菜单还是按钮 */
const levelColor: Record<string, string> = {
  MENU: 'blue',
  TAB: 'purple',
  ACTION: 'green',
  FIELD: 'red',
}

const loadingRoles = ref(false)
const roles = ref<RoleRow[]>([])
const admins = ref<AdminRow[]>([])
const permTree = ref<PermTreeNode[]>([])
const dataScopes = ref<{ value: DataScope; name: string; desc: string }[]>([])
const selectedRole = ref<RoleRow | null>(null)
const checkedKeys = ref<string[]>([])
const expandedKeys = ref<string[]>([])
const scopeValue = ref<DataScope>('OWN')
const treeFilter = ref('')

function descOf(scope: DataScope) {
  return dataScopes.value.find((s) => s.value === scope)?.desc || ''
}
function scopeName(scope: DataScope) {
  return dataScopes.value.find((s) => s.value === scope)?.name || scope
}
const scopeDesc = computed(() => descOf(scopeValue.value))

/** 权限点叶子的 key 就是 permission.id，模块/分组节点带前缀，保存时要剔除 */
function collectLeafIds(nodes: PermTreeNode[], out: string[] = []) {
  for (const n of nodes) {
    if (n.children?.length) collectLeafIds(n.children, out)
    else out.push(n.key)
  }
  return out
}
const leafIdSet = computed(() => new Set(collectLeafIds(permTree.value)))
const totalPermCount = computed(() => leafIdSet.value.size)
const effectivePermissionIds = computed(() =>
  checkedKeys.value.filter((k) => leafIdSet.value.has(k)),
)

/** 按关键字过滤权限树，保留命中叶子的祖先链路 */
function filterTree(nodes: PermTreeNode[], kw: string): PermTreeNode[] {
  const result: PermTreeNode[] = []
  for (const n of nodes) {
    if (n.children?.length) {
      const kids = filterTree(n.children, kw)
      if (kids.length) result.push({ ...n, children: kids })
    } else if (
      n.title.toLowerCase().includes(kw) ||
      (n.code || '').toLowerCase().includes(kw)
    ) {
      result.push(n)
    }
  }
  return result
}
const filteredTree = computed(() => {
  const kw = treeFilter.value.trim().toLowerCase()
  if (!kw) return permTree.value
  return filterTree(permTree.value, kw)
})

const roleMembers = computed(() => {
  if (!selectedRole.value) return []
  return admins.value.filter((a) => a.roles.some((r) => r.role?.id === selectedRole.value!.id))
})

const nonMemberOptions = computed(() =>
  admins.value
    .filter((a) => !roleMembers.value.some((m) => m.id === a.id))
    .map((a) => ({ label: `${a.name}（${a.username}）`, value: a.id })),
)

function filterAdminOption(input: string, option: any) {
  return String(option.label || '').toLowerCase().includes(input.toLowerCase())
}

async function loadAll() {
  loadingRoles.value = true
  try {
    const [r, t, a] = await Promise.all([listRoles(), getPermissionTree(), listAdmins()])
    roles.value = r
    permTree.value = t.tree
    dataScopes.value = t.dataScopes
    admins.value = a
    // 默认展开到模块层，权限点太多时全展开会刷屏
    expandedKeys.value = t.tree.map((m) => m.key)
    if (selectedRole.value) {
      const fresh = roles.value.find((x) => x.id === selectedRole.value!.id)
      if (fresh) selectRole(fresh)
    }
  } catch (e) {
    // 错误已由拦截器统一提示
  } finally {
    loadingRoles.value = false
  }
}

function selectRole(role: RoleRow) {
  selectedRole.value = role
  checkedKeys.value = [...role.permissionIds]
  scopeValue.value = role.dataScope
}

const savingPerms = ref(false)
async function savePermissions() {
  if (!selectedRole.value) return
  savingPerms.value = true
  try {
    await updateRole(selectedRole.value.id, {
      permissionIds: effectivePermissionIds.value,
      dataScope: scopeValue.value,
    })
    message.success('配置已保存')
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
const newRole = ref<{ name: string; description: string; dataScope: DataScope }>({
  name: '',
  description: '',
  dataScope: 'OWN',
})

function openAddRole() {
  newRole.value = { name: '', description: '', dataScope: 'OWN' }
  showAddRoleModal.value = true
}

async function handleAddRole() {
  if (!newRole.value.name) {
    message.warning('请填写角色名称')
    return
  }
  creatingRole.value = true
  try {
    await createRole({
      name: newRole.value.name,
      description: newRole.value.description,
      dataScope: newRole.value.dataScope,
    })
    message.success('角色添加成功')
    showAddRoleModal.value = false
    loadAll()
  } catch (e) {
    // 错误已由拦截器统一提示
  } finally {
    creatingRole.value = false
  }
}

// 复制内置角色
const showCloneModal = ref(false)
const cloning = ref(false)
const cloneForm = ref({ name: '', description: '' })

function openClone() {
  if (!selectedRole.value) return
  cloneForm.value = { name: `${selectedRole.value.name}-副本`, description: '' }
  showCloneModal.value = true
}

async function handleClone() {
  if (!selectedRole.value) return
  if (!cloneForm.value.name) {
    message.warning('请填写新角色名称')
    return
  }
  cloning.value = true
  try {
    await cloneRole(selectedRole.value.id, {
      name: cloneForm.value.name,
      description: cloneForm.value.description || undefined,
    })
    message.success('已复制为自定义角色')
    showCloneModal.value = false
    selectedRole.value = null
    loadAll()
  } catch (e) {
    // 错误已由拦截器统一提示
  } finally {
    cloning.value = false
  }
}

async function handleRemoveRole(role: RoleRow) {
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

function adminRoleIds(admin: AdminRow): string[] {
  return admin.roles.map((r) => r.role?.id).filter(Boolean)
}

async function handleAddMember() {
  if (!selectedRole.value || !newMemberId.value) {
    showAddMemberModal.value = false
    return
  }
  const admin = admins.value.find((a) => a.id === newMemberId.value)
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

async function removeMember(admin: AdminRow) {
  if (!selectedRole.value) return
  const roleIds = adminRoleIds(admin).filter((id) => id !== selectedRole.value!.id)
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
.scope-desc {
  margin-top: 4px;
  font-size: 12px;
  color: #999;
}
.perm-code {
  margin-left: 6px;
  font-size: 12px;
  color: #bbb;
}
</style>
