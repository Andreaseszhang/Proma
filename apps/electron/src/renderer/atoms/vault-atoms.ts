import { atom } from 'jotai'
import type { VaultReadResult } from '@proma/shared'

export const selectedVaultFileAtom = atom<string | null>(null)
export const vaultReadResultAtom = atom<VaultReadResult | null>(null)
export const vaultRefreshTokenAtom = atom(0)
