<template>
  <div class="page-container">
    <div class="page-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px;">
      <div>
        <h2 class="page-title">系统用户</h2>
        <div style="color: #7D665C; font-size: 13px; margin-top: 4px;">管理后台登录账号（管理员），可新增、编辑、分配角色、停用/启用、重置密码</div>
      </div>
      <a-button v-perm="'rbac:create'" type="primary" @click="openAdd">+ 新增系统用户</a-button>
    </div>

    <a-table
      :columns="columns"
      :data-source="admins"
      :loading="loading"
      row-key="id"
      :pagination="false"
      :scroll="{ x: 1250 }"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.dataIndex === 'org'">
          <span v-if="record.org">{{ record.org.shortName }}</span>
          <a-tag v-else color="gold">集团级</a-tag>
        </template>
        <template v-if="column.dataIndex === 'roles'">
          <a-space wrap>
            <a-tooltip v-for="r in (record.roles || [])" :key="r.role.id" :title="r.role.name">
            <a-tag color="#6B463C">{{ roleLabel(r.role) }}</a-tag>
          </a-tooltip>
            <span v-if="!(record.roles || []).length" style="color: #999;">—</span>
          </a-space>
        </template>
        <template v-if="column.dataIndex === 'isActive'">
          <a-tag :color="record.isActive ? 'green' : 'red'">{{ record.isActive ? '启用' : '停用' }}</a-tag>
        </template>
        <template v-if="column.dataIndex === 'createdAt'">{{ formatTime(record.createdAt) }}</template>
        <template v-if="column.dataIndex === 'action'">
          <a-space>
            <a v-perm="'rbac:update'" @click="openEdit(record)">编辑</a>
            <a v-perm="'rbac:update'" @click="openResetPwd(record)">重置密码</a>
            <a-popconfirm
              v-perm="'rbac:update'"
              :title="record.isActive ? '确认停用该账号？' : '确认启用该账号？'"
              @confirm="toggleActive(record)"
            >
              <a :style="{ color: record.isActive ? '#C0392B' : '#27AE60' }">{{ record.isActive ? '停用' : '启用' }}</a>
            </a-popconfirm>
          </a-space>
        </template>
      </template>
    </a-table>

    <!-- 新增/编辑弹窗 -->
    <a-modal
      v-model:open="modalVisible"
      :title="editing ? '编辑系统用户' : '新增系统用户'"
      :confirm-loading="saving"
      @ok="submit"
    >
      <a-form layout="vertical">
        <a-form-item label="手机号（即登录账号）" :required="!legacyLogin">
          <a-input v-model:value="form.phone" :maxlength="11" placeholder="11 位手机号，用作登录账号" />
          <div v-if="legacyLogin" style="margin-top: 4px; color: #999; font-size: 12px">
            该账号仍用旧用户名「{{ legacyUsername }}」登录；留空则不变，填入手机号后将改为手机号登录。
          </div>
        </a-form-item>
        <a-form-item v-if="!editing" label="初始密码" required>
          <a-input-password v-model:value="form.password" :placeholder="pwdHint" />
          <div class="form-tip">测试阶段默认 123456，可自行修改</div>
        </a-form-item>
        <a-form-item label="姓名" required>
          <a-input v-model:value="form.name" placeholder="真实姓名/昵称" />
        </a-form-item>
        <a-form-item label="归属组织">
          <a-select
            v-model:value="form.orgId"
            placeholder="不选则为集团级账号（仅全局范围管理员可留空）"
            style="width: 100%"
            allow-clear
            show-search
            option-filter-prop="label"
            :options="orgOptions"
          />
          <div class="form-tip">归属组织决定该账号的行级可见范围基点，与角色上的数据范围共同生效</div>
        </a-form-item>
        <a-form-item label="分配角色">
          <a-select
            v-model:value="form.roleIds"
            mode="multiple"
            placeholder="选择角色"
            style="width: 100%"
            :options="roleOptions"
          />
          <div class="form-tip">无法授予比自己数据范围更大、或含有自己不具备权限的角色</div>
        </a-form-item>
      </a-form>
    </a-modal>

    <!-- 重置密码弹窗 -->
    <a-modal
      v-model:open="pwdVisible"
      title="重置密码"
      :confirm-loading="pwdSaving"
      @ok="submitResetPwd"
    >
      <a-form layout="vertical">
        <a-form-item :label="`为「${pwdTarget?.name || ''}」设置新密码`" required>
          <a-input-password v-model:value="newPassword" :placeholder="pwdHint" />
        </a-form-item>
      </a-form>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { message } from 'ant-design-vue'
import { listAdmins, createAdmin, updateAdmin, listRoles } from '@/api/rbac'
import { listOrgOptions } from '@/api/org'
import { roleLabel } from '@/utils/role'
import {
  currentPasswordHint,
  loadPasswordPolicy,
  validatePassword,
} from '@/utils/password-policy'
import type { OrgOption } from '@/api/org'

const columns = [
  { title: '登录账号（手机号）', dataIndex: 'username', width: 170 },
  { title: '姓名', dataIndex: 'name', width: 140 },
  { title: '归属组织', dataIndex: 'org', width: 140 },
  { title: '角色', dataIndex: 'roles', width: 220 },
  { title: '状态', dataIndex: 'isActive', width: 90 },
  { title: '创建时间', dataIndex: 'createdAt', width: 180 },
  { title: '操作', dataIndex: 'action', width: 200, fixed: 'right' },
]

const loading = ref(false)
const admins = ref<any[]>([])
const roles = ref<any[]>([])
const orgs = ref<OrgOption[]>([])
const roleOptions = computed(() => roles.value.map((r: any) => ({ value: r.id, label: r.name })))
const orgOptions = computed(() =>
  orgs.value.map((o) => ({ value: o.id, label: `${o.shortName}（${o.code}）` })),
)

const modalVisible = ref(false)
const editing = ref(false)
const saving = ref(false)
const currentId = ref('')
/** 存量非手机号账号（如 admin）：编辑时不强制要手机号，否则连角色都改不了 */
const legacyLogin = ref(false)
const legacyUsername = ref('')
/** 测试阶段所有账号统一初始密码，新建时直接预填，仍可手改 */
const DEFAULT_INIT_PASSWORD = '123456'
const isPhone = (v: string) => /^1[3-9]\d{9}$/.test((v || '').trim())
const form = ref<any>({ password: DEFAULT_INIT_PASSWORD, name: '', phone: '', orgId: undefined, roleIds: [] })

const pwdVisible = ref(false)
const pwdSaving = ref(false)
const pwdTarget = ref<any>(null)
const newPassword = ref('')
/** 密码强度提示按后端策略显示，测试阶段关掉策略后不再误导使用者 */
const pwdHint = ref(currentPasswordHint())

function formatTime(t: string) {
  if (!t) return '—'
  return new Date(t).toLocaleString('zh-CN', { hour12: false })
}

/**
 * 三个请求分开 catch：之前放在同一个 Promise.all 里，只要组织选项或角色任一失败
 * （例如旧 token、权限不足），整个列表就静默变空，看起来像用户被清空了。
 * 用户列表是主体，它失败才报错；辅助选项拉不到只影响下拉框。
 */
async function load() {
  loading.value = true
  try {
    const adminData: any = await listAdmins()
    admins.value = Array.isArray(adminData) ? adminData : []
  } catch (e: any) {
    message.error(e?.message || '加载系统用户失败')
  } finally {
    loading.value = false
  }
  const [roleData, orgData] = await Promise.all([
    listRoles().catch(() => []),
    listOrgOptions().catch(() => []),
  ])
  roles.value = Array.isArray(roleData) ? roleData : []
  orgs.value = Array.isArray(orgData) ? orgData : []
}

function openAdd() {
  editing.value = false
  currentId.value = ''
  legacyLogin.value = false
  legacyUsername.value = ''
  form.value = { password: DEFAULT_INIT_PASSWORD, name: '', phone: '', orgId: undefined, roleIds: [] }
  modalVisible.value = true
}

function openEdit(record: any) {
  editing.value = true
  currentId.value = record.id
  legacyLogin.value = !isPhone(record.username)
  legacyUsername.value = record.username
  form.value = {
    password: '',
    name: record.name,
    // 登录名就是手机号；旧账号的 username 不是手机号，就不往输入框里塞
    phone: record.phone || (isPhone(record.username) ? record.username : ''),
    orgId: record.orgId || undefined,
    roleIds: (record.roles || []).map((r: any) => r.role.id),
  }
  modalVisible.value = true
}

async function submit() {
  const phone = (form.value.phone || '').trim()
  // 旧账号允许留空（保留原登录名），其余情形手机号必填且需合法
  if (!(legacyLogin.value && !phone) && !isPhone(phone)) {
    message.warning('请填写正确的 11 位手机号（即登录账号）')
    return
  }
  if (!editing.value) {
    const reason = validatePassword(form.value.password)
    if (reason) { message.warning(reason); return }
  }
  if (!form.value.name) { message.warning('请填写姓名'); return }
  saving.value = true
  try {
    if (editing.value) {
      await updateAdmin(currentId.value, {
        name: form.value.name,
        // 留空时不下发，避免把旧账号的登录名改掉
        phone: phone || undefined,
        orgId: form.value.orgId ?? null,
        roleIds: form.value.roleIds,
      })
      message.success('系统用户已更新')
    } else {
      await createAdmin({
        // 登录名不再自定义，后端以手机号为准
        username: phone,
        password: form.value.password,
        name: form.value.name,
        phone,
        orgId: form.value.orgId ?? null,
        roleIds: form.value.roleIds,
      })
      message.success('系统用户已创建')
    }
    modalVisible.value = false
    load()
  } catch (e: any) {
    message.error(e?.message || '保存失败')
  } finally {
    saving.value = false
  }
}

async function toggleActive(record: any) {
  try {
    await updateAdmin(record.id, { isActive: !record.isActive })
    message.success(record.isActive ? '已停用' : '已启用')
    load()
  } catch (e: any) {
    message.error(e?.message || '操作失败')
  }
}

function openResetPwd(record: any) {
  pwdTarget.value = record
  newPassword.value = DEFAULT_INIT_PASSWORD
  pwdVisible.value = true
}

async function submitResetPwd() {
  const reason = validatePassword(newPassword.value)
  if (reason) { message.warning(reason); return }
  pwdSaving.value = true
  try {
    await updateAdmin(pwdTarget.value.id, { password: newPassword.value })
    message.success('密码已重置')
    pwdVisible.value = false
  } catch (e: any) {
    message.error(e?.message || '重置失败')
  } finally {
    pwdSaving.value = false
  }
}

onMounted(async () => {
  load()
  await loadPasswordPolicy()
  pwdHint.value = currentPasswordHint()
})
</script>

<style scoped>
.form-tip {
  margin-top: 4px;
  font-size: 12px;
  color: #999;
}
</style>
