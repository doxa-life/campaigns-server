<template>
  <UApp>
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>

<script setup>
const { initTheme } = useTheme()

onMounted(() => {
  initTheme()
})
</script>
