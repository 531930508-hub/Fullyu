<template>
  <div class="menu-wrapper">
    <template v-for="item in routes">
      <template v-if="!item.hidden && item.children">
        <router-link
          v-if="showAsSingle(item)"
          :to="singlePath(item)"
          :key="'single-' + itemPath(item)"
          class="menu-link">
          <el-menu-item :index="singlePath(item)" :class="{'submenu-title-noDropdown': !isNest}"
                        :title="singleTitle(item)">
            <svg-icon :icon-class="singleIcon(item)" aria-hidden="true"></svg-icon>
            <span v-if="singleTitle(item)" slot="title">
              {{ singleTitle(item) }}
              <span class="todo-count-badge"
                    v-if="singleBadge(item) === 'todo' && todoCount > 0">{{ todoCount > 99 ? '99+' : todoCount }}</span>
            </span>
          </el-menu-item>
        </router-link>

        <el-submenu v-else :index="itemPath(item)" :key="'group-' + itemPath(item)" class="menu-group">
          <template slot="title">
            <svg-icon :icon-class="groupIcon(item)" aria-hidden="true"></svg-icon>
            <span v-if="item.meta&&item.meta.title" slot="title" class="menu-group__title">{{ item.meta.title }}</span>
          </template>

          <el-menu-item-group
            v-for="block in childBlocks(item)"
            :key="'block-' + itemPath(item) + '-' + (block.title || 'plain')"
            class="menu-block"
            :class="{'menu-block--plain': !block.title}">
            <div v-if="block.title" slot="title" class="menu-block__title">{{ block.title }}</div>

            <template v-for="child in block.items">
              <sidebar-item
                v-if="child.children && child.children.length > 0"
                :key="'nest-' + resolveChild(item, child.path)"
                :is-nest="true"
                class="nest-menu"
                :routes="[child]"
                :base-path="itemPath(item)"></sidebar-item>

              <!--支持外链功能-->
              <a v-else-if="child.path.startsWith('http')" :href="child.path" target="_blank"
                 rel="noopener noreferrer" :key="'out-' + (child.name || child.path)" class="menu-link">
                <el-menu-item :index="resolveChild(item, child.path)">
                  <svg-icon :icon-class="childIcon(child)" aria-hidden="true"></svg-icon>
                  <span v-if="child.meta&&child.meta.title" slot="title">{{ child.meta.title }}</span>
                </el-menu-item>
              </a>

              <router-link v-else :to="resolveChild(item, child.path)" :key="'in-' + (child.name || child.path)"
                           class="menu-link">
                <el-menu-item :index="resolveChild(item, child.path)">
                  <svg-icon :icon-class="childIcon(child)" aria-hidden="true"></svg-icon>
                  <span v-if="child.meta&&child.meta.title" slot="title">{{ child.meta.title }}</span>
                </el-menu-item>
              </router-link>
            </template>
          </el-menu-item-group>
        </el-submenu>
      </template>
    </template>
  </div>
</template>

<script>
import { mapGetters } from 'vuex'
import { resolveNavIcon } from '@/icons/nav'

export default {
  name: 'SidebarItem',
  props: {
    routes: {
      type: Array
    },
    isNest: {
      type: Boolean,
      default: false
    },
    // 父级已解析出来的路径，子路由支持绝对路径（/staff/xxx）与相对路径（xxx）混用
    basePath: {
      type: String,
      default: ''
    }
  },
  computed: {
    ...mapGetters(['todoCount'])
  },
  methods: {
    joinPath(base, sub) {
      if (!sub) return base || '/'
      if (/^https?:\/\//.test(sub) || sub.indexOf('/') === 0) return sub
      if (!base) return '/' + sub
      return base.replace(/\/$/, '') + '/' + sub
    },
    itemPath(item) {
      return this.joinPath(this.basePath, item.path)
    },
    resolvePath(subPath) {
      return this.joinPath(this.basePath, subPath)
    },
    // 子菜单相对「当前 item」解析，兼容任意层级的相对路径
    resolveChild(item, childPath) {
      return this.joinPath(this.itemPath(item), childPath)
    },
    // 按 meta.subGroup 把子菜单分段，段内保持权限排序
    childBlocks(item) {
      const blocks = []
      ;(item.children || []).forEach(child => {
        if (child.hidden) return
        const title = (child.meta && child.meta.subGroup) || ''
        let block = blocks[blocks.length - 1]
        if (!block || block.title !== title) {
          block = { title: title, items: [] }
          blocks.push(block)
        }
        block.items.push(child)
      })
      return blocks
    },
    showAsSingle(item) {
      const children = (item.children || []).filter(child => !child.hidden)
      return children.length === 1 && !children[0].children && !item.alwaysShow
    },
    firstChild(item) {
      return (item.children || []).filter(child => !child.hidden)[0] || {}
    },
    singlePath(item) {
      const child = this.firstChild(item)
      return this.joinPath(this.itemPath(item), child.path)
    },
    singleTitle(item) {
      const child = this.firstChild(item)
      // 单子项分组默认展示子页标题（如「疗愈师评价」）；需要强调分组时用 meta.singleTitle 覆盖
      return (item.meta && item.meta.singleTitle) || (child.meta && child.meta.title) || (item.meta && item.meta.title) || ''
    },
    singleBadge(item) {
      const child = this.firstChild(item)
      return child.meta && child.meta.badge
    },
    groupIcon(item) {
      return resolveNavIcon(item.meta && item.meta.icon, item.meta && item.meta.title)
    },
    singleIcon(item) {
      const child = this.firstChild(item)
      // 单子项分组优先使用分组图标，保证「客户管理」等入口不会串成子页图标
      const parentIcon = item.meta && item.meta.icon
      return resolveNavIcon(parentIcon, (item.meta && item.meta.title) || (child.meta && child.meta.title))
    },
    childIcon(child) {
      return resolveNavIcon(child.meta && child.meta.icon, child.meta && child.meta.title)
    }
  }
}
</script>

<style lang="scss" scoped>
@import "src/styles/variables.scss";

.menu-wrapper {
  width: 100%;
}

.menu-link {
  display: block;
  width: 100%;
  text-decoration: none;
}

.todo-count-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 18px;
  margin-left: 8px;
  padding: 0 5px;
  border-radius: 9px;
  background: rgba(203, 187, 247, .22);
  color: #D9CDFB;
  font-size: 11px;
  line-height: 1;
  font-weight: 600;
  letter-spacing: 0;
  vertical-align: 1px;
}

.menu-group__title {
  letter-spacing: .01em;
}

.menu-block__title {
  font-size: 11px;
  line-height: 16px;
  font-weight: 500;
  letter-spacing: .06em;
  color: rgba(255, 255, 255, .34);
}
</style>

<!-- 分组小标题需要穿透到 el-menu-item-group 内部，vue-loader 13 不支持 ::v-deep，故用非 scoped 块 -->
<style lang="scss">
.menu-block .el-menu-item-group__title {
  padding: 10px 0 4px 44px !important;
  line-height: 16px;
}

// 没有小标题的分组（如「客户与营销」）不占位
.menu-block--plain .el-menu-item-group__title {
  display: none !important;
  padding: 0 !important;
}
</style>
