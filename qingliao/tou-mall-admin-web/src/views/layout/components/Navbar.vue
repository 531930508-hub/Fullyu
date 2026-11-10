<template>
  <header class="navbar">
    <div class="navbar__left">
      <button type="button" class="navbar-icon-btn" :title="sidebar.opened ? '收起导航' : '展开导航'"
              :aria-label="sidebar.opened ? '收起导航' : '展开导航'" @click="toggleSideBar">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
            <path d="M4 6.5h16M4 12h10M4 17.5h16"/>
          </g>
        </svg>
      </button>
      <span class="navbar__divider" aria-hidden="true"></span>
      <breadcrumb class="navbar__breadcrumb"></breadcrumb>
    </div>

    <div class="navbar__right">
      <router-link v-if="massagistId" to="/appointment/shift?tab=leave" class="todo-entry leave-entry"
                   :class="{ 'is-active': $route.path === '/appointment/shift' && $route.query.tab === 'leave' }"
                   title="申请休息 / 我的请假">
        <span class="todo-entry__icon">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <g fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
              <path d="M7 3.5v3M17 3.5v3M4.5 9h15M5 5.5h14a1 1 0 0 1 1 1V19a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6.5a1 1 0 0 1 1-1Z"/>
              <path d="m9.5 14.5 5 5M14.5 14.5l-5 5"/>
            </g>
          </svg>
        </span>
        <span class="todo-entry__label">请假</span>
      </router-link>

      <router-link to="/todo/index" class="todo-entry" :class="{ 'is-active': $route.path === '/todo/index' }"
                   title="待办中心">
        <span class="todo-entry__icon">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <g fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
              <path d="M18.2 5.2A8 8 0 1 0 20 12"/>
              <path d="m9 12 2.2 2.2L20 5.4"/>
            </g>
          </svg>
          <span v-if="todoCount" class="todo-entry__badge">{{ todoCount > 99 ? '99+' : todoCount }}</span>
        </span>
        <span class="todo-entry__label">待办</span>
      </router-link>

      <span class="navbar__divider" aria-hidden="true"></span>

      <el-dropdown trigger="click" placement="bottom-end" @command="handleCommand">
        <button type="button" class="user-chip">
          <img v-if="avatar" class="user-chip__avatar" :src="avatar" :alt="name">
          <span v-else class="user-chip__avatar user-chip__avatar--text" aria-hidden="true">{{ initial }}</span>
          <span class="user-chip__meta">
            <span class="user-chip__name">{{ name || '未命名账号' }}</span>
            <span class="user-chip__role">{{ roleLabel }}</span>
          </span>
          <i class="el-icon-arrow-down user-chip__caret" aria-hidden="true"></i>
        </button>
        <el-dropdown-menu slot="dropdown" class="user-dropdown">
          <el-dropdown-item command="home">
            <i class="el-icon-house"></i>首页
          </el-dropdown-item>
          <el-dropdown-item v-if="massagistId || trainer" disabled divided class="user-dropdown__label">
            疗愈师自助
          </el-dropdown-item>
          <el-dropdown-item v-if="massagistId" command="leave">
            <i class="el-icon-date"></i>我的请假
          </el-dropdown-item>
          <el-dropdown-item v-if="massagistId" command="rewards">
            <i class="el-icon-medal"></i>我的接单奖励
          </el-dropdown-item>
          <el-dropdown-item v-if="trainer" command="trainer">
            <i class="el-icon-reading"></i>内训考核
          </el-dropdown-item>
          <el-dropdown-item command="password" divided>
            <i class="el-icon-lock"></i>修改密码
          </el-dropdown-item>
          <el-dropdown-item command="logout">
            <i class="el-icon-switch-button"></i>退出登录
          </el-dropdown-item>
        </el-dropdown-menu>
      </el-dropdown>
    </div>

    <password-form ref="refPasswordForm"></password-form>
  </header>
</template>

<script>
import { mapGetters } from 'vuex'
import Breadcrumb from '@/components/Breadcrumb'
import PasswordForm from '@/views/layout/components/PasswordForm'

export default {
  components: {
    PasswordForm,
    Breadcrumb
  },
  computed: {
    ...mapGetters([
      'sidebar',
      'avatar',
      'name',
      'roles',
      'todoCount',
      'massagistId',
      'trainer'
    ]),
    initial() {
      const text = (this.name || '愈').trim()
      return text.charAt(0).toUpperCase()
    },
    roleLabel() {
      const role = this.roles && this.roles[0]
      return role || '运营成员'
    }
  },
  methods: {
    toggleSideBar() {
      this.$store.dispatch('ToggleSideBar')
    },
    handleCommand(command) {
      if (command === 'home') {
        this.$router.push('/')
      } else if (command === 'leave') {
        this.$router.push({ path: '/appointment/shift', query: { tab: 'leave' } })
      } else if (command === 'rewards') {
        this.$router.push('/my-rewards')
      } else if (command === 'trainer') {
        this.$router.push('/trainer-assess')
      } else if (command === 'password') {
        this.$refs.refPasswordForm.open()
      } else if (command === 'logout') {
        this.logout()
      }
    },
    logout() {
      this.$store.dispatch('LogOut').then(() => {
        location.reload() // 为了重新实例化vue-router对象 避免bug
      })
    }
  }
}
</script>

<style lang="scss" scoped>
@import "src/styles/variables.scss";

.navbar {
  position: sticky;
  top: 0;
  z-index: 900;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  height: $navbar-height;
  padding: 0 24px 0 20px;
  background: rgba(255, 255, 255, .86);
  backdrop-filter: saturate(180%) blur(14px);
  -webkit-backdrop-filter: saturate(180%) blur(14px);
  border-bottom: 1px solid $line;
}

.navbar__left,
.navbar__right {
  display: flex;
  align-items: center;
  min-width: 0;
}

.navbar__left {
  gap: 6px;
  flex: 1;
}

.navbar__right {
  gap: 10px;
  flex-shrink: 0;
}

.navbar__divider {
  width: 1px;
  height: 18px;
  margin: 0 10px;
  background: $line-strong;
}

.navbar-icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  padding: 0;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: $ink-secondary;
  cursor: pointer;
  transition: background-color .18s ease, color .18s ease;

  svg {
    width: 20px;
    height: 20px;
  }

  &:hover {
    background: $brand-soft;
    color: $brand;
  }
}

.navbar__breadcrumb {
  min-width: 0;
  overflow: hidden;
}

.todo-entry {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 34px;
  padding: 0 10px;
  border-radius: 10px;
  color: $ink-secondary;
  font-size: 13px;
  font-weight: 500;
  transition: background-color .18s ease, color .18s ease;

  &__icon {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    border-radius: 8px;
    background: $brand-soft;
    color: $brand;

    svg {
      width: 16px;
      height: 16px;
    }
  }

  &__badge {
    position: absolute;
    top: -5px;
    right: -6px;
    min-width: 15px;
    height: 15px;
    padding: 0 4px;
    border-radius: 8px;
    background: #B3261E;
    color: #fff;
    font-size: 10px;
    line-height: 15px;
    text-align: center;
    font-weight: 600;
    box-shadow: 0 0 0 2px #fff;
  }

  &:hover,
  &.is-active {
    background: $brand-soft;
    color: $brand;

    .todo-entry__icon {
      background: rgba(103, 80, 164, .14);
    }
  }
}

.user-chip {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  height: 44px;
  padding: 0 8px;
  border: 0;
  border-radius: 12px;
  background: transparent;
  cursor: pointer;
  transition: background-color .18s ease;

  &:hover {
    background: $surface-2;
  }

  &__avatar {
    width: 32px;
    height: 32px;
    border-radius: 10px;
    object-fit: cover;
    flex-shrink: 0;
    box-shadow: inset 0 0 0 1px rgba(28, 27, 32, .06);
  }

  &__avatar--text {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: linear-gradient(145deg, #8A73C9, #6750A4);
    color: #fff;
    font-size: 14px;
    font-weight: 600;
  }

  &__meta {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    line-height: 1.25;
    max-width: 140px;
  }

  &__name {
    color: $ink;
    font-size: 13.5px;
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 140px;
  }

  &__role {
    margin-top: 2px;
    color: $ink-faint;
    font-size: 11px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 140px;
  }

  &__caret {
    color: $ink-faint;
    font-size: 12px;
    margin-left: 2px;
  }
}

.leave-entry .todo-entry__icon {
  background: $gold-soft;
  color: $gold;
}

.leave-entry:hover .todo-entry__icon,
.leave-entry.is-active .todo-entry__icon {
  background: rgba(176, 130, 67, .16);
}

@media (max-width: 900px) {
  .navbar {
    padding: 0 14px;
  }

  .todo-entry__label,
  .user-chip__meta,
  .navbar__breadcrumb {
    display: none;
  }
}
</style>

<!-- 下拉菜单 teleport 到 body，且 vue-loader 13 不支持 ::v-deep，用非 scoped 块 -->
<style lang="scss">
@import "src/styles/variables.scss";

.user-dropdown .el-dropdown-menu__item i {
  margin-right: 8px;
  color: $ink-muted;
  width: 16px;
  text-align: center;
}

.user-dropdown .el-dropdown-menu__item:hover i {
  color: $brand;
}

.user-dropdown__label.el-dropdown-menu__item {
  padding-top: 6px;
  padding-bottom: 4px;
  color: $ink-faint;
  font-size: 11px;
  letter-spacing: .08em;
  cursor: default;

  &:hover {
    background: transparent;
    color: $ink-faint;
  }
}
</style>