<template>
  <div class="login-page">
    <aside class="login-brand">
      <div class="login-brand__glow login-brand__glow--a"></div>
      <div class="login-brand__glow login-brand__glow--b"></div>

      <div class="login-brand__top">
        <img class="login-brand__logo"
             src="@/assets/images/brand/logo-full-light.svg"
             alt="Full愈 轻疗疗愈空间">
      </div>

      <div class="login-brand__body">
        <h1 class="login-brand__title">一起，把每一次服务做好</h1>
        <p class="login-brand__desc">一个人可以专注当下，一群人可以让美好持续发生。<br>今天，也让我们彼此支持、默契同行。</p>

        <div class="login-brand__verse">
          <p>每一份付出</p>
          <p class="login-brand__verse-em">都值得被看见</p>
        </div>

        <p class="login-brand__closing">谢谢你的专业、耐心与用心。我们在这里记录成长、分享收获，也一起成为更好的团队。</p>
      </div>
    </aside>

    <main class="login-panel">
      <div class="login-card">
        <header class="login-card__head">
          <h2>欢迎回来</h2>
          <p>请使用运营台账号登录</p>
        </header>

        <el-form autoComplete="on"
                 class="login-form"
                 :model="loginForm"
                 :rules="loginRules"
                 ref="loginForm"
                 label-position="top">
          <el-form-item label="账号" prop="username">
            <el-input name="username"
                      type="text"
                      v-model="loginForm.username"
                      autoComplete="on"
                      placeholder="请输入用户名">
              <span slot="prefix" class="input-icon">
                <svg-icon icon-class="user"></svg-icon>
              </span>
            </el-input>
          </el-form-item>

          <el-form-item label="密码" prop="password">
            <el-input name="password"
                      :type="pwdType"
                      @keyup.enter.native="handleLogin"
                      v-model="loginForm.password"
                      autoComplete="on"
                      placeholder="请输入密码">
              <span slot="prefix" class="input-icon">
                <svg-icon icon-class="password"></svg-icon>
              </span>
              <button slot="suffix" type="button" class="pwd-toggle" @click="showPwd"
                      :aria-label="pwdType === 'password' ? '显示密码' : '隐藏密码'">
                <svg-icon icon-class="eye"></svg-icon>
              </button>
            </el-input>
          </el-form-item>

          <el-button class="login-submit" type="primary" :loading="loading" @click.native.prevent="handleLogin">
            登 录
          </el-button>
        </el-form>

        <p class="login-card__hint">如忘记密码，请联系门店管理员重置</p>
      </div>

      <p class="login-panel__copy">© {{ year }} Full愈 轻疗 · 仅供内部运营使用</p>
    </main>
  </div>
</template>

<script>
import { isvalidUsername } from '@/utils/validate'
import { getCookie } from '@/utils/support'

export default {
  name: 'login',
  data() {
    const validateUsername = (rule, value, callback) => {
      if (!isvalidUsername(value)) {
        callback(new Error('请输入正确的用户名'))
      } else {
        callback()
      }
    }
    const validatePass = (rule, value, callback) => {
      if (value.length < 3) {
        callback(new Error('密码不能小于3位'))
      } else {
        callback()
      }
    }
    return {
      loginForm: {
        username: '',
        password: ''
      },
      loginRules: {
        username: [{ required: true, trigger: 'blur', validator: validateUsername }],
        password: [{ required: true, trigger: 'blur', validator: validatePass }]
      },
      loading: false,
      pwdType: 'password',
      year: new Date().getFullYear()
    }
  },
  created() {
    this.loginForm.username = getCookie('username')
    this.loginForm.password = getCookie('password')
    if (this.loginForm.username === undefined || this.loginForm.username == null || this.loginForm.username === '') {
      this.loginForm.username = 'admin'
    }
    if (this.loginForm.password === undefined || this.loginForm.password == null) {
      this.loginForm.password = ''
    }
  },
  methods: {
    showPwd() {
      this.pwdType = this.pwdType === 'password' ? '' : 'password'
    },
    handleLogin() {
      this.$refs.loginForm.validate(valid => {
        if (valid) {
          this.loading = true
          this.$store.dispatch('Login', this.loginForm).then(() => {
            this.loading = false
            // 直接进入首页，避免 push('/') 在路由守卫里再触发一次重定向
            this.$router.push({ path: '/home' }).catch(() => {})
          }).catch(() => {
            this.loading = false
          })
        } else {
          return false
        }
      })
    }
  }
}
</script>

<style rel="stylesheet/scss" lang="scss" scoped>
@import "src/styles/variables.scss";

.login-page {
  display: flex;
  min-height: 100vh;
  background: $bg;
}

// ---------- 品牌区 ----------
.login-brand {
  position: relative;
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: 44px 56px 36px;
  overflow: hidden;
  background: radial-gradient(120% 90% at 8% 0%, #4A3675 0%, #2A2238 48%, #201A2C 100%);
  color: #fff;
}

.login-brand__glow {
  position: absolute;
  border-radius: 50%;
  filter: blur(10px);
  pointer-events: none;

  &--a {
    width: 460px;
    height: 460px;
    right: -120px;
    top: -140px;
    background: radial-gradient(circle, rgba(139, 115, 201, .55) 0%, rgba(139, 115, 201, 0) 68%);
  }

  &--b {
    width: 380px;
    height: 380px;
    left: -140px;
    bottom: -120px;
    background: radial-gradient(circle, rgba(192, 168, 140, .22) 0%, rgba(192, 168, 140, 0) 70%);
  }
}

.login-brand__top {
  position: relative;
  display: flex;
  align-items: center;
  min-height: 64px;
}

.login-brand__logo {
  display: block;
  height: 64px;
  width: auto;
}

.login-brand__body {
  position: relative;
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  justify-content: center;
  max-width: 460px;
  padding: 32px 0;
}

.login-brand__title {
  margin: 0;
  font-size: 38px;
  line-height: 1.32;
  font-weight: 600;
  letter-spacing: -.01em;
  color: #fff;
}

.login-brand__desc {
  margin-top: 20px;
  font-size: 14px;
  line-height: 1.9;
  color: rgba(255, 255, 255, .58);
  max-width: 420px;
}

.login-brand__verse {
  margin-top: 36px;
  padding-left: 18px;
  border-left: 2px solid rgba(216, 195, 154, .5);

  p {
    margin: 0;
    font-size: 25px;
    line-height: 1.5;
    font-weight: 500;
    letter-spacing: .02em;
    color: #fff;
  }

  .login-brand__verse-em {
    color: #D8C39A;
  }
}

.login-brand__closing {
  margin-top: 22px;
  font-size: 13px;
  line-height: 1.9;
  color: rgba(255, 255, 255, .5);
  max-width: 420px;
}

// ---------- 表单区 ----------
.login-panel {
  flex: 0 0 520px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px 40px 28px;
  background: #fff;
  position: relative;
}

.login-card {
  width: 100%;
  max-width: 360px;
}

.login-card__head {
  margin-bottom: 28px;

  h2 {
    font-size: 26px;
    line-height: 1.3;
    font-weight: 600;
    color: $ink;
  }

  p {
    margin-top: 8px;
    font-size: 13px;
    color: $ink-muted;
  }
}

.login-form {
  ::v-deep .el-form-item {
    margin-bottom: 20px;
  }

  ::v-deep .el-form-item__label {
    padding-bottom: 6px;
    font-size: 12.5px;
    font-weight: 500;
    color: $ink-muted;
    line-height: 20px;
  }

  ::v-deep .el-input__inner {
    height: 46px;
    line-height: 46px;
    padding-left: 40px;
    border-radius: 12px;
    border-color: $line-strong;
    background: #FAF9FC;
    font-size: 14px;
    color: $ink;

    &:focus {
      background: #fff;
      border-color: $brand;
      box-shadow: 0 0 0 3px rgba(103, 80, 164, .12);
    }
  }

  ::v-deep .el-input__prefix {
    left: 14px;
    width: 18px;
    display: flex;
    align-items: center;
    color: $ink-faint;
  }

  ::v-deep .el-input__suffix {
    right: 8px;
    display: flex;
    align-items: center;
  }
}

.input-icon .svg-icon {
  width: 17px;
  height: 17px;
}

.pwd-toggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  margin-right: 2px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: $ink-faint;
  cursor: pointer;
  transition: color .18s ease, background-color .18s ease;

  &:hover {
    color: $brand;
    background: $brand-soft;
  }

  .svg-icon {
    width: 17px;
    height: 17px;
  }
}

.login-submit {
  width: 100%;
  height: 46px;
  margin-top: 6px;
  border-radius: 12px;
  font-size: 15px;
  font-weight: 600;
  letter-spacing: .1em;
  box-shadow: 0 14px 26px -16px rgba(103, 80, 164, .9);
}

.login-card__hint {
  margin-top: 20px;
  text-align: center;
  font-size: 12px;
  color: $ink-faint;
}

.login-panel__copy {
  position: absolute;
  bottom: 22px;
  font-size: 11px;
  letter-spacing: .02em;
  color: #B9B3C2;
}

@media (max-width: 1024px) {
  .login-brand {
    display: none;
  }

  .login-panel {
    flex: 1 1 auto;
    padding: 40px 24px;
  }
}

@media (max-width: 420px) {
  .login-panel {
    padding: 32px 20px;
  }

  .login-card__head h2 {
    font-size: 23px;
  }
}
</style>