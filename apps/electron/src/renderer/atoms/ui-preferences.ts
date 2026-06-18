/**
 * UI 偏好设置状态管理
 *
 * 管理用户界面相关的显示偏好，如悬浮置顶条、输入框 Markdown 渲染等。
 */

import { atom } from 'jotai'

// ===== Jotai Atoms =====

/** 是否显示用户消息悬浮置顶条 */
export const stickyUserMessageEnabledAtom = atom<boolean>(true)

/** 输入框是否渲染 Markdown（关闭后粘贴保留纯文本、禁用输入快捷格式） */
export const richTextInputRenderingEnabledAtom = atom<boolean>(true)

// ===== 初始化 =====

/**
 * 从主进程加载 UI 偏好设置
 */
export async function initializeUiPreferences(
  setStickyUserMessageEnabled: (enabled: boolean) => void,
  setRichTextInputRenderingEnabled: (enabled: boolean) => void,
): Promise<void> {
  try {
    const settings = await window.electronAPI.getSettings()
    setStickyUserMessageEnabled(settings.stickyUserMessageEnabled ?? true)
    setRichTextInputRenderingEnabled(settings.richTextInputRenderingEnabled ?? true)
  } catch (error) {
    console.error('[UI偏好] 初始化失败:', error)
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
 * 更新输入框 Markdown 渲染开关并持久化
 */
export async function updateRichTextInputRenderingEnabled(enabled: boolean): Promise<void> {
  try {
    await window.electronAPI.updateSettings({ richTextInputRenderingEnabled: enabled })
  } catch (error) {
    console.error('[UI偏好] 更新输入框 Markdown 渲染设置失败:', error)
  }
}
