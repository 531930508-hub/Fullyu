<template>
  <div class="forbidden">
    <a-result status="403" title="无访问权限" sub-title="当前账号没有该页面的权限，请联系管理员调整角色。">
      <template #extra>
        <a-button type="primary" @click="$router.replace('/')">回到工作台</a-button>
      </template>
    </a-result>
  </div>
</template>

<style scoped>
.forbidden {
  padding: 48px 0;
}
</style>
