# Session Drag Reference Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 允许用户把左侧 Agent 会话行拖入当前 Agent 对话输入框，并在光标处插入可发送的 `&session` 引用 chip。

**Architecture:** 使用独立的自定义 MIME 拖放协议承载 `{ sessionId, title }`，避免与项目排序和文件拖放的 `text/plain` 载荷冲突。左侧会话行只负责写入载荷；`AgentView` 校验目标会话并把载荷交给 `RichTextInput`，后者复用现有 TipTap session mention 节点和 Markdown 序列化协议。

**Tech Stack:** React 18、TypeScript、TipTap v3、Bun test、Tailwind 语义主题变量。

---

### Task 1: 定义并测试会话拖放协议

**Files:**
- Create: `apps/electron/src/renderer/lib/session-reference-drag.ts`
- Create: `apps/electron/src/renderer/lib/session-reference-drag.test.ts`

**Step 1: Write the failing test**

覆盖：自定义 MIME 往返、`text/plain` 兜底为带编码标题的 `&session` marker、错误 JSON/缺字段/空字段返回 `null`。

**Step 2: Run test to verify it fails**

Run: `bun test apps/electron/src/renderer/lib/session-reference-drag.test.ts`
Expected: FAIL，因为协议模块尚不存在。

**Step 3: Write minimal implementation**

实现：

```ts
export const SESSION_REFERENCE_DRAG_MIME = 'application/x-proma-session-reference'

export interface SessionReferenceDragItem {
  sessionId: string
  title: string
}

export function setSessionReferenceDragData(
  dataTransfer: DataTransfer,
  item: SessionReferenceDragItem,
): void

export function getSessionReferenceDragData(
  dataTransfer: DataTransfer,
): SessionReferenceDragItem | null
```

写入自定义 MIME、`text/plain` marker，并把 `effectAllowed` 设为 `copy`；读取时严格校验非空字符串。

**Step 4: Run test to verify it passes**

Run: `bun test apps/electron/src/renderer/lib/session-reference-drag.test.ts`
Expected: PASS。

### Task 2: 让左侧 Agent 会话行成为拖拽源

**Files:**
- Modify: `apps/electron/src/renderer/components/app-shell/LeftSidebar.tsx`（`AgentSessionItem`）

**Step 1: Add drag source behavior**

在非重命名状态为会话行添加 `draggable` 与 `onDragStart`，调用 `setSessionReferenceDragData(event.dataTransfer, { sessionId: session.id, title: session.title })`。从按钮或输入框起拖时取消，避免星标、菜单和重命名控件误触；起拖时关闭 Mini Map。

**Step 2: Add affordance without new hard-coded colors**

为可拖拽行增加 `cursor-grab` / `active:cursor-grabbing`，继续复用现有主题 token 和选中态。

### Task 3: 将拖放载荷插入现有 session mention chip

**Files:**
- Modify: `apps/electron/src/renderer/components/ai-elements/rich-text-input.tsx`
- Modify: `apps/electron/src/renderer/components/agent/AgentView.tsx`

**Step 1: Extend the editor command handle**

新增：

```ts
insertSessionMention: (item: SessionReferenceDragItem) => boolean
```

插入现有 `mention` 节点，属性为 `id=sessionId`、`label=title`、`mentionSuggestionChar='&'`，随后插入空格并聚焦。发送时由既有 `htmlToMarkdown` 输出 `&session:<id>::<encoded-title>`。

**Step 2: Prevent ProseMirror fallback insertion**

`RichTextInput.editorProps.handleDrop` 同时识别文件面板 MIME 与会话引用 MIME，阻止 `text/plain` marker 被当成普通文本插入。

**Step 3: Handle the drop in AgentView**

`AgentView.handleDrop` 在文件拖放之前识别会话载荷；如果拖入的是当前会话，则不插入并给出提示；否则调用 `insertSessionMention` 后结束处理。`dragover` 统一使用 copy 语义，输入框拖入态改用现有 `primary` 主题 token，移除硬编码绿色。

### Task 4: 版本与验证

**Files:**
- Modify: `apps/electron/package.json`

**Step 1: Bump patch version**

将 `@proma/electron` 从 `0.19.17` 升至 `0.19.18`；运行 Bun lockfile 刷新并仅在 Bun 实际产生差异时保留 `bun.lock` 修改。

**Step 2: Run focused tests**

Run: `bun test apps/electron/src/renderer/lib/session-reference-drag.test.ts apps/electron/src/renderer/lib/markdown-rich-text.test.ts apps/electron/src/renderer/lib/mention-patterns.test.ts`
Expected: PASS。

**Step 3: Run static validation**

Run: `bun run --filter='@proma/electron' typecheck`
Expected: PASS。

Run: `bun run --filter='@proma/electron' build:renderer`
Expected: PASS。

**Step 4: Review the diff**

确认：只改会话拖放、输入框接收、测试、计划和 Electron patch 版本；不影响项目排序、文件拖放、键盘 `&` 菜单、Chat 会话行或当前会话自引用规则。
