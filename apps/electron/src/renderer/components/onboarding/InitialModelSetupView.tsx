import type { Channel } from '@proma/shared'
import { CheckCircle2 } from 'lucide-react'
import { ChannelForm } from '@/components/settings/ChannelForm'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

interface InitialModelSetupViewProps {
  onComplete: () => void
}

/**
 * 首次使用时在已加载的主界面上覆盖渠道创建 Dialog。
 * 这让用户能看到 Proma 已经可用，同时要求先保存一个渠道配置再开始交互。
 */
export function InitialModelSetupView({ onComplete }: InitialModelSetupViewProps): React.ReactElement {
  const handleSaved = (channel?: Channel): void => {
    if (channel) onComplete()
  }

  return (
    <Dialog open onOpenChange={() => undefined}>
      <DialogContent
        hideClose
        className="max-h-[calc(100vh-3rem)] max-w-5xl gap-0 overflow-y-auto p-0 sm:rounded-2xl"
        onEscapeKeyDown={(event) => event.preventDefault()}
        onPointerDownOutside={(event) => event.preventDefault()}
      >
        <div className="px-6 py-7 sm:px-8 sm:py-8">
          <DialogHeader className="mb-7 max-w-2xl text-left">
            <div className="mb-3 flex items-center gap-2 text-sm font-medium text-primary">
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
              <span>已进入 Proma</span>
            </div>
            <DialogTitle className="text-2xl font-semibold">添加模型渠道</DialogTitle>
            <DialogDescription className="mt-2 leading-6">
              完成这一步后即可开始使用 Proma；模型可稍后再添加。
            </DialogDescription>
          </DialogHeader>

          <ChannelForm
            channel={null}
            initialSetup
            onSaved={handleSaved}
            onCancel={() => undefined}
          />
        </div>
      </DialogContent>
    </Dialog>
  )
}
