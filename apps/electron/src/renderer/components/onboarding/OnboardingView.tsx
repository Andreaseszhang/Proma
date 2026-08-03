/**
 * Onboarding 视图组件
 *
 * 首次启动时显示的全屏引导界面。
 *
 * 流程：
 *  Step 1：欢迎（点击「进入引导界面」→ 白色闪屏淡出）
 *  Step 2：Agent vs Chat 科普（绿色指针指向界面截图中的切换按钮）
 *  Step 3：会话文件/项目文件区别
 *  Step 4：项目概念
 *  Step 5：子会话科普（图：collaboration 子会话）
 *  Step 6：自动任务科普（图：自动任务配置页）
 *  Step 7：记忆功能科普（图：Agent 技能的记忆页面）
 *  Step 8：侧边回答科普（图：历史选区问答）
 *  Step 9：FAQ 汇总页（按主题分组）
 *  Step 10：Windows 环境检测（仅 Windows，其他平台自动跳过）
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { useAtomValue } from 'jotai'
import { ChevronRight, ChevronLeft, ChevronsRight, Check, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { EnvironmentCheckPanel } from '@/components/environment/EnvironmentCheckPanel'
import { isShellEnvironmentOkAtom } from '@/atoms/environment'
import { detectIsWindows } from '@/lib/platform'
import { CURRENT_ONBOARDING_VERSION } from '../../../types'
import roomsByTheSea from '@/assets/onboarding/rooms-by-the-sea.png'
import guideVisual from '@/assets/onboarding/guide-visual.png'
import guideAutomation from '@/assets/onboarding/guide-automation.png'
import guideMemory from '@/assets/onboarding/guide-memory.png'
import guideSideAnswer from '@/assets/onboarding/guide-side-answer.png'
import guideSubagent from '@/assets/onboarding/guide-subagent.png'
import promaMarkWhite from '@/assets/onboarding/proma-mark-white.svg'

type OnboardingStep = 'welcome' | 'guide' | 'files' | 'project' | 'automation' | 'memory' | 'sideanswer' | 'subagent' | 'faq' | 'environment'

interface OnboardingViewProps {
  onComplete: (openTutorial?: boolean) => void
}

/** 图片内归一化锚点（0-1） */
interface GuideAnchor {
  x: number
  y: number
}

/** 镜片内截图偏移，单位为镜片直径；正值分别向右、向下移动截图 */
interface MagnifierImageOffset {
  x?: number
  y?: number
}

interface GuideFeatureStepProps {
  anchor: GuideAnchor
  title: string
  highlight?: React.ReactNode
  paragraphs: React.ReactNode[]
  nextLabel: string
  onNext: () => void
  onBack?: () => void
  /** 左侧展示的界面截图；默认 guideVisual */
  imageSrc?: string
  /** 指针模式：curve 曲线（默认）、straight 直线、none 不显示、magnifier 圆形放大镜 */
  arrowMode?: 'curve' | 'straight' | 'none' | 'magnifier'
  /** 放大镜容器水平偏移（以 320px 镜片为基准，随截图同步缩放） */
  magnifierOffsetX?: number
  /** 仅移动镜片内的截图，不移动放大镜容器 */
  magnifierImageOffset?: MagnifierImageOffset
  /** 左侧截图右缘需要隐藏的 CSS 像素数 */
  imageRightCrop?: number
  /** 仅在 Agent / Chat 介绍页显示，直接前往进阶篇 */
  onSkip?: () => void
}

interface MagnifierProps {
  imageSrc: string
  /** 锚点在图片内的归一化坐标（0-1） */
  anchorX: number
  anchorY: number
  /** 图片在容器内的实际渲染位置 */
  imgRect: { x: number; y: number; w: number; h: number }
  /** 放大镜容器水平偏移（以 320px 镜片为基准，随截图同步缩放） */
  offsetX?: number
  /** 仅移动镜片内的截图，不移动放大镜容器 */
  imageOffset?: MagnifierImageOffset
}

/**
 * 圆形放大镜：覆盖在图片锚点位置，圈内放大显示被讲解的 UI 元素。
 *
 * 原理：在锚点位置放一个圆形裁剪容器（clip-path: circle），
 * 容器内再渲染同一张图片，但以锚点为中心放大 2 倍，
 * 视觉效果就像把对应区域的内容放大到圆圈里。
 */
function Magnifier({ imageSrc, anchorX, anchorY, imgRect, offsetX = 0, imageOffset = {} }: MagnifierProps) {
  const ZOOM = 2.2 // 放大倍数
  const SOURCE_CROP_WIDTH = 0.1765 // 每次展示原截图横向约 17.65% 的区域
  const REFERENCE_DIAMETER = 320
  const DIAMETER = imgRect.w * ZOOM * SOURCE_CROP_WIDTH
  const RADIUS = DIAMETER / 2

  const cx = imgRect.x + anchorX * imgRect.w
  const cy = imgRect.y + anchorY * imgRect.h
  const scaledOffsetX = offsetX * (DIAMETER / REFERENCE_DIAMETER)

  const zoomedWidth = imgRect.w * ZOOM
  const zoomedHeight = imgRect.h * ZOOM

  // 默认将取景限制在放大图内，避免透明区域透出底下的原尺寸截图。
  // 有明确焦点偏移时允许在起始边缘留出镜片底色，以便边缘元素仍可落在镜片中心。
  const clampToLens = (position: number, contentSize: number) =>
    Math.min(0, Math.max(DIAMETER - contentSize, position))
  const applyImageOffset = (position: number, contentSize: number, offset: number) =>
    Math.max(DIAMETER - contentSize, offset > 0 ? position + offset : Math.min(0, position + offset))
  const baseLeft = clampToLens(RADIUS - anchorX * zoomedWidth, zoomedWidth)
  const baseTop = clampToLens(RADIUS - anchorY * zoomedHeight, zoomedHeight)
  const innerLeft = applyImageOffset(baseLeft, zoomedWidth, (imageOffset.x ?? 0) * DIAMETER)
  const innerTop = applyImageOffset(baseTop, zoomedHeight, (imageOffset.y ?? 0) * DIAMETER)

  return (
    <div
      className="pointer-events-none absolute z-20"
      style={{
        left: cx - RADIUS + scaledOffsetX,
        top: cy - RADIUS,
        width: DIAMETER,
        height: DIAMETER,
        backgroundColor: '#eef4ea',
        clipPath: `circle(${RADIUS}px at ${RADIUS}px ${RADIUS}px)`,
        overflow: 'hidden',
        filter: 'drop-shadow(0 4px 12px rgba(0,0,0,0.25))',
      }}
    >
      {/* 圈内放大后的图片：边缘锚点时仍完整覆盖整个圆盘 */}
      <img
        src={imageSrc}
        alt=""
        draggable={false}
        className="max-w-none"
        style={{
          position: 'absolute',
          left: innerLeft,
          top: innerTop,
          width: zoomedWidth,
          height: zoomedHeight,
          objectFit: 'fill',
        }}
      />
      {/* 圆圈边框 */}
      <div
        className="absolute inset-0 rounded-full border-[3px] border-[#1b3f2d]"
        style={{ clipPath: `circle(${RADIUS}px at ${RADIUS}px ${RADIUS}px)` }}
      />
      {/* 放大镜把手装饰（可选） */}
      <div
        className="absolute bottom-[-6px] right-[-6px] h-8 w-8 rounded-full border-[4px] border-[#1b3f2d]"
        style={{
          clipPath: 'none',
          background: 'transparent',
          borderRightColor: 'transparent',
          borderBottomColor: 'transparent',
          transform: 'rotate(-45deg)',
        }}
      />
    </div>
  )
}

/** 章节标记：标题左侧的章节文字，右侧延伸一条细线到定位圆点。 */
function ChapterMarker({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-6 flex w-full max-w-lg items-center gap-4 text-sm font-medium tracking-[0.08em] text-[#1b3f2d]">
      <span className="shrink-0 whitespace-nowrap">{children}</span>
      <span className="relative h-px flex-1 bg-[#1b3f2d]/25">
        <span className="absolute right-0 top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full bg-[#1b3f2d]" />
      </span>
    </div>
  )
}

/**
 * 引导科普页：左侧显示界面截图，从锚点画绿色指针指向右侧讲解区。
 */
function GuideFeatureStep({ anchor, title, highlight, paragraphs, nextLabel, onNext, onBack, onSkip, imageSrc = guideVisual, arrowMode = 'none', magnifierOffsetX = 0, magnifierImageOffset = {}, imageRightCrop = 0 }: GuideFeatureStepProps) {
  const imgRef = useRef<HTMLImageElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [imgRect, setImgRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null)

  useEffect(() => {
    const img = imgRef.current
    if (!img) return

    const update = () => {
      const ctr = containerRef.current
      if (!ctr) return
      const ir = img.getBoundingClientRect()
      const cr = ctr.getBoundingClientRect()
      setImgRect({
        x: ir.left - cr.left,
        y: ir.top - cr.top,
        w: ir.width,
        h: ir.height,
      })
    }
    update()
    const resizeObserver = new ResizeObserver(update)
    resizeObserver.observe(img)
    const t = setTimeout(update, 60)
    window.addEventListener('resize', update)
    return () => {
      resizeObserver.disconnect()
      clearTimeout(t)
      window.removeEventListener('resize', update)
    }
  }, [])

  return (
    <div className="flex h-full w-full items-stretch">
      {/* 左侧：界面截图 + 指针 */}
      <div ref={containerRef} className="relative flex h-full w-[calc(58%+80px)] shrink-0 items-center justify-center overflow-visible p-6">
        <img
          ref={imgRef}
          src={imageSrc}
          alt="Proma 界面"
          className="max-h-full max-w-full rounded-lg border border-[#d7ddd5] bg-[#f6f8f3] object-contain shadow-[0_14px_30px_rgba(27,63,45,0.12)]"
          style={imageRightCrop > 0 ? { clipPath: `inset(0 ${imageRightCrop}px 0 0)` } : undefined}
        />

        {/* 圆形放大镜：覆盖在图片对应区域，圈内放大显示被讲解的 UI */}
        {imgRect && arrowMode === 'magnifier' && (
          <Magnifier
            imageSrc={imageSrc}
            anchorX={anchor.x}
            anchorY={anchor.y}
            imgRect={imgRect}
            offsetX={magnifierOffsetX}
            imageOffset={magnifierImageOffset}
          />
        )}

        {/* 绿色指针：从图片锚点指向右侧讲解区（curve 曲线 / straight 直线 / none 无） */}
        {imgRect && arrowMode !== 'none' && arrowMode !== 'magnifier' && (
          <svg
            className="pointer-events-none absolute inset-y-0 left-0 z-10 h-full w-[calc(100%+70px)]"
            viewBox={`0 0 ${imgRect.x + imgRect.w + 94} ${imgRect.y + imgRect.h + 24}`}
            fill="none"
          >
            {/* 锚点圆点 */}
            <circle
              cx={imgRect.x + anchor.x * imgRect.w}
              cy={imgRect.y + anchor.y * imgRect.h}
              r="14"
              fill="#1b3f2d"
              opacity="0.18"
            />
            <circle
              cx={imgRect.x + anchor.x * imgRect.w}
              cy={imgRect.y + anchor.y * imgRect.h}
              r="6"
              fill="#1b3f2d"
            />
            {arrowMode === 'curve' ? (
              <>
                {/* 曲线：锚点 → 图片右缘向右延长 */}
                <path
                  d={`M ${imgRect.x + anchor.x * imgRect.w + 14} ${imgRect.y + anchor.y * imgRect.h} C ${imgRect.x + imgRect.w * 0.45} ${imgRect.y + anchor.y * imgRect.h}, ${imgRect.x + imgRect.w * 0.55} ${imgRect.y + imgRect.h * 0.18}, ${imgRect.x + imgRect.w + 30} ${imgRect.y + imgRect.h * 0.16}`}
                  stroke="#1b3f2d"
                  strokeWidth="4"
                  strokeLinecap="round"
                />
                {/* 箭头头部（向右延长后保持在容器内） */}
                <polygon
                  points={`${imgRect.x + imgRect.w + 30},${imgRect.y + imgRect.h * 0.16 - 9} ${imgRect.x + imgRect.w + 42},${imgRect.y + imgRect.h * 0.16} ${imgRect.x + imgRect.w + 30},${imgRect.y + imgRect.h * 0.16 + 9}`}
                  fill="#1b3f2d"
                />
              </>
            ) : (
              <>
                {/* 直线：从锚点水平向右延长 */}
                <line
                  x1={imgRect.x + anchor.x * imgRect.w + 14}
                  y1={imgRect.y + anchor.y * imgRect.h}
                  x2={imgRect.x + imgRect.w + 30}
                  y2={imgRect.y + anchor.y * imgRect.h}
                  stroke="#1b3f2d"
                  strokeWidth="4"
                  strokeLinecap="round"
                />
                {/* 直线箭头头部 */}
                <polygon
                  points={`${imgRect.x + imgRect.w + 30},${imgRect.y + anchor.y * imgRect.h - 9} ${imgRect.x + imgRect.w + 42},${imgRect.y + anchor.y * imgRect.h} ${imgRect.x + imgRect.w + 30},${imgRect.y + anchor.y * imgRect.h + 9}`}
                  fill="#1b3f2d"
                />
              </>
            )}
          </svg>
        )}
      </div>

      {/* 右侧：科普讲解，保持章节标记、标题、正文和操作区的阅读节奏。 */}
      <div
        className="relative flex flex-1 flex-col items-center justify-start px-8 pt-20 md:px-12 md:pt-24"
        style={{ transform: 'translateY(clamp(0px, calc(133.333vh - 1000px), 200px))' }}
      >
        {highlight && <ChapterMarker>{highlight}</ChapterMarker>}
        <h2 className="w-full max-w-lg text-left text-3xl font-light tracking-tight text-neutral-900 md:text-4xl">{title}</h2>
        <div className="mt-9 w-full max-w-lg space-y-5">
          {paragraphs.map((p, i) => (
            <p key={i} className="text-base leading-[1.65] text-neutral-600 md:text-lg">
              {p}
            </p>
          ))}
        </div>

        <div className="mt-12 flex w-full max-w-lg items-center justify-between border-t border-[#1b3f2d]/20 pt-6">
          {onBack ? (
            <Button variant="ghost" size="sm" onClick={onBack} className="text-neutral-500">
              <ChevronLeft className="mr-1 h-4 w-4" />
              上一个
            </Button>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-3">
            {onSkip && (
              <button
                onClick={onSkip}
                className="flex h-8 items-center gap-1 px-2 text-sm text-neutral-500 transition-colors hover:text-[#1b3f2d]"
              >
                跳过入门篇
                <ChevronsRight className="h-4 w-4" />
              </button>
            )}
            <button
              onClick={onNext}
              className="flex h-14 items-center justify-center gap-1.5 rounded-md bg-[#1b3f2d] px-9 text-base font-medium text-white shadow-[0_8px_18px_rgba(27,63,45,0.14)] transition-all hover:bg-[#27513a] active:translate-y-0.5 active:shadow-none"
            >
              {nextLabel}
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

/** FAQ 主题分组 */
const FAQ_GROUPS: Array<{ topic: string; items: Array<{ q: string; a: string }> }> = [
  {
    topic: 'Agent / Chat',
    items: [
      {
        q: 'Chat 也能完成 Agent 做的事吗？',
        a: '不能。Chat 适合快速问答，但遇到需要多步规划、调用工具、读写文件的任务，只有 Agent 可以完成。',
      },
      {
        q: '什么时候用 Chat、什么时候用 Agent？',
        a: '简单问答随手用 Chat；要执行任务、调研、改代码、自动化时用 Agent。拿不准时直接用 Agent，它会判断是否需要多步执行。',
      },
      {
        q: '切换模式会丢失当前对话吗？',
        a: '不会。Agent 和 Chat 的对话是独立的会话，切换模式不会清除任何内容，你可以随时回来继续。',
      },
    ],
  },
  {
    topic: '项目',
    items: [
      {
        q: '项目和文件夹有什么区别？',
        a: '项目是 Proma 的工作区概念，自带独立的文件、上下文和记忆；文件夹只是存放文件的目录，两者定位不同。',
      },
      {
        q: '项目之间会互相影响吗？',
        a: '不会。每个项目的文件、Agent 记忆、上下文互相隔离，切换项目不会串内容。',
      },
      {
        q: '可以建多个项目吗？',
        a: '可以。按工作目标建项目即可，比如每个客户、每个研究方向一个项目，便于长期维护。',
      },
    ],
  },
  {
    topic: '文件',
    items: [
      {
        q: '项目文件是本项目所有会话共享的吗？',
        a: '是的。项目文件属于整个项目，项目内所有会话都可以访问，适合放共享资料、长期文档和项目级 Context。',
      },
      {
        q: '这两个地方分别应该放什么样的文件？',
        a: '一次性的材料（如临时截图、附件）放会话文件；需要跨会话共享的长期资料（项目文档、共享素材）放项目文件。',
      },
    ],
  },
  {
    topic: '自动任务',
    items: [
      {
        q: '自动任务需要一直开着 Proma 吗？',
        a: '需要 Proma 在运行才会执行。你可以设置触发时间，到时应用会自动运行任务并通知结果。',
      },
      {
        q: '任务执行会占用多少资源？',
        a: '每个任务按你选的模型独立运行，支持完全权限无人值守，也可以配置运行次数上限和频率控制。',
      },
      {
        q: '任务结果在哪里看？',
        a: '在自动任务的运行历史里可以看到每次执行的状态、耗时和结果，失败也会记录原因。',
      },
    ],
  },
  {
    topic: '记忆',
    items: [
      {
        q: '记忆会保存什么？',
        a: '它沉淀项目规则、稳定偏好和已经确认的结论，让后续 Agent 在同一项目中不必每次从零理解你的工作方式。',
      },
      {
        q: '怎么把一条结论变成记忆？',
        a: '直接告诉 Agent「记住这个规则」或「把这次结论沉淀为项目记忆」。它会判断应该写入项目指令、长期记忆还是当前会话 Context。',
      },
    ],
  },
  {
    topic: 'Pi',
    items: [
      {
        q: 'Pi 是什么？',
        a: 'Pi 是 Proma 支持的一种 Agent runtime。它可以结合你选定的模型、工具和工作区来完成多步任务，适合需要规划、读写文件或调用工具的工作。',
      },
    ],
  },
  {
    topic: '侧边回答',
    items: [
      {
        q: '侧边回答和普通对话有什么区别？',
        a: '普通对话是独立问答；侧边回答是围绕你选中的文字展开，右侧面板专门讲解，不打断当前主对话。',
      },
      {
        q: '侧边回答会新建会话吗？',
        a: '不会新建独立会话，它是当前会话的辅助面板，问答记录仍归属当前上下文。',
      },
      {
        q: '哪些内容可以用侧边回答？',
        a: '对话消息、搜索选区等可选中文本都可以，选中后打开侧边回答即可。',
      },
    ],
  },
  {
    topic: '子会话',
    items: [
      {
        q: '子会话怎么启动？',
        a: '直接用自然语言说就行，比如「启动 3 个子会话分别研究 A、B、C」，Agent 会自动创建协作子会话。',
      },
      {
        q: '子会话可以指定模型吗？',
        a: '可以。每个子会话都能指定不同的模型（如 MiniMax、DeepSeek），按任务特点选合适的内核。',
      },
      {
        q: '子会话结果会占用父会话上下文吗？',
        a: '基本不占。子会话拥有独立上下文，各自研究后再把结论汇总回父会话，节省父会话空间。',
      },
    ],
  },
]

/**
 * FAQ 页面：一次展开全部问题，按主题连续阅读。
 */
function FaqPage({ nextLabel, onNext, onBack, highlight }: { nextLabel: string; onNext: () => void; onBack?: () => void; highlight?: React.ReactNode }) {
  return (
    <div className="flex h-full w-full items-start justify-center overflow-y-auto px-6 py-12 pb-32 md:px-12">
      <div className="w-full max-w-4xl">
        {highlight && <ChapterMarker>{highlight}</ChapterMarker>}
        <h2 className="text-3xl font-light tracking-tight text-neutral-900 md:text-4xl">常见问题</h2>
        <p className="mt-3 text-base leading-relaxed text-neutral-500">
          常见问题已经全部展开，方便你快速浏览和搜索。
        </p>

        <div className="mt-10 space-y-10">
          {FAQ_GROUPS.map((group, groupIndex) => (
            <section key={group.topic} aria-labelledby={`faq-${group.topic}`}>
              <div className="flex items-end gap-3 border-b border-neutral-300 pb-3">
                <span className="text-xs font-medium tracking-[0.16em] text-[#1b3f2d]">
                  {String(groupIndex + 1).padStart(2, '0')}
                </span>
                <h3 id={`faq-${group.topic}`} className="text-lg font-medium text-neutral-900">
                  {group.topic}
                </h3>
              </div>

              <div className="divide-y divide-neutral-200/80">
                {group.items.map((item) => (
                  <article key={item.q} className="border-l-2 border-[#1b3f2d]/25 py-4 pl-4">
                    <h4 className="text-sm font-semibold tracking-wide text-[#1b3f2d]">{item.q}</h4>
                    <p className="mt-2 max-w-3xl text-[15px] leading-7 text-neutral-600">{item.a}</p>
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>

        <div className="mt-12 flex w-full items-center justify-between border-t border-[#1b3f2d]/20 pt-6">
          {onBack ? (
            <Button variant="ghost" size="sm" onClick={onBack} className="text-neutral-500">
              <ChevronLeft className="mr-1 h-4 w-4" />
              上一个
            </Button>
          ) : (
            <span />
          )}
          <button
            onClick={onNext}
            className="flex h-14 items-center justify-center gap-1.5 rounded-md bg-[#1b3f2d] px-9 text-base font-medium text-white shadow-[0_8px_18px_rgba(27,63,45,0.14)] transition-all hover:bg-[#27513a] active:translate-y-0.5 active:shadow-none"
          >
            {nextLabel}
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  )
}

/** 引导步骤标题（欢迎页独立，不在地图中显示） */
const STEP_LABELS: Array<{ step: Exclude<OnboardingStep, 'welcome' | 'environment'>; label: string }> = [
  { step: 'guide', label: 'Agent / Chat' },
  { step: 'project', label: '项目' },
  { step: 'files', label: '文件' },
  { step: 'subagent', label: '子会话' },
  { step: 'automation', label: '自动任务' },
  { step: 'memory', label: '记忆' },
  { step: 'sideanswer', label: '侧边回答' },
  { step: 'faq', label: 'FAQ' },
]

const BEGINNER_STEP_LABELS = STEP_LABELS.slice(0, 3)
const ADVANCED_STEP_LABELS = STEP_LABELS.slice(3)

/**
 * 底部进度地图：仅显示当前章节的步骤，并保持章节内的宽松间距。
 */
function ProgressMap({ current }: { current: Exclude<OnboardingStep, 'welcome' | 'environment'> }) {
  const isBeginner = BEGINNER_STEP_LABELS.some((step) => step.step === current)
  const visibleSteps = isBeginner ? BEGINNER_STEP_LABELS : ADVANCED_STEP_LABELS
  const activeIdx = visibleSteps.findIndex((step) => step.step === current)

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex items-start justify-center bg-[#fbf9f7]/90 px-8 pb-5 pt-2 md:px-12">
      <div className={`w-full ${isBeginner ? 'max-w-3xl' : 'max-w-5xl'}`}>
        <div className="flex items-start">
          {visibleSteps.map((item, index) => {
            const done = index < activeIdx
            const isCurrent = index === activeIdx
            return (
              <div key={item.step} className="flex flex-1 flex-col items-center">
                <span
                  className={`text-[11px] leading-tight tracking-[0.04em] md:text-sm ${
                    isCurrent
                      ? 'font-medium text-[#1b3f2d]'
                      : done
                        ? 'text-neutral-500'
                        : 'text-neutral-400'
                  }`}
                >
                  {item.label}
                </span>
                <div className="mt-1.5 flex h-3 w-full items-center">
                  <div
                    className={`h-px flex-1 ${
                      index === 0
                        ? 'bg-transparent'
                        : done || isCurrent
                          ? 'bg-[#1b3f2d]/50'
                          : 'bg-neutral-200'
                    }`}
                  />
                  <div
                    className={`mx-1.5 h-2.5 w-2.5 shrink-0 rounded-full transition-colors duration-300 ${
                      isCurrent
                        ? 'bg-[#1b3f2d] ring-4 ring-[#1b3f2d]/15'
                        : done
                          ? 'bg-[#1b3f2d]/70'
                          : 'bg-neutral-300'
                    }`}
                  />
                  <div
                    className={`h-px flex-1 ${
                      index === visibleSteps.length - 1
                        ? 'bg-transparent'
                        : index < activeIdx
                          ? 'bg-[#1b3f2d]/50'
                          : 'bg-neutral-200'
                    }`}
                  />
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export function OnboardingView({ onComplete }: OnboardingViewProps) {
  const [step, setStep] = useState<OnboardingStep>('welcome')
  const [flash, setFlash] = useState(false)
  const [fading, setFading] = useState(false)
  const isWindows = useMemo(() => detectIsWindows(), [])
  const shellOk = useAtomValue(isShellEnvironmentOkAtom)

  const handleFinish = async (openTutorial?: boolean) => {
    await window.electronAPI.updateSettings({
      onboardingCompleted: true,
      onboardingVersion: CURRENT_ONBOARDING_VERSION,
    })
    onComplete(openTutorial)
  }

  /**
   * 页面切换：
   * - welcome 进出（画作显隐）用白色闪屏遮挡
   * - guide 之后的科普页之间用淡入淡出
   */
  const transitionTo = (next: OnboardingStep) => {
    const useFlash = step === 'welcome' || next === 'welcome'
    setFading(true)
    if (useFlash) setFlash(true)
    setTimeout(() => {
      setStep(next)
      requestAnimationFrame(() => {
        setFading(false)
        setFlash(false)
      })
    }, 250)
  }

  const handleEnterGuide = () => transitionTo('guide')
  const handleNextFromGuide = () => transitionTo('project')
  const handleNextFromProject = () => transitionTo('files')
  const handleNextFromFiles = () => transitionTo('subagent')
  const handleSkipBeginner = () => transitionTo('subagent')
  const handleNextFromAutomation = () => transitionTo('memory')
  const handleNextFromMemory = () => transitionTo('sideanswer')
  const handleNextFromSideAnswer = () => transitionTo('faq')
  const handleNextFromSubagent = () => transitionTo('automation')
  const handleNextFromFaq = () => {
    if (isWindows) {
      transitionTo('environment')
    } else {
      handleFinish()
    }
  }

  /** 重置 onboarding：写回 false 并重新加载窗口，便于反复测试引导流程 */
  const handleResetOnboarding = async () => {
    await window.electronAPI.updateSettings({
      onboardingCompleted: false,
      onboardingVersion: undefined,
    })
    window.location.reload()
  }

  const currentMapIndex = STEP_LABELS.findIndex((item) => item.step === step)
  const stepIndex = step === 'environment' ? STEP_LABELS.length + 1 : currentMapIndex + 1
  const totalSteps = STEP_LABELS.length + (isWindows ? 1 : 0)

  return (
    <div className="relative flex h-screen w-full flex-col overflow-hidden bg-[#fbf9f7] md:flex-row">
      {step !== 'welcome' && (
        <div aria-hidden="true" className="pointer-events-none absolute left-5 top-5 z-30 flex items-center gap-2">
          <span className="h-4 w-4 rounded-full bg-[#f26c63]" />
          <span className="h-4 w-4 rounded-full bg-[#f6bc42]" />
          <span className="h-4 w-4 rounded-full bg-[#65be6a]" />
        </div>
      )}

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

      {/* ===== 内容面板（引导页清屏后占满全宽，切换时淡入淡出） ===== */}
      <div
        className={`relative flex flex-1 items-center justify-center overflow-y-auto transition-opacity duration-300 ${
          fading ? 'opacity-0' : 'opacity-100'
        }`}
      >
        {/* 右上角步骤指示 */}
        {step !== 'welcome' && (
          <div className="absolute right-8 top-6 text-xs uppercase tracking-[0.3em] text-neutral-400 md:right-10 md:top-8">
            {String(stepIndex).padStart(2, '0')} / {String(totalSteps).padStart(2, '0')}
          </div>
        )}

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
                进入引导界面
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {step === 'guide' && (
          <GuideFeatureStep
            anchor={{ x: 0.073, y: 0.049 }}
            arrowMode="magnifier"
            magnifierOffsetX={70}
            magnifierImageOffset={{ x: 0.09, y: 0.33 }}
            highlight="入门指南 · 第 1 步"
            title="Agent 和 Chat 模式的区别"
            paragraphs={[
              <>左边栏顶部是 Proma 的<b className="font-medium text-neutral-900">模式切换</b>：Agent 与 Chat。</>,
              <>
                <b className="font-medium text-neutral-900">Chat</b> 是一问一答的对话——快速提问、简单交流，
                不涉及任何对电脑的操作，核心偏向满足好奇心和完成简单的文字工作。
              </>,
              <>
                <b className="font-medium text-neutral-900">Agent</b> 则能自主规划、调用工具、操作电脑、写代码和文档，
                为你的想法赋形。
              </>,
            ]}
            nextLabel="下一个"
            onNext={handleNextFromGuide}
            onBack={() => transitionTo('welcome')}
            onSkip={handleSkipBeginner}
          />
        )}

        {step === 'files' && (
          <GuideFeatureStep
            anchor={{ x: 0.91, y: 0.07 }}
            arrowMode="magnifier"
            highlight="入门指南 · 第 3 步"
            title="会话文件和项目文件"
            paragraphs={[
              <>右侧预览面板顶部有<b className="font-medium text-neutral-900">会话文件</b>和<b className="font-medium text-neutral-900">项目文件</b>两个页签。</>,
              <>
                <b className="font-medium text-neutral-900">会话文件</b>属于这一次对话——附件、截图、临时引用，
                聊完就归位，适合一次性材料。
              </>,
              <>
                <b className="font-medium text-neutral-900">项目文件</b>属于整个项目——所有项目内的会话共享这些文件，
                是团队/长期项目真正的工作台。
              </>,
            ]}
            nextLabel="开始进阶篇"
            onNext={handleNextFromFiles}
            onBack={() => transitionTo('project')}
          />
        )}

        {step === 'project' && (
          <GuideFeatureStep
            anchor={{ x: 0.012, y: 0.22 }}
            arrowMode="magnifier"
            magnifierOffsetX={70}
            magnifierImageOffset={{ x: 0.22 }}
            highlight="入门指南 · 第 2 步"
            title="项目的概念"
            paragraphs={[
              <>左侧边栏的<b className="font-medium text-neutral-900">项目</b>是你为特定工作建立的独立空间。</>,
              <>
                每个项目有自己的<b className="font-medium text-neutral-900">项目文件</b>、<b className="font-medium text-neutral-900">上下文与记忆</b>，
                互不干扰。
              </>,
              <>
                比如「广告投放项目」「代码分析」，都各是一个独立的项目工作区。
              </>,
            ]}
            nextLabel="下一个"
            onNext={handleNextFromProject}
            onBack={() => transitionTo('guide')}
          />
        )}

        {step === 'subagent' && (
          <GuideFeatureStep
            anchor={{ x: 0.075, y: 0.38 }}
            arrowMode="magnifier"
            magnifierOffsetX={80}
            magnifierImageOffset={{ x: 0.075 }}
            imageSrc={guideSubagent}
            highlight="进阶指南 · 第 1 步"
            title="子会话功能"
            paragraphs={[
              <>
                子会话（Collaboration）是 Agent 派生的<b className="font-medium text-neutral-900">独立研究小分队</b>——
                你用一句自然语言就能启动，比如「启动 3 个子会话研究躺平现象」。
              </>,
              <>
                每个子会话可以<b className="font-medium text-neutral-900">指定不同模型</b>（如 MiniMax、DeepSeek），
                拥有<b className="font-medium text-neutral-900">独立的上下文</b>，各自专注一个方向并行研究。
              </>,
              <>
                结果再汇回父会话——
                <b className="font-medium text-neutral-900">既节省父会话的上下文，又能并行干更多的活</b>。
              </>,
            ]}
            nextLabel="下一个"
            onNext={handleNextFromSubagent}
            onBack={() => transitionTo('files')}
          />
        )}

        {step === 'automation' && (
          <GuideFeatureStep
            anchor={{ x: 0.21, y: 0.019 }}
            arrowMode="none"
            imageSrc={guideAutomation}
            imageRightCrop={2}
            highlight="进阶指南 · 第 2 步"
            title="自动任务功能"
            paragraphs={[
              <>
                打开<b className="font-medium text-neutral-900">自动任务</b>，你可以让 Proma 定时自动执行一件事。
              </>,
              <>
                在任务描述里写清楚「做什么、什么时候做」，再配置频率与模型，
                <b className="font-medium text-neutral-900">无人值守也能按时完成</b>。
              </>,
              <>
                也不必手动填写配置：直接告诉 Agent「每天早上检查这个仓库的 PR」或「每周汇总销售数据」，
                它会把你的目标转成对应的自动任务。
              </>,
            ]}
            nextLabel="下一个"
            onNext={handleNextFromAutomation}
            onBack={() => transitionTo('subagent')}
          />
        )}

        {step === 'memory' && (
          <GuideFeatureStep
            anchor={{ x: 0.49, y: 0.18 }}
            arrowMode="none"
            imageSrc={guideMemory}
            highlight="进阶指南 · 第 3 步"
            title="让 Agent 记住你的项目"
            paragraphs={[
              <>
                <b className="font-medium text-neutral-900">记忆</b>会沉淀项目指令、稳定偏好和已经确认的结论，
                让后续 Agent 不必每次从零理解你的工作方式。
              </>,
              <>
                你不必自己判断信息该存在哪里。直接说「记住这个项目规则」或「把这次结论沉淀为项目记忆」，
                Agent 会帮你选择合适的位置并完成更新。
              </>,
              <>
                项目越长期、协作越复杂，清晰的记忆就越能让每次对话接得更自然。
              </>,
            ]}
            nextLabel="下一个"
            onNext={handleNextFromMemory}
            onBack={() => transitionTo('automation')}
          />
        )}

        {step === 'sideanswer' && (
          <GuideFeatureStep
            anchor={{ x: 0.66, y: 0.044 }}
            arrowMode="none"
            imageSrc={guideSideAnswer}
            highlight="进阶指南 · 第 4 步"
            title="侧边回答"
            paragraphs={[
              <>在 Agent 对话中，可以选中一段文字（如对话内容、搜索选区），然后打开侧边回答。</>,
              <>侧边回答会打开<b className="font-medium text-neutral-900">右侧问答面板</b>，
                围绕你选中的内容深入讲解，不打断主对话。
              </>,
              <>适合查词、解释概念、拆解长文——主对话保持干净，答案在侧边展开。
              </>,
            ]}
            nextLabel="下一个"
            onNext={handleNextFromSideAnswer}
            onBack={() => transitionTo('memory')}
          />
        )}

        {step === 'faq' && (
          <FaqPage
            highlight="进阶指南 · 第 5 步"
            nextLabel={isWindows ? '下一个' : '开始使用'}
            onNext={handleNextFromFaq}
            onBack={() => transitionTo('sideanswer')}
          />
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
                onClick={() => transitionTo('faq')}
                className="text-neutral-500"
              >
                <ChevronLeft className="mr-1 h-4 w-4" />
                上一个
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

      {/* ===== 底部进度地图（欢迎页不显示） ===== */}
      {step !== 'welcome' && step !== 'environment' && <ProgressMap current={step} />}

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
