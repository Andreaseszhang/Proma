type Schedule = (callback: () => void, delay: number) => ReturnType<typeof setTimeout>
type Cancel = (handle: ReturnType<typeof setTimeout>) => void

/**
 * Coalesces rapid text edits and guarantees that only the newest request may
 * publish a result. The executor stays injectable so this behaviour is tested
 * without Electron IPC or a mounted component.
 */
export function createLatestDebouncedRequest<TInput, TResult>(
  execute: (input: TInput) => Promise<TResult>,
  delay = 200,
  schedule: Schedule = (callback, timeout) => setTimeout(callback, timeout),
  cancelSchedule: Cancel = (handle) => clearTimeout(handle),
): {
  request: (input: TInput, onSuccess: (value: TResult) => void, onError: () => void) => void
  cancel: () => void
} {
  let timer: ReturnType<typeof setTimeout> | null = null
  let generation = 0

  const cancel = (): void => {
    generation += 1
    if (timer !== null) cancelSchedule(timer)
    timer = null
  }

  return {
    request: (input, onSuccess, onError) => {
      cancel()
      const requestGeneration = generation
      timer = schedule(() => {
        timer = null
        void execute(input)
          .then((result) => {
            if (generation === requestGeneration) onSuccess(result)
          })
          .catch(() => {
            if (generation === requestGeneration) onError()
          })
      }, delay)
    },
    cancel,
  }
}
