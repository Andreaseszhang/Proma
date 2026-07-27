import * as React from 'react'
import { Bot, Copy, MessageCircle } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

interface SelectionActionPopoverProps {
  x: number
  y: number
  onAddToAgent: () => void
  onCopyAsQuote?: () => void | Promise<void>
  onOpenChat: () => void | Promise<void>
}

export function SelectionActionPopover({
  x,
  y,
  onAddToAgent,
  onCopyAsQuote,
  onOpenChat,
}: SelectionActionPopoverProps): React.ReactElement {
  return (
    <div
      data-selection-action-popover
      className="fixed z-[90] -translate-x-1/2 -translate-y-full rounded-xl bg-popover/95 px-2 py-1.5 text-popover-foreground shadow-xl ring-1 ring-border/40 backdrop-blur"
      style={{ left: x, top: y }}
      onMouseDown={(event) => event.preventDefault()}
    >
      <div className="flex items-center gap-1">
        <button
          type="button"
          className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-medium transition-colors hover:bg-muted"
          onClick={onAddToAgent}
        >
          <Bot className="size-4" />
          为 Agent 引用
        </button>
        <button
          type="button"
          className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-medium transition-colors hover:bg-muted"
          onClick={() => {
            void onOpenChat()
          }}
        >
          <MessageCircle className="size-4" />
          打开右侧问答
        </button>
        {onCopyAsQuote && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-medium transition-colors hover:bg-muted"
                onClick={() => {
                  void onCopyAsQuote()
                }}
              >
                <Copy className="size-4" />
                复制为会话引用块
              </button>
            </TooltipTrigger>
            <TooltipContent side="top">用于粘贴到草稿或其他 Agent 会话中作为上下文</TooltipContent>
          </Tooltip>
        )}
      </div>
    </div>
  )
}
