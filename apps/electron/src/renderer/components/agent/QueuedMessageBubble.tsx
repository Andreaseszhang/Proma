/**
 * QueuedMessageBubble — 排队消息气泡
 *
 * 在对话历史底部渲染排队中的用户消息。
 * 外观复用用户消息气泡样式，附加"排队中"标记和操作按钮。
 * 每条消息可「立即发送」或「打断并取消」。
 */

import * as React from 'react'
import { useAtomValue } from 'jotai'
import { Zap, Square, Clock } from 'lucide-react'
import { toast } from 'sonner'
import {
  Message,
  MessageContent,
  UserMessageContent,
} from '@/components/ai-elements/message'
import { UserAvatar } from '@/components/chat/UserAvatar'
import { Button } from '@/components/ui/button'
import {
  currentQueuedMessagesAtom,
} from '@/atoms/agent-atoms'
import type { QueuedMessage } from '@/atoms/agent-atoms'
import { userProfileAtom } from '@/atoms/user-profile'

interface QueuedMessageBubbleProps {
  sessionId: string
}

export function QueuedMessageBubble({ sessionId }: QueuedMessageBubbleProps): React.ReactElement | null {
  const queuedMessages = useAtomValue(currentQueuedMessagesAtom)
  const userProfile = useAtomValue(userProfileAtom)

  if (queuedMessages.length === 0) return null

  const handlePromote = async (msg: QueuedMessage): Promise<void> => {
    try {
      await window.electronAPI.promoteQueuedAgentMessage({
        sessionId,
        messageUuid: msg.uuid,
      })
    } catch (error) {
      console.error('[QueuedMessageBubble] 提升队列消息失败:', error)
      toast.error('立即发送失败', { description: String(error) })
    }
  }

  const handleInterrupt = async (): Promise<void> => {
    try {
      await window.electronAPI.stopAgent(sessionId)
      toast.info('已打断 Agent 当前任务')
    } catch (error) {
      console.error('[QueuedMessageBubble] 打断失败:', error)
      toast.error('打断失败', { description: String(error) })
    }
  }

  return (
    <>
      {queuedMessages.map((msg) => (
        <div key={msg.uuid} className="animate-in slide-in-from-bottom-2 duration-200">
          <Message from="user">
            {/* 用户头像 + 名称 + 排队标记 */}
            <div className="flex items-start gap-2.5 mb-2.5">
              <UserAvatar avatar={userProfile.avatar} size={35} />
              <div className="flex flex-col justify-between h-[35px]">
                <span className="text-sm font-semibold text-foreground/60 leading-none">
                  {userProfile.userName}
                </span>
                <span className="inline-flex items-center gap-1 text-[10px] text-primary/60 leading-none">
                  <Clock className="size-2.5 animate-pulse" />
                  排队中
                </span>
              </div>
            </div>

            {/* 消息内容 */}
            <MessageContent>
              <div className="opacity-70">
                <UserMessageContent>{msg.text}</UserMessageContent>
              </div>
            </MessageContent>

            {/* 操作按钮 */}
            <div className="flex items-center gap-1.5 pl-[46px] mt-1.5">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2.5 text-xs font-medium text-primary hover:bg-primary/10"
                onClick={() => handlePromote(msg)}
              >
                <Zap className="size-3 mr-1" />
                立即发送
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2.5 text-xs font-medium text-destructive/70 hover:text-destructive hover:bg-destructive/10"
                onClick={handleInterrupt}
              >
                <Square className="size-3 mr-1" />
                打断并取消
              </Button>
            </div>
          </Message>
        </div>
      ))}
    </>
  )
}
