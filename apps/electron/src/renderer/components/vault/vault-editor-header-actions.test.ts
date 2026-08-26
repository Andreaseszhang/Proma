import { describe, expect, test } from 'bun:test'
import { getVaultEditorHeaderActions } from './vault-editor-header-actions'

describe('Vault editor header actions', () => {
  test('Given a saved note When header actions are resolved Then refresh remains in the stable leading action position', () => {
    expect(getVaultEditorHeaderActions(false)).toEqual(['refresh', 'saved-status', 'help'])
  })

  test('Given an unsaved draft When header actions are resolved Then refresh is immediately left of save', () => {
    expect(getVaultEditorHeaderActions(true)).toEqual(['refresh', 'save', 'help'])
  })
})
