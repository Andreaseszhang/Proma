import { describe, expect, test } from 'bun:test'
import {
  APP_OVERLAY_LIFECYCLE_SELECTOR,
  classifyOverlayMutation,
  observeAppOverlayLifecycle,
  type OverlayMutationDescriptor,
} from './browser-overlay-observer'

function classify(mutation: OverlayMutationDescriptor): boolean {
  return classifyOverlayMutation(mutation)
}

class TestElement {
  parentNode: TestElement | null = null
  private readonly childNodes: TestElement[] = []

  get children(): TestElement[] {
    return this.childNodes
  }

  constructor(private readonly selectors: readonly string[] = []) {}

  append(child: TestElement): void {
    child.parentNode = this
    this.childNodes.push(child)
  }

  remove(child: TestElement): void {
    const index = this.childNodes.indexOf(child)
    if (index >= 0) this.childNodes.splice(index, 1)
    child.parentNode = null
  }

  contains(node: TestElement): boolean {
    if (node === this) return true
    return this.childNodes.some((child) => child.contains(node))
  }

  matches(selector: string): boolean {
    return selector.split(', ').some((part) => this.selectors.includes(part))
  }

  querySelectorAll(selector: string): TestElement[] {
    return this.childNodes.flatMap((child) => [
      ...(child.matches(selector) ? [child] : []),
      ...child.querySelectorAll(selector),
    ])
  }
}

class TestMutationObserver {
  static readonly instances = new Set<TestMutationObserver>()
  private target: TestElement | null = null
  private options: MutationObserverInit = {}
  disconnected = false

  constructor(private readonly callback: MutationCallback) {
    TestMutationObserver.instances.add(this)
  }

  observe(target: Node, options: MutationObserverInit = {}): void {
    this.target = target as unknown as TestElement
    this.options = options
  }

  disconnect(): void {
    this.disconnected = true
  }

  private observesTarget(target: Node): boolean {
    const element = target as unknown as TestElement
    if (element === this.target) return true
    if (!this.options.subtree) return false
    let current = element.parentNode
    while (current) {
      if (current === this.target) return true
      current = current.parentNode
    }
    return false
  }

  private acceptsMutation(type: 'attributes' | 'childList'): boolean {
    return this.options[type] === true
  }

  static emit(target: Node, addedNodes: Node[] = [], removedNodes: Node[] = []): void {
    const mutation = { type: 'childList', target, addedNodes, removedNodes } as unknown as MutationRecord
    for (const observer of TestMutationObserver.instances) {
      if (!observer.disconnected && observer.acceptsMutation('childList') && observer.observesTarget(target)) {
        observer.callback([mutation], observer as unknown as MutationObserver)
      }
    }
  }

  static emitAttribute(target: Node, attributeName: string): void {
    const mutation = { type: 'attributes', target, attributeName } as unknown as MutationRecord
    for (const observer of TestMutationObserver.instances) {
      if (!observer.disconnected && observer.acceptsMutation('attributes') && observer.observesTarget(target)) {
        observer.callback([mutation], observer as unknown as MutationObserver)
      }
    }
  }
}

describe('应用浮层 mutation 过滤', () => {
  test('普通 Agent 流式消息更新不会触发 selector 扫描或布局回调', () => {
    expect(classify({
      type: 'childList',
      target: 'other',
      addedNodes: ['other'],
    })).toBe(false)

    expect(classify({
      type: 'attributes',
      target: 'other',
      attributeName: 'data-state',
    })).toBe(false)
  })

  test('body 只挂载普通 Portal 容器时不触发，后续 Dialog 进入 Portal 路径时触发', () => {
    expect(classify({
      type: 'childList',
      target: 'body',
      addedNodes: ['other'],
    })).toBe(false)

    expect(classify({
      type: 'childList',
      target: 'portal-path',
      addedNodes: ['overlay-root'],
    })).toBe(true)
  })

  test('Radix/Sonner 浮层根直接挂载、卸载都会触发', () => {
    expect(classify({
      type: 'childList',
      target: 'body',
      addedNodes: ['overlay-root'],
    })).toBe(true)

    expect(classify({
      type: 'childList',
      target: 'portal-path',
      removedNodes: ['overlay-root'],
    })).toBe(true)
  })

  test('只处理浮层生命周期属性，忽略普通属性变化', () => {
    expect(classify({
      type: 'attributes',
      target: 'overlay-root',
      attributeName: 'data-state',
    })).toBe(true)
    expect(classify({
      type: 'attributes',
      target: 'inside-overlay',
      attributeName: 'role',
    })).toBe(true)
    expect(classify({
      type: 'attributes',
      target: 'overlay-root',
      attributeName: 'class',
    })).toBe(false)
  })

  test('导出的 selector 覆盖 Radix Dialog、Popover 与 Sonner 根', () => {
    expect(APP_OVERLAY_LIFECYCLE_SELECTOR).not.toContain('[role="dialog"]')
    expect(APP_OVERLAY_LIFECYCLE_SELECTOR).not.toContain('[role="alertdialog"]')
    expect(APP_OVERLAY_LIFECYCLE_SELECTOR).toContain('[data-app-local-overlay]')
    expect(APP_OVERLAY_LIFECYCLE_SELECTOR).toContain('[data-radix-popper-content-wrapper]')
    expect(APP_OVERLAY_LIFECYCLE_SELECTOR).toContain('[data-sonner-toast]')
    expect(APP_OVERLAY_LIFECYCLE_SELECTOR).toContain('[data-app-modal-overlay]')
  })

  test('观察器启动前已存在的 Portal 根仍监听浮层状态变化', () => {
    const originalElement = globalThis.Element
    Object.defineProperty(globalThis, 'Element', { configurable: true, value: TestElement })
    TestMutationObserver.instances.clear()

    try {
      const body = new TestElement()
      const portal = new TestElement()
      const dialog = new TestElement(['[data-app-local-overlay]'])
      portal.append(dialog)
      body.append(portal)

      let changes = 0
      const disconnect = observeAppOverlayLifecycle(() => { changes += 1 }, {
        body: body as unknown as HTMLElement,
        mutationObserver: TestMutationObserver as unknown as typeof MutationObserver,
      })

      // The portal and dialog were mounted before BrowserSlot created its observer.
      // Closing the existing dialog must still trigger a layout recomputation.
      TestMutationObserver.emitAttribute(dialog as unknown as Node, 'data-state')
      expect(changes).toBe(1)

      disconnect()
    } finally {
      Object.defineProperty(globalThis, 'Element', { configurable: true, value: originalElement })
      TestMutationObserver.instances.clear()
    }
  })

  test('观察器启动前已存在的 Portal 根中新增浮层仍触发生命周期回调', () => {
    const originalElement = globalThis.Element
    Object.defineProperty(globalThis, 'Element', { configurable: true, value: TestElement })
    TestMutationObserver.instances.clear()

    try {
      const body = new TestElement()
      const portal = new TestElement(['[data-sonner-toaster]'])
      body.append(portal)

      let changes = 0
      const disconnect = observeAppOverlayLifecycle(() => { changes += 1 }, {
        body: body as unknown as HTMLElement,
        mutationObserver: TestMutationObserver as unknown as typeof MutationObserver,
      })

      const toast = new TestElement(['[data-sonner-toast]'])
      portal.append(toast)
      TestMutationObserver.emit(portal as unknown as Node, [toast as unknown as Node])
      expect(changes).toBe(1)

      disconnect()
    } finally {
      Object.defineProperty(globalThis, 'Element', { configurable: true, value: originalElement })
      TestMutationObserver.instances.clear()
    }
  })

  test('完整 Portal 子树从 body 卸载时清理浮层根、断开局部 observer 并回调', () => {
    const originalElement = globalThis.Element
    Object.defineProperty(globalThis, 'Element', { configurable: true, value: TestElement })
    TestMutationObserver.instances.clear()

    try {
      const body = new TestElement()
      const portal = new TestElement()
      const dialog = new TestElement(['[data-app-local-overlay]'])
      const popover = new TestElement(['[data-radix-popper-content-wrapper]'])
      portal.append(dialog)
      dialog.append(popover)
      body.append(portal)

      let changes = 0
      const disconnect = observeAppOverlayLifecycle(() => { changes += 1 }, {
        body: body as unknown as HTMLElement,
        mutationObserver: TestMutationObserver as unknown as typeof MutationObserver,
      })

      // Portal and all descendant overlays existed before BrowserSlot created its observers.
      TestMutationObserver.emitAttribute(dialog as unknown as Node, 'data-state')
      expect(changes).toBe(1)

      body.remove(portal)
      TestMutationObserver.emit(body as unknown as Node, [], [portal as unknown as Node])
      expect(changes).toBe(2)

      // Removing the whole Portal must disconnect observers rooted at the Portal and its descendants.
      TestMutationObserver.emitAttribute(dialog as unknown as Node, 'data-state')
      TestMutationObserver.emit(dialog as unknown as Node, [popover as unknown as Node])
      expect(changes).toBe(2)

      disconnect()
    } finally {
      Object.defineProperty(globalThis, 'Element', { configurable: true, value: originalElement })
      TestMutationObserver.instances.clear()
    }
  })
})
