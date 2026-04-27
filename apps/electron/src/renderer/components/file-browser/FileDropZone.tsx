/**
 * FileDropZone — 文件拖拽上传区域
 *
 * 极简 inline 提示，拖拽时高亮。文件上传后直接保存到目标目录。
 */

import * as React from 'react'
import { toast } from 'sonner'
import { Paperclip, FolderPlus, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { fileToBase64 } from '@/lib/file-utils'

interface FileDropZoneProps {
  workspaceSlug: string
  sessionId?: string
  target?: 'session' | 'workspace'
  onFilesUploaded: () => void
  onAttachFolder?: () => void
  onFoldersDropped?: (folderPaths: string[]) => void
  /** 拖拽区域的 tooltip 提示文字 */
  tooltip?: string
}

export function FileDropZone({ workspaceSlug, sessionId, target = 'session', onFilesUploaded, onAttachFolder, onFoldersDropped, tooltip }: FileDropZoneProps): React.ReactElement {
  const [isDragOver, setIsDragOver] = React.useState(false)
  const [isUploading, setIsUploading] = React.useState(false)

  const isWorkspace = target === 'workspace'

  const saveFiles = React.useCallback(async (files: globalThis.File[]): Promise<void> => {
    if (files.length === 0) return

    setIsUploading(true)
    try {
      const fileEntries: Array<{ filename: string; data: string }> = []
      for (const file of files) {
        const base64 = await fileToBase64(file)
        fileEntries.push({ filename: file.name, data: base64 })
      }

      if (isWorkspace) {
        await window.electronAPI.saveFilesToWorkspaceFiles({
          workspaceSlug,
          files: fileEntries,
        })
      } else {
        await window.electronAPI.saveFilesToAgentSession({
          workspaceSlug,
          sessionId: sessionId!,
          files: fileEntries,
        })
      }

      onFilesUploaded()
      toast.success(`已添加 ${files.length} 个文件`)
    } catch (error) {
      console.error('[FileDropZone] 文件上传失败:', error)
      toast.error('文件上传失败')
    } finally {
      setIsUploading(false)
    }
  }, [workspaceSlug, sessionId, isWorkspace, onFilesUploaded])

  const handleDragOver = React.useCallback((e: React.DragEvent): void => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(true)
  }, [])

  const handleDragLeave = React.useCallback((e: React.DragEvent): void => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)
  }, [])

  const handleDrop = React.useCallback(async (e: React.DragEvent): Promise<void> => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)

    const droppedFiles = Array.from(e.dataTransfer.files)
    if (droppedFiles.length === 0) return

    const pathMap = new Map<string, globalThis.File>()
    const paths: string[] = []
    for (const f of droppedFiles) {
      try {
        const p = window.electronAPI.getPathForFile(f)
        if (p) {
          paths.push(p)
          pathMap.set(p, f)
        }
      } catch { /* 无法获取路径时忽略 */ }
    }

    if (paths.length > 0) {
      try {
        const { directories, files: filePaths } = await window.electronAPI.checkPathsType(paths)

        if (directories.length > 0) {
          if (onFoldersDropped) {
            onFoldersDropped(directories)
          } else {
            toast.info('不支持拖拽文件夹', { description: '请使用「附加文件夹」按钮' })
          }
        }

        const regularFiles = filePaths.map((p) => pathMap.get(p)!).filter(Boolean)
        if (regularFiles.length > 0) {
          await saveFiles(regularFiles)
        }
      } catch (error) {
        console.error('[FileDropZone] 路径检测失败，回退处理:', error)
        await saveFiles(droppedFiles)
      }
    } else {
      await saveFiles(droppedFiles)
    }
  }, [saveFiles, onFoldersDropped])

  const handleSelectFiles = React.useCallback(async (): Promise<void> => {
    try {
      const result = await window.electronAPI.openFileDialog()
      if (result.files.length === 0) return

      setIsUploading(true)
      const fileEntries = result.files.map((f) => ({
        filename: f.filename,
        data: f.data,
      }))

      if (isWorkspace) {
        await window.electronAPI.saveFilesToWorkspaceFiles({
          workspaceSlug,
          files: fileEntries,
        })
      } else {
        await window.electronAPI.saveFilesToAgentSession({
          workspaceSlug,
          sessionId: sessionId!,
          files: fileEntries,
        })
      }

      onFilesUploaded()
      toast.success(`已添加 ${result.files.length} 个文件`)
    } catch (error) {
      console.error('[FileDropZone] 选择文件失败:', error)
      toast.error('文件上传失败')
    } finally {
      setIsUploading(false)
    }
  }, [workspaceSlug, sessionId, isWorkspace, onFilesUploaded])

  const dropZone = (
    <div
      className={cn(
        'flex items-center gap-1.5 rounded-lg px-2 py-3 transition-colors duration-200',
        isDragOver
          ? 'bg-primary/10 ring-1 ring-primary/30'
          : 'bg-muted/40 hover:bg-muted/70',
        isUploading && 'pointer-events-none opacity-60',
      )}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {isUploading ? (
        <>
          <Loader2 className="size-3.5 text-muted-foreground animate-spin" />
          <span className="text-[11px] text-muted-foreground">正在上传...</span>
        </>
      ) : (
        <>
          <Paperclip className="size-3.5 text-muted-foreground/60 flex-shrink-0" />
          <span className="text-[11px] text-muted-foreground/75 flex-1 truncate">
            {isDragOver ? '释放以添加文件' : '拖拽文件到此处'}
          </span>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-5 w-5 flex-shrink-0 text-muted-foreground/60 hover:text-foreground"
                onClick={handleSelectFiles}
              >
                <Paperclip className="size-3" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              <p>{isWorkspace ? '添加文件到工作区文件目录' : '将文件放入 Agent 工作文件夹'}</p>
            </TooltipContent>
          </Tooltip>
          {onAttachFolder && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-5 w-5 flex-shrink-0 text-muted-foreground/60 hover:text-foreground"
                  onClick={onAttachFolder}
                >
                  <FolderPlus className="size-3" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                <p>{isWorkspace ? '附加文件夹供工作区所有会话访问' : '告知 Agent 你想处理的文件夹'}</p>
              </TooltipContent>
            </Tooltip>
          )}
        </>
      )}
    </div>
  )

  return (
    <div className="flex-shrink-0 px-3 pt-2 pb-1.5">
      {tooltip && !isDragOver && !isUploading ? (
        <Tooltip>
          <TooltipTrigger asChild>
            {dropZone}
          </TooltipTrigger>
          <TooltipContent side="bottom">
            <p className="text-[12px]">{tooltip}</p>
          </TooltipContent>
        </Tooltip>
      ) : (
        dropZone
      )}
    </div>
  )
}
