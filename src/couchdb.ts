/**
 * 兼容层：同步逻辑已统一到 sync.ts（同时支持 CouchDB 与 WebDAV）。
 * 保留此文件的导出名，避免外部引用断裂。
 */
export {
  isConfigured,
  testConnection,
  deleteRemote,
  syncAll,
  loadBase,
  saveBase,
  testBackend,
  getCouchDbInfo,
  formatBytes,
  enabledBackends,
  type SyncOutcome,
  type RemoteState,
  type SyncBackendDriver,
} from './sync'
export type { SyncBackend } from './types'
