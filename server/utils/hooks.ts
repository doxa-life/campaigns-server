type HookCallback = (...args: any[]) => Promise<void> | void

const hooks = new Map<string, HookCallback[]>()

export function addAction(name: string, callback: HookCallback) {
  if (!hooks.has(name)) hooks.set(name, [])
  hooks.get(name)!.push(callback)
}

export async function doAction(name: string, ...args: any[]) {
  const callbacks = hooks.get(name)
  if (!callbacks) return
  for (const cb of callbacks) {
    await cb(...args)
  }
}
