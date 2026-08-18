import { atom } from 'jotai'
import type { VaultReadResult } from '@proma/shared'
import type { QuotedSelection } from './preview-atoms'

export interface PendingVaultQuote {
  sessionId: string
  quote: QuotedSelection
}

export const selectedVaultFileAtom = atom<string | null>(null)
export const vaultReadResultAtom = atom<VaultReadResult | null>(null)
export const vaultRefreshTokenAtom = atom(0)
export const pendingVaultQuoteAtom = atom<PendingVaultQuote | null>(null)
