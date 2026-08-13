# Managed Browser Popup Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the managed browser's asynchronous popup denial with an Electron 39 `createWindow` implementation that preserves `window.open()` opener semantics while keeping popup WebContents inside the existing managed tab surface.

**Architecture:** Each popup is created synchronously as a secure `WebContentsView` and its `WebContents` is returned from `setWindowOpenHandler({ action: 'allow', createWindow })`. The popup is tracked as a child of its opener tab, rendered through the existing single browser presentation slot, and inherits the existing HTTP(S), DNS-private-network, download, and sandbox guards. Popup metadata is shared with the renderer only for tab labeling; no clipboard permissions or unrestricted protocols are added.

**Tech Stack:** Electron 39 WebContentsView, React 18, Jotai, Bun test, `@proma/shared` browser state types.

---

### Task 1: Add popup tab metadata

**Files:**
- Modify: `apps/electron/src/main/lib/browser-controller.ts`
- Modify: `packages/shared/src/types/browser.ts`
- Modify: `apps/electron/src/renderer/components/browser/BrowserPanel.tsx`

**Steps:**
1. Extend the internal tab record with `openedByPopup` and `openerTabId`.
2. Extend `BrowserTabSummary` with `openedByPopup`.
3. Add a compact Popup label in the existing tab strip.
4. Keep popup tabs user-visible and distinct from Agent-owned work tabs.

### Task 2: Implement synchronous managed popup creation

**Files:**
- Modify: `apps/electron/src/main/lib/browser-controller.ts`

**Steps:**
1. Add a synchronous supported-popup URL classifier for HTTP(S), `about:blank`, `blob:`, and `data:`.
2. Replace the current `action: 'deny'` handler with `action: 'allow'`, `outlivesOpener: false`, and `createWindow`.
3. In `createWindow`, create a secure managed `WebContentsView`, attach it to a popup tab record, activate it for display, and return its `webContents`.
4. Preserve Electron's opener relationship by returning the child `WebContents` instead of manually navigating a detached tab.
5. Keep all existing security preferences and navigation guards on popup tabs.
6. Remove the old asynchronous `openExternalLinkInDisplayTab` path once no longer used.

### Task 3: Manage popup lifecycle

**Files:**
- Modify: `apps/electron/src/main/lib/browser-controller.ts`

**Steps:**
1. When a tab is disposed, recursively dispose child popup tabs first.
2. When a popup's WebContents is destroyed by page code or Chromium, clean its descendants and repair active/Agent tab selection.
3. Ensure parent tab closure cannot leave an orphaned popup WebContentsView.
4. Ensure popup creation after the source tab/session has been closed is rejected without creating a dangling view.

### Task 4: Add policy tests

**Files:**
- Create: `apps/electron/src/main/lib/browser-policy.test.ts`

**Steps:**
1. Test that `about:blank`, `blob:`, and `data:` are accepted as popup entry URLs.
2. Test that `file:`, `javascript:`, and malformed URLs are rejected.
3. Test that existing HTTP(S) normalization remains unchanged for supported popup URLs.
4. Keep tests pure and avoid real external network access.

### Task 5: Version and verify

**Files:**
- Modify: `apps/electron/package.json`
- Modify: `packages/shared/package.json`

**Steps:**
1. Increment patch versions for the Electron and shared packages after implementation.
2. Run `bun run --filter='@proma/shared' typecheck`.
3. Run `bun run --filter='@proma/electron' typecheck`.
4. Run the focused browser policy test and the repository test command if practical.
5. Review `git diff` and report any remaining end-to-end gaps, especially OAuth/postMessage and real-site popup behavior.
