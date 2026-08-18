# Obsidian Vault Integration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Let users connect one explicitly authorized Obsidian Vault, browse and edit its Markdown without format loss, quote Proma sources into it, and let agents safely search, read, and write the selected Vault.

**Architecture:** The Vault remains the canonical content store. Proma persists only a small JSON configuration containing the authorized real path, an optional inbox folder, and user-granted Agent read/write capability. A dedicated main-process service owns path validation, Markdown listing, optimistic writes, search, and source-block generation; renderer and Pi Agent tools call it through narrow IPC/service contracts.

**Tech Stack:** Electron 39, React 18, Jotai, TypeScript, Bun, shared IPC types, Node filesystem APIs, existing Markdown renderer and FileBrowser.

---

### Task 1: Define the shared Vault contract

**Files:**
- Create: `packages/shared/src/types/vault.ts`
- Modify: `packages/shared/src/types/index.ts`
- Modify: `packages/shared/src/types/agent.ts`
- Test: `packages/shared/src/types/vault.test.ts`

**Step 1: Write failing tests for Vault path, source, and optimistic-write contracts.**

Cover a selected Vault config, Markdown file summary, source snapshot types (`agent-history`, `skill`, `mcp`, `project-file`), and stale-content conflict response.

**Step 2: Implement only serializable shared types and `VAULT_IPC_CHANNELS`.**

Use relative Vault paths at every renderer/IPC boundary. Absolute paths must remain main-process configuration data.

**Step 3: Run the focused test.**

Run: `bun test packages/shared/src/types/vault.test.ts`

Expected: PASS.

### Task 2: Build the bounded main-process Vault service

**Files:**
- Create: `apps/electron/src/main/lib/vault-service.ts`
- Create: `apps/electron/src/main/lib/vault-service.test.ts`
- Modify: `apps/electron/src/main/lib/config-paths.ts`

**Step 1: Write failing service tests.**

Cover: candidate discovery from the platform Obsidian registry when available; explicit selection; canonical `realpath` root storage; Markdown-only listing; hidden directory exclusion; `..` and symlink escape rejection; byte-preserving read; atomic write; stale-content conflict; bounded content search; and append of a portable source block.

**Step 2: Implement Vault configuration and source block formatting.**

Store only `VaultConfig` at `~/.proma[-dev]/vault.json` through `readJsonFileSafe` and `writeJsonFileAtomic`. The first user selection authorizes the root. Discovery can suggest candidates but must not authorize or index them.

Source blocks must include a readable snapshot plus `proma://` metadata. The snapshot remains useful when the file moves outside Proma. The service must never read content beneath `.obsidian`, dot-directories, or non-Markdown files.

**Step 3: Run the focused service test.**

Run: `bun test apps/electron/src/main/lib/vault-service.test.ts`

Expected: PASS.

### Task 3: Expose a narrow IPC bridge

**Files:**
- Modify: `apps/electron/src/main/ipc.ts`
- Modify: `apps/electron/src/preload/index.ts`
- Modify: `packages/shared/src/types/agent.ts`
- Test: `apps/electron/src/main/lib/vault-service.test.ts`

**Step 1: Add IPC handlers and preload APIs.**

Expose discover/select/config/list/read/write/search/create and append-source operations. The renderer never supplies an arbitrary root path after selection, and write uses `{ relativePath, expectedContent, nextContent }` to detect an external modification before overwrite.

**Step 2: Test blocked paths and stale writes through the service-facing contract.**

Verify relative traversal, absolute paths, hidden folders, files outside the selected root, and symlink targets are rejected.

**Step 3: Run type checking for shared and Electron code.**

Run: `bun run typecheck`

Expected: PASS.

### Task 4: Add the Vault page and format-preserving editor

**Files:**
- Create: `apps/electron/src/renderer/atoms/vault-atoms.ts`
- Create: `apps/electron/src/renderer/components/vault/VaultView.tsx`
- Create: `apps/electron/src/renderer/components/vault/VaultMarkdownPane.tsx`
- Create: `apps/electron/src/renderer/components/vault/VaultQuoteTargetDialog.tsx`
- Modify: `apps/electron/src/renderer/atoms/active-view.ts`
- Modify: `apps/electron/src/renderer/components/tabs/MainArea.tsx`
- Modify: `apps/electron/src/renderer/components/app-shell/LeftSidebar.tsx`
- Modify: `apps/electron/src/renderer/components/app-shell/AppShell.tsx`
- Modify: `apps/electron/src/renderer/components/file-browser/FileBrowser.tsx`
- Test: `apps/electron/src/renderer/components/vault/vault-markdown-state.test.ts`

**Step 1: Write renderer state tests.**

Cover empty Vault state, selected file state, dirty source mode, disabled save while loading, and stale-content conflict without silent overwrite.

**Step 2: Implement a new `activeView: 'vault'`.**

Use the existing FileBrowser in a no-mutation mode for the left tree. Keep planning and agent-skills behavior unchanged, and suppress the session-only right-side panel on Vault pages.

**Step 3: Implement preview/source editing.**

Reuse `MarkdownRichEditor` in read-only mode only. Use a raw `textarea` in source-edit mode and write its exact string through Vault IPC; do not serialize Vault files through TipTap.

**Step 4: Run focused renderer tests.**

Run: `bun test apps/electron/src/renderer/components/vault/vault-markdown-state.test.ts`

Expected: PASS.

### Task 5: Add Proma source quoting into a Vault

**Files:**
- Create: `apps/electron/src/renderer/components/vault/vault-quote.ts`
- Create: `apps/electron/src/renderer/components/vault/vault-quote.test.ts`
- Modify: `apps/electron/src/renderer/components/selection/SelectionActionPopover.tsx`
- Modify: `apps/electron/src/renderer/components/agent/AgentHistorySelectionLayer.tsx`
- Modify: `apps/electron/src/renderer/components/agent/AgentView.tsx`
- Modify: `apps/electron/src/renderer/atoms/vault-atoms.ts`

**Step 1: Write source-block formatting tests.**

Verify readable Markdown callouts, escaped user content, `proma://` URI generation, message offsets, and graceful fallback for a selection that cannot be precisely positioned.

**Step 2: Add an explicit `引用到 Vault` selection action.**

Only show it once a Vault is authorized. Preserve the existing 2,000-character, hidden-content, and streaming-message safeguards. Clicking it switches to Vault and opens a target dialog for an existing Markdown file or a new note in the configured inbox.

**Step 3: Generalize source snapshots.**

The same shared `VaultSourceSnapshot` contract must support session, Skill, MCP, and project-file sources. Session selection is the first UI entry point; other sources use the same append API instead of a second file format.

**Step 4: Run quote tests.**

Run: `bun test apps/electron/src/renderer/components/vault/vault-quote.test.ts`

Expected: PASS.

### Task 6: Give Pi Agents narrowly scoped Vault tools

**Files:**
- Modify: `apps/electron/src/main/lib/adapters/pi-builtin-tools.ts`
- Modify: `apps/electron/src/main/lib/agent-orchestrator.ts`
- Modify: `apps/electron/src/main/lib/vault-service.ts`
- Create: `apps/electron/src/main/lib/adapters/pi-vault-tools.test.ts`

**Step 1: Write failing tool tests.**

Cover no configured Vault, read-only capability, valid `search_vault`, `read_vault_note`, `create_vault_note`, `update_vault_note`, and rejection of traversal, hidden paths, stale writes, automation, and delegation writes.

**Step 2: Implement four Pi-native tools.**

- `search_vault`: bounded filename/content results.
- `read_vault_note`: Markdown only, capped response.
- `create_vault_note`: write only under the configured inbox or explicit relative directory.
- `update_vault_note`: replace or append only after an expected-content check.

Read tools require an authorized Vault. Write tools also require the user-enabled Agent write capability and must reject automation/delegation sessions, because they cannot obtain real-time user intent.

**Step 3: Add current-note context deliberately.**

Do not inject the full Vault into every prompt. The current note is only made available after the user explicitly asks the Agent to work with it; all broader access flows through the tools.

**Step 4: Run focused Agent tool tests.**

Run: `bun test apps/electron/src/main/lib/adapters/pi-vault-tools.test.ts`

Expected: PASS.

### Task 7: Verify the production workflow and release metadata

**Files:**
- Modify: `apps/electron/package.json`
- Modify: `packages/shared/package.json`
- Modify: relevant tests from Tasks 1-6

**Step 1: Bump affected package patch versions.**

Increment `@proma/electron` and `@proma/shared` once, following repository policy.

**Step 2: Run all relevant checks.**

Run:

```text
bun test apps/electron/src/main/lib/vault-service.test.ts
bun test apps/electron/src/renderer/components/vault/vault-quote.test.ts
bun test apps/electron/src/main/lib/adapters/pi-vault-tools.test.ts
bun run typecheck
bun run electron:build
```

Expected: all PASS.

**Step 3: Manually verify in the Electron app.**

1. Select a Vault via the system directory dialog and verify no candidate is automatically authorized.
2. Browse nested Markdown files; `.obsidian` and dot-directories do not appear.
3. Preview and source-edit an Obsidian syntax fixture without changing unrelated bytes.
4. Select a completed Agent message and quote it to a new Vault note; verify the readable callout and `proma://` source metadata.
5. Ask an Agent to search/read a note, then verify write is rejected when Agent writes are disabled and works only in the selected Vault when enabled.

**Step 4: Inspect the final diff before commit.**

Run: `git diff --check` and `git status --short`.
