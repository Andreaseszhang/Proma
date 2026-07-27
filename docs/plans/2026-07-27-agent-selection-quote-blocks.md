# Agent Selection Quote Blocks Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Let users copy a selected Agent-message excerpt as a compact, clickable quote chip that can be pasted into Scratch Pad or another Agent prompt.

**Architecture:** Encode selected source metadata and snapshot text into an application clipboard MIME type plus a portable token. Parse the token into a shared TipTap inline node in Scratch Pad and Agent input, serialize it to a stable prompt token, inject the snapshot as Agent context on send, and render sent tokens as clickable message chips that open and highlight the original message.

**Tech Stack:** Electron clipboard, React 18, Tiptap v3, Jotai, Tailwind, Vitest.

---

### Task 1: Quote-reference data and serialization helpers

**Files:**
- Create: `apps/electron/src/renderer/lib/agent-quote-reference.ts`
- Test: `apps/electron/src/renderer/lib/agent-quote-reference.test.ts`

**Step 1:** Write focused tests for clipboard parsing, portable prompt tokens, title formatting, and malformed input rejection.

**Step 2:** Implement a compact typed reference model with session ID, source message ID, title, turn ordinal, role, selection snapshot, and selection bounds.

**Step 3:** Run the helper tests.

### Task 2: Selection action and editor chips

**Files:**
- Modify: `components/selection/SelectionActionPopover.tsx`
- Modify: `components/agent/AgentHistorySelectionLayer.tsx`
- Modify: `components/ai-elements/rich-text-input.tsx`
- Modify: `components/scratch-pad/ScratchPadView.tsx`
- Create: `components/agent/AgentQuoteReference.tsx`

**Step 1:** Add a `复制为引用块` selection action, copying a custom MIME payload and an HTML/text fallback.

**Step 2:** Create a shared inline TipTap node with Bot icon, orange-yellow token styling, accessible label, and click callback.

**Step 3:** Register it in both editor extension sets and intercept paste to insert the node.

**Step 4:** Preserve it through Scratch Pad Markdown conversion as a portable token.

### Task 3: Agent context injection and jump navigation

**Files:**
- Modify: `lib/agent-message-queue.ts`
- Modify: `components/agent/AgentView.tsx`
- Modify: `components/ai-elements/message.tsx`
- Modify: `components/agent/AgentMessages.tsx` or the actual message-container owner
- Modify: session navigation atoms/hooks as required

**Step 1:** Parse quote tokens out of sent prompt text and prepend XML context blocks containing the original selection snapshot.

**Step 2:** Render quote tokens in sent user messages as the same clickable chip.

**Step 3:** On chip click, open the source Agent session, then scroll and temporarily highlight the target message DOM node.

**Step 4:** Add focused unit tests for parsing/context injection and navigation state helpers where practical.

### Task 4: Verification

**Files:**
- Test: affected helper and queue tests

**Step 1:** Run focused Vitest tests.

**Step 2:** Run the Electron renderer typecheck/lint command defined by the repository.

**Step 3:** Review the final diff for regressions to existing Skill, MCP, file, and session mentions.
