/**
 * 持久化层：localStorage（主）+ Capacitor Preferences（原生镜像兜底）
 * ------------------------------------------------------------------
 * 覆盖安装时，若 WebView 的 localStorage 被系统清理，可从原生 Preferences
 * 镜像恢复。Web 预览环境没有原生 Preferences，自动退化为只用 localStorage。
 * 所有操作都 try/catch，任何失败都不影响主流程。
 */
import { Preferences } from '@capacitor/preferences'
import type { PersistedData } from './migrate'

const LS_KEY = 'daysnote.v1'
const NATIVE_KEY = 'daysnote.snapshot.v1'

const isNative = () => Boolean((window as any).Capacitor?.isNativePlatform?.())

/** 读取 localStorage 原始数据 */
export function readLocal(): string | null {
  try { return localStorage.getItem(LS_KEY) } catch { return null }
}

/** 读取原生镜像原始数据（仅原生环境） */
export async function readNative(): Promise<string | null> {
  if (!isNative()) return null
  try {
    const r = await Preferences.get({ key: NATIVE_KEY })
    return r && typeof r.value === 'string' ? r.value : null
  } catch { return null }
}

/**
 * 启动时恢复：优先 localStorage；若为空/损坏则尝试原生镜像。
 * 返回原始 JSON 字符串，交给 migrate() 处理。
 */
export async function restoreRaw(): Promise<string | null> {
  const local = readLocal()
  if (local) {
    try {
      const parsed = JSON.parse(local)
      if (parsed && Array.isArray(parsed.categories) && Array.isArray(parsed.events)) return local
    } catch { /* 损坏，尝试镜像 */ }
  }
  // localStorage 空或损坏，从原生镜像恢复
  const native = await readNative()
  if (native) {
    try {
      const parsed = JSON.parse(native)
      if (parsed && Array.isArray(parsed.categories) && Array.isArray(parsed.events)) {
        // 回写 localStorage，后续以本地为准
        try { localStorage.setItem(LS_KEY, native) } catch { /* ignore */ }
        return native
      }
    } catch { /* ignore */ }
  }
  return local
}

/** 写入主存储 + 原生镜像（异步镜像，不阻塞 UI） */
export function persist(data: PersistedData): void {
  const json = JSON.stringify(data)
  try { localStorage.setItem(LS_KEY, json) } catch { /* ignore */ }
  if (isNative()) {
    // 不 await：镜像写入后台进行，失败静默
    void Preferences.set({ key: NATIVE_KEY, value: json }).catch(() => {})
  }
}
