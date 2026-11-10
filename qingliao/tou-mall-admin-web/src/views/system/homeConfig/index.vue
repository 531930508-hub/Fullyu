<template>
  <div class="home-config">
    <header class="home-config__head">
      <div>
        <h2 class="home-config__title">首页区块配置</h2>
        <p class="home-config__desc">按角色决定首页展示哪些指标、面板与快捷入口；未保存的角色使用默认方案，疗愈师默认不展示经营收入。</p>
      </div>
      <el-select v-model="roleId" class="home-config__role" placeholder="选择角色" :loading="loading"
                 size="small" @change="handleRoleChange">
        <el-option v-for="role in editableRoles" :key="role.roleId" :label="role.roleName" :value="role.roleId"/>
      </el-select>
    </header>

    <div v-loading="loading" class="home-config__body">
      <template v-if="currentRole">
        <div class="home-config__status">
          <span class="home-config__badge" :class="isCustom ? 'is-custom' : 'is-preset'">
            <i :class="isCustom ? 'el-icon-check' : 'el-icon-magic-stick'"></i>
            {{ isCustom ? '已保存自定义方案' : '当前使用默认方案' }}
          </span>
          <span class="home-config__status-text">
            <template v-if="isCustom && currentRole.updateTime">更新于 {{ formatTime(currentRole.updateTime) }} · </template>
            {{ currentRole.roleName }}默认方案为「{{ presetLabel }}」
          </span>
          <span v-if="dirty" class="home-config__dirty">有未保存的修改</span>
        </div>

        <section class="home-config__section">
          <h3 class="home-config__section-title">指标卡</h3>
          <el-checkbox-group v-model="blocks" class="home-config__grid">
            <el-checkbox v-for="item in kpiBlocks" :key="item.key" :label="item.key" class="home-config__item">
              <span class="home-config__item-label">{{ item.label }}</span>
              <span class="home-config__item-desc">{{ item.desc }}</span>
            </el-checkbox>
          </el-checkbox-group>
        </section>

        <section class="home-config__section">
          <h3 class="home-config__section-title">页面板块</h3>
          <el-checkbox-group v-model="blocks" class="home-config__grid">
            <el-checkbox v-for="item in panelBlocks" :key="item.key" :label="item.key" class="home-config__item">
              <span class="home-config__item-label">{{ item.label }}</span>
              <span class="home-config__item-desc">{{ item.desc }}</span>
            </el-checkbox>
          </el-checkbox-group>
        </section>

        <section class="home-config__section">
          <h3 class="home-config__section-title">快捷入口</h3>
          <p class="home-config__section-hint">勾选后出现在首页「快捷操作」；账号没有对应菜单权限时会自动隐藏。</p>
          <el-checkbox-group v-model="links" class="home-config__grid home-config__grid--links">
            <el-checkbox v-for="item in linkCatalog" :key="item.key" :label="item.key" class="home-config__item">
              <span class="home-config__item-label">
                <i :class="item.icon" class="home-config__link-icon"></i>{{ item.label }}
              </span>
            </el-checkbox>
          </el-checkbox-group>
        </section>

        <footer class="home-config__foot">
          <div class="home-config__preview">
            <span class="home-config__preview-label">预览</span>
            <span v-if="!blocks.length && !links.length" class="home-config__preview-empty">未选择任何区块，首页将只保留问候页头</span>
            <template v-else>
              <span v-for="key in blocks" :key="'b-' + key" class="home-config__chip">{{ blockLabel(key) }}</span>
              <span v-for="key in links" :key="'l-' + key" class="home-config__chip home-config__chip--link">{{ linkLabel(key) }}</span>
            </template>
          </div>
          <div class="home-config__actions">
            <el-button size="small" :disabled="saving || !isCustom" @click="handleReset">恢复默认</el-button>
            <el-button size="small" type="primary" :loading="saving" :disabled="!dirty" @click="handleSave">保存方案</el-button>
          </div>
        </footer>
      </template>

      <div v-else-if="!loading" class="home-config__empty">
        <span class="home-config__empty-mark">愈</span>
        <p>{{ loadError || '暂无可配置的角色' }}</p>
        <el-button v-if="loadError" size="small" @click="loadList">重试</el-button>
      </div>
    </div>
  </div>
</template>

<script>
import { fetchConfigList, saveConfig, resetConfig } from '@/api/homeConfig'
import { HOME_BLOCKS, HOME_LINKS, presetFor } from '@/views/home/catalog'

export default {
  name: 'HomeConfig',
  data() {
    return {
      loading: false,
      saving: false,
      loadError: '',
      roleRows: [],
      roleId: null,
      blocks: [],
      links: [],
      baseline: '',
      linkCatalog: HOME_LINKS
    }
  },
  computed: {
    editableRoles() {
      return this.roleRows.filter(role => role.roleName !== '超级管理员')
    },
    currentRole() {
      return this.roleRows.find(role => role.roleId === this.roleId) || null
    },
    isCustom() {
      return !!(this.currentRole && this.currentRole.config)
    },
    isTherapistRole() {
      return !!this.currentRole && this.currentRole.roleName === '疗愈师'
    },
    presetLabel() {
      return this.isTherapistRole ? '疗愈师 · 服务安排' : '管理岗 · 全量看板'
    },
    kpiBlocks() {
      return HOME_BLOCKS.filter(item => item.group === 'kpi')
    },
    panelBlocks() {
      return HOME_BLOCKS.filter(item => item.group === 'panel')
    },
    dirty() {
      return this.serialize() !== this.baseline
    }
  },
  created() {
    this.loadList()
  },
  methods: {
    async loadList() {
      this.loading = true
      this.loadError = ''
      try {
        const res = await fetchConfigList()
        this.roleRows = res.data || []
        const first = this.editableRoles[0]
        if (first) {
          this.roleId = first.roleId
          this.applyRole(first)
        }
      } catch (e) {
        this.loadError = (e && e.message) || '首页配置加载失败'
        this.roleRows = []
      } finally {
        this.loading = false
      }
    },
    handleRoleChange(value) {
      const row = this.roleRows.find(role => role.roleId === value)
      if (row) this.applyRole(row)
    },
    applyRole(row) {
      const source = row.config || presetFor(row.roleName === '疗愈师')
      this.blocks = (source.blocks || []).slice()
      this.links = (source.links || []).slice()
      this.baseline = this.serialize()
    },
    serialize() {
      return JSON.stringify({ blocks: this.blocks, links: this.links })
    },
    async handleSave() {
      this.saving = true
      try {
        await saveConfig({ roleId: this.roleId, blocks: this.blocks, links: this.links })
        this.$set(this.currentRole, 'config', { blocks: this.blocks.slice(), links: this.links.slice() })
        this.$set(this.currentRole, 'updateTime', new Date().toISOString())
        this.baseline = this.serialize()
        this.$message({ message: '已保存，该角色下次进入首页即生效', type: 'success' })
      } catch (e) {
        this.$message.error((e && e.message) || '保存失败，请重试')
      } finally {
        this.saving = false
      }
    },
    handleReset() {
      this.$confirm('恢复后该角色将使用默认方案，确定恢复吗？', '提示', {
        confirmButtonText: '恢复默认',
        cancelButtonText: '取消',
        type: 'warning'
      }).then(async() => {
        try {
          await resetConfig(this.roleId)
          this.$set(this.currentRole, 'config', null)
          this.$set(this.currentRole, 'updateTime', null)
          this.applyRole(this.currentRole)
          this.$message({ message: '已恢复默认方案', type: 'success' })
        } catch (e) {
          this.$message.error((e && e.message) || '恢复失败，请重试')
        }
      }).catch(() => {})
    },
    blockLabel(key) {
      const found = HOME_BLOCKS.find(item => item.key === key)
      return found ? found.label : key
    },
    linkLabel(key) {
      const found = HOME_LINKS.find(item => item.key === key)
      return found ? found.label : key
    },
    formatTime(value) {
      if (!value) return ''
      const date = new Date(value)
      if (isNaN(date.getTime())) return String(value)
      const pad = num => (num < 10 ? '0' + num : '' + num)
      return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
    }
  }
}
</script>

<style lang="scss" scoped>
@import "src/styles/variables.scss";

.home-config {
  padding: 22px 24px 26px;
  border-radius: $radius-lg;
  background: $surface;
  box-shadow: $shadow-xs;
}

.home-config__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding-bottom: 16px;
  border-bottom: 1px solid $line;
}

.home-config__title {
  margin: 0;
  color: $ink;
  font-size: 16px;
  font-weight: 650;
}

.home-config__desc {
  margin: 6px 0 0;
  max-width: 620px;
  color: $ink-faint;
  font-size: 12.5px;
  line-height: 1.6;
}

.home-config__role {
  width: 180px;
  flex-shrink: 0;
}

.home-config__body {
  min-height: 220px;
}

.home-config__status {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  margin: 16px 0 4px;
}

.home-config__badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 10px;
  border-radius: $radius-pill;
  font-size: 12px;
  font-weight: 600;

  &.is-custom { background: $success-soft; color: $success; }
  &.is-preset { background: $brand-soft; color: $brand; }
}

.home-config__status-text {
  color: $ink-faint;
  font-size: 12px;
}

.home-config__dirty {
  padding: 3px 9px;
  border-radius: $radius-pill;
  background: $warning-soft;
  color: $warning;
  font-size: 11.5px;
  font-weight: 600;
}

.home-config__section {
  margin-top: 18px;
}

.home-config__section-title {
  margin: 0 0 10px;
  color: $ink-secondary;
  font-size: 13px;
  font-weight: 650;
}

.home-config__section-hint {
  margin: -4px 0 10px;
  color: $ink-faint;
  font-size: 12px;
}

.home-config__grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
}

.home-config__grid--links {
  grid-template-columns: repeat(5, minmax(0, 1fr));
}

.home-config__item {
  display: flex;
  align-items: flex-start;
  margin: 0;
  padding: 12px 12px 11px;
  border-radius: $radius-md;
  background: $surface-2;
  transition: background-color .16s ease, box-shadow .16s ease;

  &:hover { background: $brand-soft; }

  &.is-checked {
    background: $brand-soft;
    box-shadow: inset 0 0 0 1px rgba(103, 80, 164, .28);
  }
}

.home-config__item-label {
  display: block;
  color: $ink;
  font-size: 13px;
  font-weight: 600;
  line-height: 1.4;
}

.home-config__item-desc {
  display: block;
  margin-top: 3px;
  color: $ink-faint;
  font-size: 11.5px;
  font-weight: 400;
  line-height: 1.45;
}

.home-config__link-icon {
  margin-right: 5px;
  color: $brand;
}

.home-config__foot {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  margin-top: 22px;
  padding-top: 16px;
  border-top: 1px solid $line;
}

.home-config__preview {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  min-width: 0;
}

.home-config__preview-label {
  margin-right: 2px;
  color: $ink-faint;
  font-size: 12px;
}

.home-config__preview-empty {
  color: $ink-faint;
  font-size: 12px;
}

.home-config__chip {
  padding: 3px 9px;
  border-radius: $radius-pill;
  background: $bg-deep;
  color: $ink-secondary;
  font-size: 11.5px;

  &--link {
    background: $gold-soft;
    color: $gold;
  }
}

.home-config__actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

.home-config__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 56px 20px;
  color: $ink-faint;
  font-size: 13px;

  p { margin: 0; }
}

.home-config__empty-mark {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: $brand-soft;
  color: $brand;
  font-size: 18px;
  font-weight: 600;
}

@media (max-width: 1280px) {
  .home-config__grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .home-config__grid--links { grid-template-columns: repeat(3, minmax(0, 1fr)); }
}

@media (max-width: 768px) {
  .home-config__head { flex-direction: column; }
  .home-config__grid,
  .home-config__grid--links { grid-template-columns: minmax(0, 1fr); }
  .home-config__foot { flex-direction: column; align-items: stretch; }
  .home-config__actions { justify-content: flex-end; }
}
</style>

<!-- vue-loader 13 不支持 ::v-deep，checkbox 内部排版用非 scoped 块 -->
<style lang="scss">
@import "src/styles/variables.scss";

.home-config__item.el-checkbox {
  white-space: normal;

  .el-checkbox__input {
    margin-top: 2px;
    white-space: nowrap;
  }

  .el-checkbox__label {
    padding-left: 8px;
    white-space: normal;
    line-height: 1.4;
  }

  .el-checkbox__inner {
    border-color: $line-strong;
    border-radius: 5px;
  }

  &.is-checked .el-checkbox__inner {
    background: $brand;
    border-color: $brand;
  }

  &.is-checked .el-checkbox__label {
    color: $ink;
  }
}
</style>