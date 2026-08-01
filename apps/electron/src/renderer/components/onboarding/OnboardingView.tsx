/**
 * Onboarding 视图组件
 *
 * 首次启动时显示的全屏欢迎界面。
 *
 * 视觉：参考经典欢迎页的分屏结构 ——
 *  左侧：Edward Hopper《海边的房间》风格画作（深蓝海洋、白色墙壁、几何硬阴影、暖黄阳光）
 *  右侧：暖白面板承载全部引导功能
 *
 * 流程：
 *  Step 1：欢迎 + 教程入口
 *  Step 2：Windows 环境检测（仅 Windows，其他平台自动跳过）
 */

import { useMemo, useState } from 'react'
import { useAtomValue, useSetAtom } from 'jotai'
import { GraduationCap, ChevronRight, ChevronLeft, HardDriveDownload, Users, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { EnvironmentCheckPanel } from '@/components/environment/EnvironmentCheckPanel'
import { isShellEnvironmentOkAtom } from '@/atoms/environment'
import { detectIsWindows } from '@/lib/platform'
import { migrationImportDialogOpenAtom } from '@/atoms/migration-atoms'
import roomsByTheSea from '@/assets/onboarding/rooms-by-the-sea.jpg'

interface OnboardingViewProps {
  onComplete: (openTutorial?: boolean) => void
}

export function OnboardingView({ onComplete }: OnboardingViewProps) {
  const [step, setStep] = useState<'welcome' | 'environment'>('welcome')
  const isWindows = useMemo(() => detectIsWindows(), [])
  const shellOk = useAtomValue(isShellEnvironmentOkAtom)
  const setMigrationImportDialogOpen = useSetAtom(migrationImportDialogOpenAtom)

  const handleFinish = async (openTutorial?: boolean) => {
    await window.electronAPI.updateSettings({ onboardingCompleted: true })
    onComplete(openTutorial)
  }

  const handleNextFromWelcome = () => {
    if (isWindows) {
      setStep('environment')
    } else {
      handleFinish()
    }
  }

  const handleOpenMigration = () => {
    setMigrationImportDialogOpen(true)
  }

  const stepIndex = step === 'welcome' ? 1 : 2
  const totalSteps = isWindows ? 2 : 1

  return (
    <div className="flex h-screen w-full flex-col overflow-hidden bg-[#fbf9f6] md:flex-row">
      {/* ===== 左侧：Hopper 海景画作 ===== */}
      <div className="relative h-44 shrink-0 overflow-hidden md:h-auto md:w-[52%]">
        <img
          src={roomsByTheSea}
          alt="Edward Hopper 风格的海景房间"
          className="absolute inset-0 h-full w-full object-cover"
        />
        {/* 光感渐变遮罩 */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/5 to-black/15 md:bg-gradient-to-tr md:from-black/60 md:via-transparent md:to-black/20" />

        {/* 左上角品牌 */}
        <div className="absolute left-6 top-6 flex items-center gap-2.5 md:left-10 md:top-8">
          <div className="flex h-7 w-7 items-center justify-center rounded-sm border border-white/40 bg-white/15 backdrop-blur-sm">
            <span className="h-3 w-3 rounded-[2px] bg-white/90" />
          </div>
          <span className="text-sm font-semibold tracking-wide text-white">Proma</span>
        </div>

        {/* 左下角标语（呼应画作气质） */}
        <div className="absolute bottom-6 left-6 right-6 md:bottom-10 md:left-10 md:right-10">
          <p className="text-lg font-light leading-snug text-white md:text-2xl">
            让协作自然发生，让想法流动成形。
          </p>
          <p className="mt-2 text-[11px] uppercase tracking-[0.3em] text-white/70 md:text-xs">
            Local-first AI Agent
          </p>
        </div>

        {/* 右下角画作签名装饰 */}
        <div className="absolute bottom-6 right-6 hidden select-none text-[10px] uppercase tracking-widest text-white/50 md:bottom-10 md:right-10 md:block">
          Rooms by the Sea
        </div>
      </div>

      {/* ===== 右侧：功能面板 ===== */}
      <div className="relative flex flex-1 items-center justify-center overflow-y-auto">
        {/* 右上角步骤指示 */}
        <div className="absolute right-8 top-6 text-xs font-medium tracking-[0.2em] text-neutral-400 md:right-10 md:top-8">
          {String(stepIndex).padStart(2, '0')} / {String(totalSteps).padStart(2, '0')}
        </div>

        {step === 'welcome' ? (
          <div className="w-full max-w-xl px-6 py-10 md:px-10">
            {/* 状态徽章 */}
            <div className="mb-6 flex items-center gap-2.5">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#1e3a5f] text-white">
                <Check size={13} strokeWidth={3} />
              </span>
              <span className="text-sm font-medium text-neutral-500">准备就绪</span>
            </div>

            <h1 className="text-3xl font-semibold tracking-tight text-neutral-900 md:text-4xl">
              欢迎使用 Proma
            </h1>
            <p className="mt-3 text-base leading-relaxed text-neutral-500 md:text-lg">
              下一代桌面 AI 软件，让通用 Agent 触手可及
            </p>

            {/* 功能入口 */}
            <div className="mt-8 space-y-3">
              <button
                onClick={() => handleFinish(true)}
                className="group flex w-full items-center gap-4 rounded-sm border border-neutral-200/80 bg-white/80 p-4 text-left shadow-[4px_4px_0_rgba(30,58,95,0.08)] transition-all hover:-translate-y-0.5 hover:border-[#1e3a5f]/25 hover:shadow-[6px_6px_0_rgba(30,58,95,0.16)]"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-sm bg-[#1e3a5f]/10 text-[#1e3a5f] transition-colors group-hover:bg-[#1e3a5f] group-hover:text-white">
                  <GraduationCap size={20} />
                </div>
                <div className="flex-1">
                  <h3 className="text-sm font-semibold text-neutral-900">查看使用教程</h3>
                  <p className="mt-0.5 text-xs text-neutral-500">
                    了解 Proma 的全部功能和使用技巧
                  </p>
                </div>
              </button>

              <p className="pt-1 text-sm text-neutral-500">
                自己或身边的人已经在用 Proma？直接导入现有配置
              </p>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <button
                  onClick={handleOpenMigration}
                  className="group flex items-center gap-3 rounded-sm border border-neutral-200/80 bg-white/80 p-4 text-left shadow-[4px_4px_0_rgba(30,58,95,0.08)] transition-all hover:-translate-y-0.5 hover:border-[#1e3a5f]/25 hover:shadow-[6px_6px_0_rgba(30,58,95,0.16)]"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-sm bg-[#1e3a5f]/10 text-[#1e3a5f] transition-colors group-hover:bg-[#1e3a5f] group-hover:text-white">
                    <HardDriveDownload size={20} />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-sm font-semibold text-neutral-900">从其他设备迁移</h3>
                    <p className="mt-0.5 text-xs text-neutral-500">
                      导入自己其他设备上的配置
                      <br />
                      <br />
                      需要先在原设备上导出 .proma-backup 文件，再双击导入即可
                    </p>
                  </div>
                </button>
                <button
                  onClick={handleOpenMigration}
                  className="group flex items-center gap-3 rounded-sm border border-neutral-200/80 bg-white/80 p-4 text-left shadow-[4px_4px_0_rgba(30,58,95,0.08)] transition-all hover:-translate-y-0.5 hover:border-[#1e3a5f]/25 hover:shadow-[6px_6px_0_rgba(30,58,95,0.16)]"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-sm bg-[#1e3a5f]/10 text-[#1e3a5f] transition-colors group-hover:bg-[#1e3a5f] group-hover:text-white">
                    <Users size={20} />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-sm font-semibold text-neutral-900">导入其他用户的配置</h3>
                    <p className="mt-0.5 text-xs text-neutral-500">
                      从同事或团队成员处导入环境
                      <br />
                      <br />
                      需要先导出 .proma-share 文件，再双击导入即可
                    </p>
                  </div>
                </button>
              </div>
            </div>

            {/* 主操作 */}
            <div className="mt-8 space-y-2">
              <button
                onClick={handleNextFromWelcome}
                className="flex h-12 w-full items-center justify-center gap-1.5 rounded-sm bg-[#16293c] text-base font-medium text-white shadow-[0_4px_0_rgba(22,41,60,0.35)] transition-all hover:bg-[#1e3a5f] active:translate-y-0.5 active:shadow-none"
              >
                {isWindows ? (
                  <>
                    下一步：环境检测
                    <ChevronRight className="h-4 w-4" />
                  </>
                ) : (
                  '开始使用'
                )}
              </button>
              <p className="text-center text-xs text-neutral-400">
                这些内容之后也能在设置中找到，不用担心错过
              </p>
            </div>
          </div>
        ) : (
          <div className="w-full max-w-xl px-6 py-10 md:px-10">
            {/* 状态徽章 */}
            <div className="mb-6 flex items-center gap-2.5">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#1e3a5f] text-white">
                <Check size={13} strokeWidth={3} />
              </span>
              <span className="text-sm font-medium text-neutral-500">环境检测</span>
            </div>

            <h2 className="text-2xl font-semibold tracking-tight text-neutral-900 md:text-3xl">
              先检查一下环境
            </h2>
            <p className="mt-2 text-sm text-neutral-500">
              Proma 在 Windows 上需要 Git Bash 或 WSL 才能执行命令
            </p>

            <div className="mt-6 rounded-sm border border-neutral-200 bg-white p-5 shadow-[4px_4px_0_rgba(30,58,95,0.08)]">
              <EnvironmentCheckPanel autoDetectOnMount />
            </div>

            <div className="mt-6 flex items-center justify-between">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setStep('welcome')}
                className="text-neutral-500"
              >
                <ChevronLeft className="mr-1 h-4 w-4" />
                上一步
              </Button>
              <div className="flex gap-3">
                <Button
                  onClick={() => handleFinish()}
                  variant={shellOk ? 'default' : 'outline'}
                >
                  {shellOk ? '开始使用' : '稍后处理（进入主界面）'}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
