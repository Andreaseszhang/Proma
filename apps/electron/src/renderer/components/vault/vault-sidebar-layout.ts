export interface VaultSidebarLayout {
  renderSidebar: boolean
  renderExpandButton: boolean
  widthClass: 'w-[200px]' | 'w-[280px]' | null
}

export function getVaultSidebarLayout(collapsed: boolean, embedded: boolean): VaultSidebarLayout {
  if (collapsed) {
    return {
      renderSidebar: false,
      renderExpandButton: true,
      widthClass: null,
    }
  }
  return {
    renderSidebar: true,
    renderExpandButton: false,
    widthClass: embedded ? 'w-[200px]' : 'w-[280px]',
  }
}
