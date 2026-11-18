<script setup lang="ts">
const theme = {
  token: {
    colorPrimary: '#6B463C',
    colorLink: '#6B463C',
    borderRadius: 8,
    colorBgLayout: '#FAF7F2',
    colorBorderSecondary: '#E6DED2'
  }
}
</script>

<template>
  <a-config-provider :theme="theme">
    <router-view />
  </a-config-provider>
</template>
