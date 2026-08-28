import { describe, expect, test } from 'bun:test'
import { getVaultEditorKey, shouldAdoptVaultReadContent } from './vault-editor-lifecycle'

describe('Vault editor lifecycle', () => {
  test('keeps the editor identity stable when a saved file gets a new content hash', () => {
    const path = 'Proma Inbox/Note.md'

    expect(getVaultEditorKey(path, 'before-save')).toBe(getVaultEditorKey(path, 'after-save'))
    expect(getVaultEditorKey(path, 'after-save')).not.toBe(getVaultEditorKey('Proma Inbox/Other.md', 'after-save'))
  })

  test('adopts an external refresh only when there is no local draft divergence', () => {
    expect(shouldAdoptVaultReadContent('same', 'same')).toBe(true)
    expect(shouldAdoptVaultReadContent('local edit', 'same')).toBe(false)
  })
})
