export type SearchMatchKind = 'exact' | 'fragment' | 'fuzzy'

export interface SearchMatch {
  matchStart: number
  matchLength: number
  score: number
  kind: SearchMatchKind
}

interface NormalizedText {
  chars: string[]
  starts: number[]
  ends: number[]
}

const IGNORABLE_SEPARATOR_RE = /^[\s,.!?;:，。！？、；：“”‘’（）()【】\[\]《》<>〈〉「」『』·…—–\-_\\/]+$/u
const MAX_FUZZY_WINDOW_STARTS = 2000

function normalizeText(text: string): NormalizedText {
  const chars: string[] = []
  const starts: number[] = []
  const ends: number[] = []

  for (let index = 0; index < text.length;) {
    const codePoint = text.codePointAt(index)
    if (codePoint === undefined) break
    const originalChar = String.fromCodePoint(codePoint)
    const originalEnd = index + originalChar.length
    const normalized = originalChar.normalize('NFKC').toLowerCase()

    for (const char of Array.from(normalized)) {
      if (IGNORABLE_SEPARATOR_RE.test(char)) continue
      chars.push(char)
      starts.push(index)
      ends.push(originalEnd)
    }
    index = originalEnd
  }

  return { chars, starts, ends }
}

function findSequence(haystack: string[], needle: string[]): number {
  if (needle.length === 0 || haystack.length < needle.length) return -1
  const lastStart = haystack.length - needle.length
  for (let start = 0; start <= lastStart; start++) {
    let matches = true
    for (let offset = 0; offset < needle.length; offset++) {
      if (haystack[start + offset] !== needle[offset]) {
        matches = false
        break
      }
    }
    if (matches) return start
  }
  return -1
}

function buildMatch(
  normalizedHaystack: NormalizedText,
  start: number,
  length: number,
  score: number,
  kind: SearchMatchKind,
): SearchMatch {
  const end = start + length - 1
  const originalStart = normalizedHaystack.starts[start] ?? 0
  const originalEnd = normalizedHaystack.ends[end] ?? originalStart
  return { matchStart: originalStart, matchLength: Math.max(0, originalEnd - originalStart), score, kind }
}

function editDistance(left: string[], right: string[]): number {
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index)
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex++) {
    const current = [leftIndex]
    let rowMinimum = current[0]!
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex++) {
      const cost = left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1
      const value = Math.min(previous[rightIndex]! + 1, current[rightIndex - 1]! + 1, previous[rightIndex - 1]! + cost)
      current.push(value)
      rowMinimum = Math.min(rowMinimum, value)
    }
    if (rowMinimum > 1) return rowMinimum
    previous = current
  }
  return previous[right.length]!
}

/**
 * 在文本中查找一处最佳命中，同时保留原文坐标供 UI 高亮。
 * 1～2 字符只做精确匹配；更长查询允许连续片段和最多一个编辑距离。
 */
export function findBestSearchMatch(text: string, query: string): SearchMatch | null {
  const normalizedHaystack = normalizeText(text)
  const needle = normalizeText(query).chars
  const haystack = normalizedHaystack.chars
  if (needle.length < 2 || haystack.length === 0) return null

  const exactStart = findSequence(haystack, needle)
  if (exactStart >= 0) return buildMatch(normalizedHaystack, exactStart, needle.length, 1000, 'exact')
  if (needle.length < 3) return null

  let best: SearchMatch | null = null
  const minimumFragmentLength = needle.length === 3 ? 2 : Math.max(2, Math.ceil(needle.length * 0.75))
  for (let length = needle.length - 1; length >= minimumFragmentLength; length--) {
    for (let queryStart = 0; queryStart + length <= needle.length; queryStart++) {
      const haystackStart = findSequence(haystack, needle.slice(queryStart, queryStart + length))
      if (haystackStart < 0) continue
      const candidate = buildMatch(normalizedHaystack, haystackStart, length, 700 + Math.round((length / needle.length) * 200), 'fragment')
      if (!best || candidate.score > best.score) best = candidate
    }
    if (best?.score === 900) return best
  }

  for (let length = Math.max(2, needle.length - 1); length <= needle.length + 1; length++) {
    if (length > haystack.length) continue
    const lastStart = Math.min(haystack.length - length, MAX_FUZZY_WINDOW_STARTS - 1)
    for (let haystackStart = 0; haystackStart <= lastStart; haystackStart++) {
      if (editDistance(needle, haystack.slice(haystackStart, haystackStart + length)) > 1) continue
      const candidate = buildMatch(normalizedHaystack, haystackStart, length, 650 - Math.abs(needle.length - length) * 20, 'fuzzy')
      if (!best || candidate.score > best.score) best = candidate
    }
  }

  return best
}
