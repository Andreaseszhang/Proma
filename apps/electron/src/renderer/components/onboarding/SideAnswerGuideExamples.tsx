import { useCallback, useEffect, useRef, useState } from 'react'
import sideAnswerFollowUp from '@/assets/onboarding/guide-side-answer-follow-up.png'
import sideAnswerSelectionMenu from '@/assets/onboarding/guide-side-answer-selection-menu.png'

interface ImageBounds {
  x: number
  y: number
  width: number
  height: number
}

interface SideAnswerExampleImageProps {
  imageSrc: string
  alt: string
  anchor: { x: number; y: number }
}

/** 选区问答截图的响应式放大镜，尺寸与首屏主放大镜保持一致。 */
function SideAnswerExampleImage({ imageSrc, alt, anchor }: SideAnswerExampleImageProps) {
  const frameRef = useRef<HTMLDivElement>(null)
  const imageRef = useRef<HTMLImageElement>(null)
  const [imageBounds, setImageBounds] = useState<ImageBounds | null>(null)

  const updateImageBounds = useCallback(() => {
    const frame = frameRef.current
    const image = imageRef.current
    if (!frame || !image) return

    const frameRect = frame.getBoundingClientRect()
    const imageRect = image.getBoundingClientRect()
    if (!imageRect.width || !imageRect.height) return

    const next = {
      x: imageRect.left - frameRect.left,
      y: imageRect.top - frameRect.top,
      width: imageRect.width,
      height: imageRect.height,
    }

    setImageBounds((current) => {
      if (
        current &&
        Math.abs(current.x - next.x) < 0.5 &&
        Math.abs(current.y - next.y) < 0.5 &&
        Math.abs(current.width - next.width) < 0.5 &&
        Math.abs(current.height - next.height) < 0.5
      ) {
        return current
      }

      return next
    })
  }, [])

  useEffect(() => {
    const image = imageRef.current
    if (!image) return

    updateImageBounds()
    const observer = new ResizeObserver(updateImageBounds)
    observer.observe(image)

    return () => observer.disconnect()
  }, [updateImageBounds])

  const zoom = 2.2
  const sourceCropWidth = 0.1765
  const magnifierDiameter = imageBounds ? imageBounds.width * zoom * sourceCropWidth : 0
  const radius = magnifierDiameter / 2
  const focusX = imageBounds ? imageBounds.x + anchor.x * imageBounds.width : 0
  const focusY = imageBounds ? imageBounds.y + anchor.y * imageBounds.height : 0
  const zoomedWidth = imageBounds ? imageBounds.width * zoom : 0
  const zoomedHeight = imageBounds ? imageBounds.height * zoom : 0

  const clampToLens = (position: number, contentSize: number) =>
    Math.min(0, Math.max(magnifierDiameter - contentSize, position))
  const imageLeft = imageBounds ? clampToLens(radius - anchor.x * zoomedWidth, zoomedWidth) : 0
  const imageTop = imageBounds ? clampToLens(radius - anchor.y * zoomedHeight, zoomedHeight) : 0

  return (
    <div ref={frameRef} className="relative min-w-0 max-w-full overflow-hidden">
      <figure className="m-0 overflow-hidden rounded-lg bg-[#f6f8f3] shadow-[0_14px_30px_rgba(27,63,45,0.12)]">
        <img ref={imageRef} src={imageSrc} alt={alt} className="block h-auto w-full" onLoad={updateImageBounds} />
      </figure>

      {imageBounds && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute z-20"
          style={{
            left: focusX - radius,
            top: focusY - radius,
            width: magnifierDiameter,
            height: magnifierDiameter,
            backgroundColor: '#eef4ea',
            clipPath: `circle(${radius}px at ${radius}px ${radius}px)`,
            overflow: 'hidden',
            filter: 'drop-shadow(0 4px 12px rgba(0,0,0,0.25))',
          }}
        >
          <img
            src={imageSrc}
            alt=""
            draggable={false}
            className="max-w-none"
            style={{
              position: 'absolute',
              left: imageLeft,
              top: imageTop,
              width: zoomedWidth,
              height: zoomedHeight,
              objectFit: 'fill',
            }}
          />
          <div
            className="absolute inset-0 rounded-full border-[3px] border-[#1b3f2d]"
            style={{ clipPath: `circle(${radius}px at ${radius}px ${radius}px)` }}
          />
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
      )}
    </div>
  )
}

/** 侧边问答章节的真实工作流示例；由父页面负责放入章节容器和导航。 */
export function SideAnswerGuideExamples() {
  return (
    <>
      <div className="text-xs font-medium uppercase tracking-[0.2em] text-[#1b3f2d]">真实示例</div>

      <div className="mt-14 space-y-16 md:mt-16 md:space-y-20">
        <article className="grid min-w-0 gap-10 border-t border-[#1b3f2d]/15 pt-10 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-center">
          <SideAnswerExampleImage
            imageSrc={sideAnswerSelectionMenu}
            alt="选中文字后，通过浮动菜单打开右侧问答"
            anchor={{ x: 0.554, y: 0.575 }}
          />
          <div className="min-w-0">
            <div className="text-xs font-medium uppercase tracking-[0.18em] text-[#1b3f2d]">示例 01 · 打开</div>
            <h3 className="mt-3 text-2xl font-medium text-neutral-900 md:text-3xl">选中文字后，从菜单打开右侧问答</h3>
            <p className="mt-4 text-base leading-[1.7] text-neutral-600 md:text-lg">
              在主对话中选中想深入理解的内容，浮动菜单会出现“打开右侧问答”。点击后，选区会带到独立的侧边问答中继续讨论。
            </p>
            <div className="mt-5 border-l-2 border-[#1b3f2d]/35 pl-4">
              <div className="text-base font-medium text-[#1b3f2d]">这样告诉 Agent</div>
              <p className="mt-1 text-base leading-7 text-neutral-500">“解释这段关于 LangChain 概念代码的内容，并告诉我为什么它重要。”</p>
            </div>
          </div>
        </article>

        <article className="grid min-w-0 gap-10 border-t border-[#1b3f2d]/15 pt-10 lg:grid-cols-[22rem_minmax(0,1fr)] lg:items-center">
          <div className="min-w-0 lg:order-1">
            <div className="text-xs font-medium uppercase tracking-[0.18em] text-[#1b3f2d]">示例 02 · 追问</div>
            <h3 className="mt-3 text-2xl font-medium text-neutral-900 md:text-3xl">在右侧独立追问，不打断主对话</h3>
            <p className="mt-4 text-base leading-[1.7] text-neutral-600 md:text-lg">
              右侧面板会保留选区上下文。你可以围绕它反复提问、澄清概念，主对话和原来的工作进度都不会被打断。
            </p>
            <div className="mt-5 border-l-2 border-[#1b3f2d]/35 pl-4">
              <div className="text-base font-medium text-[#1b3f2d]">这样告诉 Agent</div>
              <p className="mt-1 text-base leading-7 text-neutral-500">“基于刚才选中的内容，再用一个简单例子说明它。”</p>
            </div>
          </div>
          <div className="min-w-0 lg:order-2">
            <figure className="m-0 overflow-hidden rounded-lg bg-[#f6f8f3] shadow-[0_14px_30px_rgba(27,63,45,0.12)]">
              <img src={sideAnswerFollowUp} alt="右侧问答面板围绕选中内容继续回答" className="block h-auto w-full" />
            </figure>
          </div>
        </article>
      </div>
    </>
  )
}
