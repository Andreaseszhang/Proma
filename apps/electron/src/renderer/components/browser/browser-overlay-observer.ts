const OVERLAY_SELECTOR_PARTS = [
  '[data-sonner-toast]',
  '[data-sonner-toaster]',
  '[data-app-modal-overlay]',
  '[data-app-local-overlay]',
  '[data-radix-popper-content-wrapper]',
] as const

/** Radix/Sonner 节点的生命周期选择器，供 BrowserSlot 复用。 */
export const APP_OVERLAY_LIFECYCLE_SELECTOR = OVERLAY_SELECTOR_PARTS.join(', ')

export type OverlayMutationTarget = 'body' | 'portal-path' | 'overlay-root' | 'inside-overlay' | 'other'
export type OverlayMutationNode = 'overlay-root' | 'other'

/**
 * DOM 无关的 mutation 分类输入。它让过滤规则可以在 Bun 默认运行时测试，
 * 不需要引入 jsdom，也避免测试依赖 Electron 的 renderer 环境。
 */
export interface OverlayMutationDescriptor {
  type: 'attributes' | 'childList'
  target: OverlayMutationTarget
  addedNodes?: readonly OverlayMutationNode[]
  removedNodes?: readonly OverlayMutationNode[]
  attributeName?: string | null
}

const LIFECYCLE_ATTRIBUTES = new Set(['data-mounted', 'data-state', 'data-visible', 'role'])

/** 仅把浮层生命周期相关的 mutation 交给布局回调。 */
export function classifyOverlayMutation(mutation: OverlayMutationDescriptor): boolean {
  if (mutation.type === 'attributes') {
    return (mutation.target === 'overlay-root' || mutation.target === 'inside-overlay')
      && (mutation.attributeName == null || LIFECYCLE_ATTRIBUTES.has(mutation.attributeName))
  }

  const addedOrRemovedOverlay = [...(mutation.addedNodes ?? []), ...(mutation.removedNodes ?? [])]
    .some((node) => node === 'overlay-root')

  if (addedOrRemovedOverlay) return true
  return mutation.target === 'overlay-root'
}

type MutationObserverFactory = new (callback: MutationCallback) => MutationObserver

export interface AppOverlayObserverOptions {
  body?: HTMLElement
  portalRoots?: readonly Element[]
  mutationObserver?: MutationObserverFactory
}

/**
 * 监听应用浮层生命周期。
 *
 * body 只监听直接 childList。新出现的 body 子节点被当作一个局部 Portal 路径，
 * 只有该路径中的浮层根节点、浮层状态属性或已知浮层内部挂载才会触发回调。
 * 因此普通 Agent 消息更新不会触发 body subtree selector 扫描。
 */
export function observeAppOverlayLifecycle(
  onChange: () => void,
  options: AppOverlayObserverOptions = {},
): () => void {
  const body = options.body ?? document.body
  const Observer = options.mutationObserver ?? MutationObserver
  const portalRoots = new Set<Element>(options.portalRoots ?? [])
  const overlayRoots = new Set<Element>()
  const pathObservers = new Map<Element, MutationObserver>()
  let disconnected = false

  const isOverlayRoot = (node: Node): node is Element =>
    node instanceof Element && node.matches(APP_OVERLAY_LIFECYCLE_SELECTOR)

  const isDescendantOfKnownOverlay = (node: Node): boolean => {
    let current: Node | null = node
    while (current instanceof Element) {
      if (overlayRoots.has(current)) return true
      current = current.parentNode
    }
    return false
  }

  const rememberOverlayRoot = (node: Node): boolean => {
    if (!isOverlayRoot(node)) return false
    overlayRoots.add(node)
    return true
  }

  // A Portal can enter body with its complete subtree already attached. This is
  // the only place we scan descendants; ordinary streamed message updates are
  // never direct body children and therefore never take this path.
  const rememberOverlayRootsInPortal = (node: Element): boolean => {
    let found = rememberOverlayRoot(node)
    for (const overlay of node.querySelectorAll(APP_OVERLAY_LIFECYCLE_SELECTOR)) {
      overlayRoots.add(overlay)
      found = true
    }
    return found
  }

  // body 只观察直接 childList；移除一个 Portal 容器时，已登记的浮层根和局部
  // observer 可能都是它的后代。按 contains 清理整个 detached 子树，避免保留 DOM 引用。
  const forgetDetachedSubtree = (node: Element): boolean => {
    let found = false
    for (const [root, observer] of pathObservers) {
      if (root !== node && !node.contains(root)) continue
      observer.disconnect()
      pathObservers.delete(root)
      portalRoots.delete(root)
      found = true
    }
    for (const root of overlayRoots) {
      if (root !== node && !node.contains(root)) continue
      overlayRoots.delete(root)
      found = true
    }
    return found
  }

  const handlePathMutations = (mutations: MutationRecord[]) => {
    let changed = false
    for (const mutation of mutations) {
      if (mutation.type === 'attributes') {
        const target = mutation.target
        if (target instanceof Element
          && (isDescendantOfKnownOverlay(target) || target.matches(APP_OVERLAY_LIFECYCLE_SELECTOR))) {
          changed = true
        }
        continue
      }

      // 不查询 addedNode 的后代；Portal/Dialog 的两阶段挂载会在下一条 mutation
      // 中把实际浮层根作为当前 addedNode 交给这里，普通消息节点则只做一次 matches。
      for (const node of mutation.addedNodes) {
        if (rememberOverlayRoot(node)) changed = true
      }
      for (const node of mutation.removedNodes) {
        if (node instanceof Element && forgetDetachedSubtree(node)) changed = true
      }
    }
    if (changed) onChange()
  }

  const observePortalPath = (root: Element) => {
    if (pathObservers.has(root)) return
    portalRoots.add(root)
    const observer = new Observer(handlePathMutations)
    pathObservers.set(root, observer)
    observer.observe(root, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: [...LIFECYCLE_ATTRIBUTES],
    })
  }

  const initialPortalRoots = new Set<Element>(options.portalRoots ?? [])
  for (const bodyChild of Array.from(body.children)) {
    if (isOverlayRoot(bodyChild)) initialPortalRoots.add(bodyChild)
    for (const overlay of bodyChild.querySelectorAll(APP_OVERLAY_LIFECYCLE_SELECTOR)) {
      initialPortalRoots.add(overlay)
    }
  }

  for (const root of initialPortalRoots) {
    rememberOverlayRootsInPortal(root)
    observePortalPath(root)
  }

  const bodyObserver = new Observer((mutations) => {
    let changed = false
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (!(node instanceof Element)) continue
        observePortalPath(node)
        if (rememberOverlayRootsInPortal(node)) changed = true
      }
      for (const node of mutation.removedNodes) {
        if (node instanceof Element) {
          if (forgetDetachedSubtree(node)) changed = true
        }
      }
    }
    if (changed) onChange()
  })
  bodyObserver.observe(body, { childList: true })

  return () => {
    if (disconnected) return
    disconnected = true
    bodyObserver.disconnect()
    for (const observer of pathObservers.values()) observer.disconnect()
    pathObservers.clear()
    portalRoots.clear()
    overlayRoots.clear()
  }
}
