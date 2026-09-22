<template>
  <div class="min-h-screen flex flex-col bg-default text-default">
    <!-- Header/Navbar -->
    <header class="bg-forest-500 text-white">
      <div class="max-w-7xl mx-auto px-4 sm:px-6">
        <div class="flex justify-between items-center py-4">
          <!-- Logo -->
          <NuxtLink :to="localePath('/')" class="flex items-center gap-2">
            <span class="text-xl font-bold tracking-wider">{{ config.public.appName }}</span>
          </NuxtLink>

          <!-- Navigation -->
          <div class="flex items-center gap-4 navbar-actions">
            <LanguageSwitcher />
            <ThemeToggle />
          </div>
        </div>
      </div>
    </header>

    <!-- Main Content -->
    <main class="flex-1 flex items-center justify-center px-4 py-12">
      <div class="w-full max-w-md">
        <slot />
      </div>
    </main>

    <!-- Footer -->
    <footer class="bg-forest-500 text-white py-8">
      <div class="max-w-7xl mx-auto px-4 sm:px-6">
        <div class="flex flex-col items-center gap-4 md:grid md:grid-cols-3">
          <span class="font-bold md:justify-self-start">{{ config.public.appName }}</span>
          <div class="flex items-center gap-4 text-sm md:justify-self-center">
            <a :href="marketingUrl()" target="_blank" class="text-sage-300 hover:text-white transition-colors">About Doxa.Life</a>
            <a :href="marketingUrl('/privacy-policy/')" target="_blank" class="text-sage-300 hover:text-white transition-colors">Privacy Policy</a>
          </div>
          <p class="text-sm text-sage-300 md:justify-self-end">
            &copy; {{ currentYear }} {{ config.public.appName }}. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  </div>
</template>

<script setup lang="ts">
const config = useRuntimeConfig()
const localePath = useLocalePath()
const marketingUrl = useMarketingUrl()
const currentYear = new Date().getFullYear()
</script>

<style scoped>
.navbar-actions :deep(button) {
  color: white !important;
}
.navbar-actions :deep(button:hover) {
  color: white !important;
  background-color: rgba(255, 255, 255, 0.1) !important;
}
.navbar-actions :deep(svg),
.navbar-actions :deep(.i-lucide-sun),
.navbar-actions :deep(.i-lucide-moon),
.navbar-actions :deep([class*="i-lucide"]) {
  color: white !important;
}
</style>

<style>
/* Language switcher in navbar */
header .language-select {
  background-color: #D1D4CD !important;
  color: #3B463D !important;
  border-color: #D1D4CD !important;
}
header .language-select:hover {
  background-color: #b8bcb3 !important;
}
header .language-select option {
  background-color: #D1D4CD !important;
  color: #3B463D !important;
}
</style>
