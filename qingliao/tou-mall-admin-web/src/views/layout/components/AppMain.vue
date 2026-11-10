<template>
  <section class="app-main" :class="{ 'is-flush': flush }">
    <transition name="fade" mode="out-in">
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