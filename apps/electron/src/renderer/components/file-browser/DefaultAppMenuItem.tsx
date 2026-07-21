/**
 * DefaultAppMenuItem — DropdownMenuItem 形式的"用默认 App 打开"。
 *
 * 探测本机为该文件类型注册的默认 App，成功时显示「用 XX 打开」并带 App Logo。
 * 探测失败时保留「用系统默认应用打开」命令，保证系统打开能力不依赖显示元数据。
 */

import * as React from 'react'
import { ExternalLink } from 'lucide-react'
import { DropdownMenuItem } from '@/components/ui/dropdown-menu'
import { useDefaultAppForFile } from '@/hooks/useDefaultAppForFile'

interface DefaultAppMenuItemProps {
  filePath: string
  className?: string
}

export function DefaultAppMenuItem({
  filePath,
  className,
}: DefaultAppMenuItemProps): React.ReactElement {
  const info = useDefaultAppForFile(filePath)

  return (
    <DropdownMenuItem
      className={className}
      onSelect={() => {
        window.electronAPI.systemOpenFile(filePath).catch((err) => {
          console.error('[DefaultAppMenuItem] 打开文件失败:', err)
        })
      }}
    >
      {info?.iconDataUrl ? (
        <img
          src={info.iconDataUrl}
          alt=""
          className="size-3.5 shrink-0"
          draggable={false}
        />
      ) : (
        <ExternalLink className="size-3.5 shrink-0" />
      )}
      <span className="truncate">
        {info?.name ? `用 ${info.name} 打开` : '用系统默认应用打开'}
      </span>
    </DropdownMenuItem>
  )
}
