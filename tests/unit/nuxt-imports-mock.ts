export const useState = (...args: any[]) => (globalThis as any).useState(...args)
export const useRuntimeConfig = (...args: any[]) => (globalThis as any).useRuntimeConfig(...args)
export const useRoute = (...args: any[]) => (globalThis as any).useRoute(...args)
export const useRouter = (...args: any[]) => (globalThis as any).useRouter(...args)
export const navigateTo = (...args: any[]) => (globalThis as any).navigateTo(...args)
export const useColorMode = (...args: any[]) => (globalThis as any).useColorMode(...args)
export const useI18n = (...args: any[]) => (globalThis as any).useI18n(...args)
export const useLocalePath = (...args: any[]) => (globalThis as any).useLocalePath(...args)
export { computed, readonly, ref } from 'vue'
