export const MAX_LIVE_MARKDOWN_DIFF_LINES = 5_000

export function countMarkdownLines(value: string): number {
  if (!value) return 0
  let count = 1
  for (let index = 0; index < value.length; index += 1) {
    if (value[index] === '\n') count += 1
  }
  return count
}

/** Avoid running the renderer's Diff/highlight pipeline for documents beyond the supported interactive size. */
export function canRenderMarkdownDiff(beforeValue: string, diffValue: string): boolean {
  return countMarkdownLines(beforeValue) <= MAX_LIVE_MARKDOWN_DIFF_LINES
    && countMarkdownLines(diffValue) <= MAX_LIVE_MARKDOWN_DIFF_LINES
}
