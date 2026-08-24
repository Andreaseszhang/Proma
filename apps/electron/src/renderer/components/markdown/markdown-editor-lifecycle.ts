export interface MarkdownEditorInstance {
  destroy: () => void
  getDoc: () => string
  update: (value: string) => void
}

type CreateEditor = (value: string, onUpdate: (value: string) => void) => MarkdownEditorInstance | PromiseLike<MarkdownEditorInstance>

/**
 * Owns an asynchronously-created editor instance. Keeping this outside React
 * makes a discarded StrictMode effect harmless: its late instance is destroyed
 * instead of replacing the active editor.
 */
export function createMarkdownEditorLifecycle(createEditor: CreateEditor, onUpdate: (value: string) => void) {
  let disposed = false
  let ready = false
  let instance: MarkdownEditorInstance | null = null
  let latestValue = ''

  return {
    mount(value: string): void {
      latestValue = value
      void Promise.resolve(createEditor(value, (nextValue) => {
        if (ready && !disposed) onUpdate(nextValue)
      })).then((nextInstance) => {
        if (disposed) {
          nextInstance.destroy()
          return
        }
        instance = nextInstance
        if (instance.getDoc() !== latestValue) instance.update(latestValue)
        ready = true
      })
    },
    sync(value: string): void {
      latestValue = value
      if (instance && instance.getDoc() !== value) instance.update(value)
    },
    getInstance(): MarkdownEditorInstance | null {
      return instance
    },
    dispose(): void {
      disposed = true
      ready = false
      instance?.destroy()
      instance = null
    },
  }
}
