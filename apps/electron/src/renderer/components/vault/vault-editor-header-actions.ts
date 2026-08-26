export type VaultEditorHeaderAction = 'refresh' | 'save' | 'saved-status' | 'help'

/** 保存控件随草稿状态切换时，保持编辑器标题操作顺序稳定。 */
export function getVaultEditorHeaderActions(hasUnsavedChanges: boolean): VaultEditorHeaderAction[] {
  return hasUnsavedChanges
    ? ['refresh', 'save', 'help']
    : ['refresh', 'saved-status', 'help']
}
