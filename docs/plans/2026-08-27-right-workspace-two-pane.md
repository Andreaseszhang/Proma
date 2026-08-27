# Right Workspace Two-Pane Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use `executing-plans` to implement this plan task-by-task.

**Goal:** Add a constrained two-pane comparison mode to the Agent right workspace: drag any right-workspace tab downward into a left/right drop zone, show exactly two tabs side by side, and restore the focused tab to a single pane with one action.

**Architecture:** Keep the existing per-session `agentDiffPanelTabAtom` as the compatibility pointer for the focused tab, and add a per-session split-state map containing `{ leftTab, rightTab, focusedPane, ratio }`. The unified top tab bar remains the only tab shelf; it marks both visible tabs and treats clicks as replacing the focused pane. `SidePanel` renders one or two pane bodies through a shared content renderer and sanitizes split state whenever dynamic tabs disappear. Browser tabs remain true native `WebContentsView`s; the browser controller is extended from one global presentation to multiple visible presentations within the current session while still hiding views from background sessions.

**Tech Stack:** Electron 43, React 18, TypeScript, Jotai, Tailwind, Bun test runner, Electron `WebContentsView`.

---

### Task 1: Define and test the split state machine

**Files:**
- Create: `apps/electron/src/renderer/lib/right-workspace-split.ts`
- Create: `apps/electron/src/renderer/lib/right-workspace-split.test.ts`
- Modify: `apps/electron/src/renderer/atoms/agent-atoms.ts`

**Steps:**
1. Write failing unit tests for creating a left/right split, focusing a pane, selecting an already-visible tab, replacing the focused pane, collapsing while preserving focus, removing a visible tab, sanitizing unavailable dynamic tabs, and clamping ratios.
2. Run `bun test apps/electron/src/renderer/lib/right-workspace-split.test.ts` and confirm failure.
3. Implement pure `createSplit`, `selectTabInSplit`, `focusSplitPane`, `collapseSplit`, `removeTabFromSplit`, and `sanitizeSplit` helpers with a strict two-pane model.
4. Add `agentSidePanelSplitMapAtom` and `agentSidePanelSplitRatioAtom`/per-session state types to `agent-atoms.ts`; keep transient tab IDs in renderer memory and persist only the divider ratio.
5. Re-run the focused test and confirm pass.

### Task 2: Add drag/drop affordances to the unified tab bar

**Files:**
- Modify: `apps/electron/src/renderer/components/diff/DiffPanelTabBar.tsx`
- Test: `apps/electron/src/renderer/lib/right-workspace-split.test.ts`

**Steps:**
1. Extend `WorkspacePanelTab` rendering with `visiblePane: 'left' | 'right' | null` and focused styling: focused pane uses the existing selected fill; the other visible pane gets a restrained outline/dual-pane marker.
2. Add pointer drag callbacks. Horizontal motion inside the bar remains non-destructive; crossing 24px below the bar starts split targeting. Escape/pointer cancel resets the gesture.
3. Expose drag preview state to `SidePanel` as `{ tabId, clientX, clientY }` and a drop callback.
4. Add a `Columns2`/single-pane action visible only while split; tooltip: `退出并排，保留当前标签`.
5. Add a context-menu fallback for `在左侧并排` and `在右侧并排` so the operation is keyboard/discoverability friendly.

### Task 3: Render and manage two side-panel panes

**Files:**
- Modify: `apps/electron/src/renderer/components/agent/SidePanel.tsx`
- Modify: `apps/electron/src/renderer/components/app-shell/RightSidePanel.tsx`

**Steps:**
1. Extract the existing single conditional content chain into a `renderWorkspacePane(tab, pane)` function/component without changing individual tab behavior.
2. Connect `agentSidePanelSplitMapAtom` for the current session. Keep `agentDiffPanelTabAtom` synchronized to the focused pane only.
3. Implement tab click rules: an already-visible tab only focuses its pane; any other tab replaces the focused pane; opening a new externally activated tab also targets the focused pane.
4. Render left/right panes with compact 32px pane headers, tab icon/title, focused-state cue, and click-to-focus behavior.
5. Add an 8px draggable divider, clamp ratio to 30–70%, persist the last ratio, and double-click to reset to 50/50.
6. Add the drag overlay: dim content slightly, expose left/right semantic drop zones, show `在左侧并排` / `在右侧并排`, and cancel outside valid zones.
7. On collapse, keep the focused pane and leave the other tab open in the top tab shelf.
8. Sanitize split state when Preview, Terminal, Browser, Chat, exploration, delegation, or workspace-component tabs close; collapse automatically to the surviving pane.

### Task 4: Integrate automatic wide sizing

**Files:**
- Modify: `apps/electron/src/renderer/components/app-shell/AppShell.tsx`
- Modify: `apps/electron/src/renderer/atoms/agent-atoms.ts`

**Steps:**
1. Read current-session split state in `AppShell`.
2. Treat split mode as an expanded workspace with a preferred minimum of 720px, while preserving the existing `MIN_MAIN_AREA_WIDTH` safety clamp on narrow windows.
3. While split is active, temporarily use the existing wide-layout calculation and `widePanelWidthOverride`, but do not write the split minimum back to the session's ordinary `width` or mark an embedded Browser/Preview as a permanently opened wide workspace.
4. Confirm collapse restores the session's prior ordinary/wide width, preserves any user-resized wide override for the next split, and does not cause resize oscillation.

### Task 5: Allow two managed browser tabs to remain visible

**Files:**
- Modify: `apps/electron/src/main/lib/browser-controller.ts`
- Modify: `apps/electron/src/renderer/components/browser/BrowserSlot.tsx` only if the controller contract needs a stable slot generation.
- Create or extend focused browser layout tests near `apps/electron/src/main/lib/` if controller dependencies permit; otherwise isolate and test presentation-set helpers.

**Steps:**
1. Replace the single `presentation` pointer with a set/map of currently presented `{ sessionId, tabId, revision }` records and move stale-layout rejection to the addressed tab.
2. On a visible layout update, hide native views belonging to other sessions but retain other explicitly visible tabs in the same foreground session.
3. On hide/unmount, detach only the addressed tab and remove only its presentation record.
4. Update activation so focusing one visible browser tab changes controller history/navigation ownership without hiding the second visible browser tab.
5. Update minimize, close, background-session detection, pruning, and dispose paths to clear every presentation belonging to the affected session/tab.
6. Verify Browser + renderer tab and Browser + Browser layouts both publish independent bounds and remain clickable.

### Task 6: Version, typecheck, tests, and visual validation

**Files:**
- Modify: `apps/electron/package.json` (`0.18.2` → next patch)
- Modify: `packages/shared/package.json` when the native Browser focus IPC contract is added.
- Modify tests as required by findings.

**Steps:**
1. Increment `@proma/electron` patch version.
2. Run focused tests: `bun test apps/electron/src/renderer/lib/right-workspace-split.test.ts` plus browser-controller-related tests.
3. Run `bun run --filter='@proma/electron' typecheck`.
4. Run `bun run --filter='@proma/electron' build:renderer` and relevant main build when browser-controller changes compile.
5. Launch the development app and visually test: left/right drops, Escape cancel, focus switching, tab replacement, divider drag/reset, single-pane restore, dynamic-tab close, narrow viewport, Browser + Terminal, and Browser + Browser.
6. Inspect console errors and verify native browser views do not cover drop overlays while a drag is active; if necessary, temporarily hide BrowserSlot during the active drag gesture without closing the browser session.
7. Review `git diff --check`, `git status`, and the final diff; do not create a commit or PR until the user requests it.
