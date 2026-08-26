import { describe, expect, test } from 'bun:test'
import { getVaultSidebarLayout } from './vault-sidebar-layout'

describe('Vault sidebar layout', () => {
  test('Given a collapsed file tree When layout is resolved Then no sidebar width remains', () => {
    expect(getVaultSidebarLayout(true, false)).toEqual({
      renderSidebar: false,
      renderExpandButton: true,
      widthClass: null,
    })
  })

  test('Given an expanded embedded Vault When layout is resolved Then the full embedded sidebar returns', () => {
    expect(getVaultSidebarLayout(false, true)).toEqual({
      renderSidebar: true,
      renderExpandButton: false,
      widthClass: 'w-[200px]',
    })
  })
})
