<template>
  <section class="app-main" :class="{ 'is-flush': flush }">
    <!-- duration 显式给定时长：不再等待 transitionend，避免事件丢失导致新页面永不挂载 -->
    <transition name="fade" mode="out-in" :duration="{ enter: 160, leave: 120 }">
      <router-view :key="$route.name"></router-view>
    </transition>
  </section>
</template>

<script>
export default {
  name: 'AppMain',
  computed: {
    flush() {
      return !!(this.$route.meta && this.$route.meta.hideNavbar)
    }
  },
  watch: {
    $route() {
      if (window.scrollY) {
        window.scrollTo({ top: 0, behavior: 'auto' })
      }
    }
  }
}
</script>