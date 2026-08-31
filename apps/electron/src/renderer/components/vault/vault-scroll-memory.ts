/**
 * Vault scroll memory — remembers where a note was being read.
 *
 * Storing raw `scrollTop` pixels does not survive a remount: CodeMirror creates
 * its DOM asynchronously, reports a short document until it has measured the
 * content, and scrolls the initial selection into view after mounting. Both
 * effects overwrite a pixel offset with 0, which is why the position looked as
 * if it had never been recorded.
 *
 * The memory therefore stores a *document anchor* (the position of the topmost
 * visible line) and restores it through CodeMirror's own scrollIntoView effect,
 * which is measurement-independent. A short settle window after each restore
 * stops CodeMirror's own post-mount scrolling from overwriting the memory.
 */

export interface VaultScrollAnchor {
  /** Document offset of the first visible line. */
  pos: number
  /** Pixels the anchor line was scrolled past, for sub-line accuracy. */
  lineOffset: number
}

export const VAULT_SCROLL_SETTLE_MS = 700
export const MAX_VAULT_SCROLL_ANCHORS = 200

// Insertion order is recency order. Reads refresh an entry; writes replace it.
// This bounds renderer-lifetime memory while retaining recently visited notes.
const anchorStore = new Map<string, VaultScrollAnchor>()

function copyAnchor(anchor: VaultScrollAnchor): VaultScrollAnchor {
  return { ...anchor }
}

export function readVaultScrollAnchor(key: string): VaultScrollAnchor | undefined {
  const stored = anchorStore.get(key)
  if (!stored) return undefined
  anchorStore.delete(key)
  anchorStore.set(key, stored)
  return copyAnchor(stored)
}

export function writeVaultScrollAnchor(key: string, anchor: VaultScrollAnchor): void {
  anchorStore.delete(key)
  anchorStore.set(key, copyAnchor(anchor))
  while (anchorStore.size > MAX_VAULT_SCROLL_ANCHORS) {
    const oldestKey = anchorStore.keys().next().value
    if (oldestKey === undefined) break
    anchorStore.delete(oldestKey)
  }
}

export function clearVaultScrollAnchors(): void {
  anchorStore.clear()
}

/** Snapshot for deterministic tests and explicit local inspection. */
export function dumpVaultScrollAnchors(): Record<string, VaultScrollAnchor> {
  return Object.fromEntries(Array.from(anchorStore, ([key, anchor]) => [key, copyAnchor(anchor)]))
}

/**
 * Scroll memory is scoped per Vault, surface, and note: identically named files
 * in different authorized Vaults never share state, and the center Obsidian view
 * and each session's right-workspace tab keep independent positions.
 */
export function getVaultScrollKey(vaultId: string, relativePath: string, sessionId?: string): string {
  return `${vaultId}:${sessionId ? `side:${sessionId}` : 'center'}:${relativePath}`
}

/** Tracks one mounted editor: restore first, then follow the reader. */
export class VaultScrollSession {
  private anchor: VaultScrollAnchor | null
  private restorePending: boolean
  private settledAt: number | null
  private readonly settleMs: number

  constructor(stored: VaultScrollAnchor | undefined, now: number, settleMs = VAULT_SCROLL_SETTLE_MS) {
    this.anchor = stored ? { ...stored } : null
    this.restorePending = Boolean(stored && (stored.pos > 0 || stored.lineOffset > 0))
    this.settledAt = this.restorePending ? null : now
    this.settleMs = settleMs
  }

  get pendingAnchor(): VaultScrollAnchor | null {
    return this.restorePending && this.anchor ? { ...this.anchor } : null
  }

  /** Called once the anchor has been handed to CodeMirror. */
  markRestoreApplied(now: number): void {
    this.restorePending = false
    this.settledAt = now
  }

  /**
   * A scroll may only be remembered once the editor has settled; earlier events
   * come from CodeMirror's own mount-time scrolling, not from the reader.
   */
  canRemember(now: number): boolean {
    if (this.restorePending) return false
    if (this.settledAt === null) return false
    return now - this.settledAt >= this.settleMs
  }

  remember(anchor: VaultScrollAnchor): VaultScrollAnchor {
    this.anchor = { ...anchor }
    return { ...this.anchor }
  }

  /** The reader scrolled explicitly, so stop waiting for the settle window. */
  takeOver(now: number): void {
    this.restorePending = false
    this.settledAt = Math.min(this.settledAt ?? now, now - this.settleMs)
  }

  /** Anchor to persist when the editor is torn down by a tab switch. */
  anchorForTeardown(): VaultScrollAnchor | null {
    return this.anchor ? { ...this.anchor } : null
  }
}
