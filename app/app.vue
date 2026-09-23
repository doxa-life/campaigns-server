<template>
  <UApp :dir="dir">
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>

<script setup>
const { initTheme } = useTheme()

// Sets <html lang> and <html dir> from the active locale so RTL languages lay out right-to-left.
const localeHead = useLocaleHead({ seo: false })
useHead(() => ({ htmlAttrs: localeHead.value.htmlAttrs }))

const { localeProperties } = useI18n()
const dir = computed(() => localeProperties.value.dir ?? 'ltr')

onMounted(() => {
  initTheme()
})
</script>
