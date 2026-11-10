<template>
  <el-breadcrumb class="app-breadcrumb" separator="/">
    <transition-group name="breadcrumb">
      <el-breadcrumb-item v-for="(item,index) in levelList" :key="item.path" v-if="item.meta.title">
        <span v-if="item.redirect==='noredirect'||index==levelList.length-1" class="no-redirect">{{item.meta.title}}</span>
        <router-link v-else :to="item.redirect||item.path">{{item.meta.title}}</router-link>
      </el-breadcrumb-item>
    </transition-group>
  </el-breadcrumb>
</template>

<script>
export default {
  created() {
    this.getBreadcrumb()
  },
  data() {
    return {
      levelList: null
    }
  },
  watch: {
    $route() {
      this.getBreadcrumb()
    }
  },
  methods: {
    getBreadcrumb() {
      let matched = this.$route.matched.filter(item => item.name)
      const first = matched[0]
      if (first && first.name !== 'home') {
        matched = [{ path: '/home', meta: { title: '首页' } }].concat(matched)
      }
      this.levelList = matched
    }
  }
}
</script>

<style rel="stylesheet/scss" lang="scss" scoped>
@import "src/styles/variables.scss";

.app-breadcrumb.el-breadcrumb {
  display: flex;
  align-items: center;
  font-size: 13px;
  line-height: 1.4;
  white-space: nowrap;

  .no-redirect {
    color: $ink;
    font-weight: 600;
    cursor: text;
  }

  ::v-deep .el-breadcrumb__item {
    display: inline-flex;
    align-items: center;
    float: none;
  }

  ::v-deep .el-breadcrumb__inner {
    color: $ink-muted;
    font-weight: 400;
    transition: color .18s ease;

    &.is-link:hover,
    a:hover {
      color: $brand;
    }
  }

  ::v-deep .el-breadcrumb__separator {
    margin: 0 8px;
    color: $line-strong;
    font-weight: 400;
  }
}
</style>