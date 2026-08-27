import type { AgentSidePanelTab } from '@/atoms/agent-atoms'
import { describe, expect, test } from 'bun:test'
import {
  clampRightWorkspaceSplitRatio,
  clampRightWorkspaceSplitRatioForWidth,
  collapseRightWorkspaceSplit,
  createRightWorkspaceSplit,
  focusRightWorkspaceSplitPane,
  getFocusedRightWorkspaceTab,
  groupRightWorkspaceTabs,
  placeRightWorkspaceSplitTab,
  sanitizeRightWorkspaceSplit,
  selectRightWorkspaceSplitTab,
} from './right-workspace-split'

describe('右侧工作区双 Pane 状态机', () => {
  test('拖到左侧时将拖拽 Tab 放左边并聚焦它', () => {
    expect(createRightWorkspaceSplit('files', 'terminal:one', 'left', 0.56)).toEqual({
      leftTab: 'terminal:one',
      rightTab: 'files',
      focusedPane: 'left',
      ratio: 0.56,
    })
  })

  test('拖到右侧时保留当前 Tab 在左边并聚焦拖拽 Tab', () => {
    expect(createRightWorkspaceSplit('files', 'preview:readme', 'right', 0.44)).toEqual({
      leftTab: 'files',
      rightTab: 'preview:readme',
      focusedPane: 'right',
      ratio: 0.44,
    })
  })

  test('不能用同一个 Tab 创建无意义分屏', () => {
    expect(createRightWorkspaceSplit('files', 'files', 'right', 0.5)).toBeNull()
  })

  test('点击已显示的另一个 Tab 只切换 Pane 焦点', () => {
    const split = createRightWorkspaceSplit('files', 'changes', 'right', 0.5)!
    const next = selectRightWorkspaceSplitTab(split, 'files')

    expect(next).toEqual({ ...split, focusedPane: 'left' })
    expect(getFocusedRightWorkspaceTab(next)).toBe('files')
  })

  test('点击未显示 Tab 时替换当前焦点 Pane', () => {
    const split = createRightWorkspaceSplit('files', 'changes', 'right', 0.5)!

    expect(selectRightWorkspaceSplitTab(split, 'terminal:two')).toEqual({
      ...split,
      rightTab: 'terminal:two',
      focusedPane: 'right',
    })
  })

  test('点击并排外的 Tab 会替换当前焦点 Pane 但保持并排', () => {
    const split = createRightWorkspaceSplit('files', 'changes', 'right', 0.5)!

    expect(selectRightWorkspaceSplitTab(split, 'terminal:one')).toEqual({
      ...split,
      rightTab: 'terminal:one',
    })
  })
  test('并排 Tab 只在渲染层临时合并，退出时基础顺序保持不变', () => {
    const tabs: Array<{ id: AgentSidePanelTab }> = [
      { id: 'files' }, { id: 'terminal:one' }, { id: 'changes' }, { id: 'preview:one' },
    ]
    expect(groupRightWorkspaceTabs(tabs, 'changes', 'terminal:one').map((tab) => tab.id)).toEqual([
      'files', 'changes', 'terminal:one', 'preview:one',
    ])
    expect(tabs.map((tab) => tab.id)).toEqual(['files', 'terminal:one', 'changes', 'preview:one'])
  })
  test('拖动已显示 Tab 到另一侧时交换两个 Pane', () => {
    const split = createRightWorkspaceSplit('files', 'changes', 'right', 0.5)!
    expect(placeRightWorkspaceSplitTab(split, 'files', 'right')).toEqual({
      ...split,
      leftTab: 'changes',
      rightTab: 'files',
      focusedPane: 'right',
    })
  })

  test('拖动新 Tab 到指定侧时替换该 Pane', () => {
    const split = createRightWorkspaceSplit('files', 'changes', 'right', 0.5)!
    expect(placeRightWorkspaceSplitTab(split, 'terminal:new', 'left')).toEqual({
      ...split,
      leftTab: 'terminal:new',
      focusedPane: 'left',
    })
  })

  test('点击 Pane 可切换焦点且折叠时保留焦点 Tab', () => {
    const split = createRightWorkspaceSplit('files', 'changes', 'right', 0.5)!
    const focusedLeft = focusRightWorkspaceSplitPane(split, 'left')

    expect(collapseRightWorkspaceSplit(focusedLeft)).toBe('files')
  })

  test('动态 Tab 消失时优先补位；不足两个 Tab 时才退出并排', () => {
    const split = createRightWorkspaceSplit('terminal:one', 'browser:one', 'right', 0.5)!

    expect(sanitizeRightWorkspaceSplit(split, new Set(['terminal:one', 'files']))).toEqual({
      split: {
        ...split,
        rightTab: 'files',
      },
      activeTab: 'files',
    })
    expect(sanitizeRightWorkspaceSplit(split, new Set(['files']))).toEqual({
      split: null,
      activeTab: 'files',
    })
  })

  test('分隔比例限制在 30% 到 70%', () => {
    expect(clampRightWorkspaceSplitRatio(0.1)).toBe(0.3)
    expect(clampRightWorkspaceSplitRatio(0.61)).toBe(0.61)
    expect(clampRightWorkspaceSplitRatio(0.9)).toBe(0.7)
  })

  test('窄工作区按实际像素保证两个 Pane 尽量各有 320px', () => {
    expect(clampRightWorkspaceSplitRatioForWidth(0.3, 720)).toBeCloseTo(320 / 712)
    expect(clampRightWorkspaceSplitRatioForWidth(0.7, 720)).toBeCloseTo(1 - 320 / 712)
    expect(clampRightWorkspaceSplitRatioForWidth(0.3, 1200)).toBe(0.3)
    expect(clampRightWorkspaceSplitRatioForWidth(0.2, 600)).toBe(0.5)
  })
})
