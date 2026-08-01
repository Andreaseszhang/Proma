/**
 * Onboarding 视图组件
 *
 * 首次启动时显示的全屏欢迎界面。
 *
 * 视觉：参考经典欢迎页的分屏结构 ——
 *  左侧：Cape Ann Granite 画作（深绿海岸、干净色调）
 *  右侧：暖白面板承载全部引导功能
 *
 * 流程：
 *  Step 1：欢迎（点击「开始引导」→ 白色闪屏淡出）
 *  Step 2：轻量引导
 *  Step 3：Windows 环境检测（仅 Windows，其他平台自动跳过）
 */

import { useMemo, useState } from 'react'
import { useAtomValue } from 'jotai'
import { ChevronRight, ChevronLeft, Check, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { EnvironmentCheckPanel } from '@/components/environment/EnvironmentCheckPanel'
import { isShellEnvironmentOkAtom } from '@/atoms/environment'
import { detectIsWindows } from '@/lib/platform'
import roomsByTheSea from '@/assets/onboarding/rooms-by-the-sea.png'
import guideVisual from '@/assets/onboarding/guide-visual.png'
import promaMarkWhite from '@/assets/onboarding/proma-mark-white.svg'

type OnboardingStep = 'welcome' | 'guide' | 'environment'

interface OnboardingViewProps {
  onComplete: (openTutorial?: boolean) => void
}

export function OnboardingView({ onComplete }: OnboardingViewProps) {
  const [step, setStep] = useState<OnboardingStep>('welcome')
  const [flash, setFlash] = useState(false)
  const isWindows = useMemo(() => detectIsWindows(), [])
  const shellOk = useAtomValue(isShellEnvironmentOkAtom)

  const handleFinish = async (openTutorial?: boolean) => {
    await window.electronAPI.updateSettings({ onboardingCompleted: true })
    onComplete(openTutorial)
  }

  /** 白色闪屏过渡：先淡出变全白，再切换步骤淡入 */
  const transitionTo = (next: OnboardingStep) => {
    setFlash(true)
    setTimeout(() => {
      setStep(next)
      setFlash(false)
    }, 300)
  }

  const handleEnterGuide = () => {
    transitionTo('guide')
  }

  const handleNextFromGuide = () => {
    if (isWindows) {
      transitionTo('environment')
    } else {
      handleFinish()
    }
  }

  /** 重置 onboarding：写回 false 并重新加载窗口，便于反复测试引导流程 */
  const handleResetOnboarding = async () => {
    await window.electronAPI.updateSettings({ onboardingCompleted: false })
    window.location.reload()
  }

  const stepIndex = step === 'welcome' ? 1 : step === 'guide' ? 2 : 3
  const totalSteps = isWindows ? 3 : 2

  return (
    <div className="relative flex h-screen w-full flex-col overflow-hidden bg-[#fbf9f7] md:flex-row">
      {/* ===== 左侧：画作（仅欢迎页显示，引导页清屏） ===== */}
      {step === 'welcome' && (
        <div className="relative h-56 shrink-0 overflow-hidden bg-[#d9e0e4] md:h-auto md:w-[calc(58%+100px)]">
          <img
            src={roomsByTheSea}
            alt="海边的房间画作"
            className="absolute inset-0 h-full w-full object-cover object-center"
          />
          {/* 光感渐变遮罩 */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/5 to-black/15 md:bg-gradient-to-tr md:from-black/60 md:via-transparent md:to-black/20" />

          {/* 左上角品牌 */}
          <div className="absolute left-6 top-6 flex items-center gap-3 md:left-10 md:top-8">
            <img
              src={promaMarkWhite}
              alt="Proma"
              className="h-8 w-8 object-contain drop-shadow-[0_1px_2px_rgba(0,0,0,0.35)]"
            />
            <span className="text-lg font-light tracking-wide text-white">Proma</span>
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
            Cape Ann Granite
          </div>
        </div>
      )}

      {/* ===== 内容面板（引导页清屏后占满全宽） ===== */}
      <div className="relative flex flex-1 items-center justify-center overflow-y-auto">
        {/* 右上角步骤指示 */}
        <div className="absolute right-8 top-6 text-xs uppercase tracking-[0.3em] text-neutral-400 md:right-10 md:top-8">
          {String(stepIndex).padStart(2, '0')} / {String(totalSteps).padStart(2, '0')}
        </div>

        {step === 'welcome' && (
          <div className="w-full max-w-xl px-6 py-10 md:px-10">
            {/* 状态徽章 */}
            <div className="mb-6 flex items-center gap-2.5">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#26583d] text-white">
                <Check size={13} strokeWidth={3} />
              </span>
              <span className="text-sm font-medium text-neutral-500">准备就绪</span>
            </div>

            <h1 className="text-3xl font-light tracking-tight text-neutral-900 md:text-4xl">
              欢迎使用 Proma
            </h1>
            <p className="mt-3 text-base leading-relaxed text-neutral-500 md:text-lg">
              下一代桌面 AI 软件，让通用 Agent 触手可及
            </p>

            {/* 主操作 */}
            <div className="mt-8">
              <button
                onClick={handleEnterGuide}
                className="flex h-12 w-full items-center justify-center gap-1.5 rounded-sm bg-[#1b3f2d] text-base font-medium text-white transition-all hover:bg-[#27513a] active:translate-y-0.5 active:shadow-none"
              >
                开始引导
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {step === 'guide' && (
          <div className="flex h-full w-full items-stretch">
            {/* 左侧 2/5：引导视觉图（完整显示，不裁剪） */}
            <div className="relative flex h-full w-2/5 shrink-0 items-center justify-center overflow-hidden p-6">
              <img
                src={guideVisual}
                alt="引导视觉"
                className="max-h-full max-w-full object-contain"
              />
            </div>
            {/* 右侧 3/5：留白 */}
            <div className="flex-1" />
          </div>
        )}

        {step === 'environment' && isWindows && (
          <div className="w-full max-w-xl px-6 py-10 md:px-10">
            {/* 状态徽章 */}
            <div className="mb-6 flex items-center gap-2.5">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#26583d] text-white">
                <Check size={13} strokeWidth={3} />
              </span>
              <span className="text-sm font-medium text-neutral-500">环境检测</span>
            </div>

            <h2 className="text-2xl font-light tracking-tight text-neutral-900 md:text-3xl">
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
                onClick={() => transitionTo('guide')}
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

      {/* ===== 白色闪屏遮罩 ===== */}
      <div
        className={`pointer-events-none absolute inset-0 z-50 bg-white transition-opacity duration-300 ${
          flash ? 'opacity-100' : 'opacity-0'
        }`}
      />

      {/* ===== 左下角：重置 Onboarding（测试用） ===== */}
      <button
        onClick={handleResetOnboarding}
        title="重置 Onboarding（重新进入引导）"
        className="absolute bottom-4 left-4 z-[60] flex h-9 w-9 items-center justify-center rounded-full border border-neutral-300/70 bg-white/70 text-neutral-500 shadow-sm backdrop-blur-sm transition-all hover:border-[#1b3f2d]/40 hover:bg-white hover:text-[#1b3f2d]"
      >
        <RefreshCw size={16} />
      </button>
    </div>
  )
}
