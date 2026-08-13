/**
 * UI 偏好设置状态管理
 *
 * 管理用户界面相关的显示偏好，如悬浮置顶条、输入框 Markdown 渲染等。
 */

import { atom } from 'jotai'

// ===== Jotai Atoms =====

/** 是否显示用户消息悬浮置顶条 */
export const stickyUserMessageEnabledAtom = atom<boolean>(true)

/** 粘贴长文本时是否自动转为附件 */
export const longTextPasteAsAttachmentEnabledAtom = atom<boolean>(false)

/** 输入框是否渲染 Markdown 富文本格式（默认关闭，纯文本模式；开启后渲染富文本，仍保留 Mention 引用） */
export const richTextRenderingEnabledAtom = atom<boolean>(false)

/** 左侧会话列表悬浮预览迷你地图（默认关闭，需手动开启） */
export const sessionHoverPreviewEnabledAtom = atom<boolean>(false)

/** Agent 使用受管浏览器时是否自动展开浏览器面板（默认开启） */
export const browserAutoOpenPanelEnabledAtom = atom<boolean>(true)

/** 浏览器自动展开设置是否已从主进程加载完成。 */
export const browserAutoOpenPanelReadyAtom = atom<boolean>(false)

// ===== 初始化 =====

/**
 * 从主进程加载 UI 偏好设置
 */
export async function initializeUiPreferences(
  setStickyUserMessageEnabled: (enabled: boolean) => void,
  setLongTextPasteAsAttachmentEnabled?: (enabled: boolean) => void,
  setRichTextRenderingEnabled?: (enabled: boolean) => void,
  setSessionHoverPreviewEnabled?: (enabled: boolean) => void,
  setBrowserAutoOpenPanelEnabled?: (enabled: boolean) => void,
  setBrowserAutoOpenPanelReady?: (ready: boolean) => void
): Promise<void> {
  try {
    const settings = await window.electronAPI.getSettings()
    setStickyUserMessageEnabled(settings.stickyUserMessageEnabled ?? true)
    setLongTextPasteAsAttachmentEnabled?.(settings.longTextPasteAsAttachmentEnabled ?? false)
    setRichTextRenderingEnabled?.(settings.richTextRenderingEnabled ?? false)
    setSessionHoverPreviewEnabled?.(settings.sessionHoverPreviewEnabled ?? false)
    setBrowserAutoOpenPanelEnabled?.(settings.browserAutoOpenPanelEnabled ?? true)
  } catch (error) {
    console.error('[UI偏好] 初始化失败:', error)
  } finally {
    setBrowserAutoOpenPanelReady?.(true)
  }
}

// ===== 持久化更新 =====

/**
 * 更新悬浮置顶条开关并持久化
 */
export async function updateStickyUserMessageEnabled(enabled: boolean): Promise<void> {
  try {
    await window.electronAPI.updateSettings({ stickyUserMessageEnabled: enabled })
  } catch (error) {
    console.error('[UI偏好] 更新悬浮置顶条设置失败:', error)
  }
}

/**
 * 更新长文本粘贴转附件开关并持久化
 */
export async function updateLongTextPasteAsAttachmentEnabled(enabled: boolean): Promise<void> {
  try {
    await window.electronAPI.updateSettings({ longTextPasteAsAttachmentEnabled: enabled })
  } catch (error) {
    console.error('[UI偏好] 更新长文本粘贴附件设置失败:', error)
  }
}

/**
 * 更新输入框 Markdown 渲染开关并持久化
 */
export async function updateRichTextRenderingEnabled(enabled: boolean): Promise<void> {
  try {
    await window.electronAPI.updateSettings({ richTextRenderingEnabled: enabled })
  } catch (error) {
    console.error('[UI偏好] 更新输入框 Markdown 渲染设置失败:', error)
  }
}

/**
 * 更新左侧会话悬浮预览开关并持久化
 */
export async function updateSessionHoverPreviewEnabled(enabled: boolean): Promise<void> {
  try {
    await window.electronAPI.updateSettings({ sessionHoverPreviewEnabled: enabled })
  } catch (error) {
    console.error('[UI偏好] 更新会话悬浮预览设置失败:', error)
  }
}

/**
 * 更新 Agent 浏览器自动展开面板开关并持久化
 */
export async function updateBrowserAutoOpenPanelEnabled(enabled: boolean): Promise<void> {
  try {
    await window.electronAPI.updateSettings({ browserAutoOpenPanelEnabled: enabled })
  } catch (error) {
    console.error('[UI偏好] 更新浏览器自动展开面板设置失败:', error)
  }
}
