/**
 * UI 偏好设置状态管理
 *
 * 管理用户界面相关的显示偏好，如悬浮置顶条、Diff 视图模式等。
 */

import { atom } from 'jotai'

// ===== Jotai Atoms =====

/** 是否显示用户消息悬浮置顶条 */
export const stickyUserMessageEnabledAtom = atom<boolean>(true)

/** Agent Diff 视图模式 */
export const agentDiffStyleAtom = atom<'unified' | 'split'>('unified')

// ===== 初始化 =====

/**
 * 从主进程加载 UI 偏好设置
 */
export async function initializeUiPreferences(
  setStickyUserMessageEnabled: (enabled: boolean) => void,
  setAgentDiffStyle: (style: 'unified' | 'split') => void,
): Promise<void> {
  try {
    const settings = await window.electronAPI.getSettings()
    setStickyUserMessageEnabled(settings.stickyUserMessageEnabled ?? true)
    setAgentDiffStyle(settings.agentDiffStyle ?? 'unified')
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
 * 更新 Agent Diff 视图模式并持久化
 */
export async function updateAgentDiffStyle(style: 'unified' | 'split'): Promise<void> {
  try {
    await window.electronAPI.updateSettings({ agentDiffStyle: style })
  } catch (error) {
    console.error('[UI偏好] 更新 Diff 视图模式失败:', error)
  }
}
