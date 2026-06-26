/**
 * UI 偏好设置状态管理
 *
 * 管理用户界面相关的显示偏好，如悬浮置顶条等。
 */

import { atom } from 'jotai'
import type { ChatBubbleStyle } from '../../types'

// ===== Jotai Atoms =====

/** 是否显示用户消息悬浮置顶条 */
export const stickyUserMessageEnabledAtom = atom<boolean>(true)

/** 会话气泡样式 */
export const chatBubbleStyleAtom = atom<ChatBubbleStyle>('modern')

// ===== 初始化 =====

/**
 * 从主进程加载 UI 偏好设置
 */
export async function initializeUiPreferences(
  setStickyUserMessageEnabled: (enabled: boolean) => void,
  setChatBubbleStyle: (style: ChatBubbleStyle) => void
): Promise<void> {
  try {
    const settings = await window.electronAPI.getSettings()
    setStickyUserMessageEnabled(settings.stickyUserMessageEnabled ?? true)
    setChatBubbleStyle(settings.chatBubbleStyle ?? 'modern')
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
 * 更新会话气泡样式并持久化
 */
export async function updateChatBubbleStyle(style: ChatBubbleStyle): Promise<void> {
  try {
    await window.electronAPI.updateSettings({ chatBubbleStyle: style })
  } catch (error) {
    console.error('[UI偏好] 更新会话气泡样式失败:', error)
  }
}
