import { describe, expect, test } from 'bun:test'
import { findBestSearchMatch } from './search-matching'

describe('search matching', () => {
  test('完整关键词优先返回 exact 命中', () => {
    expect(findBestSearchMatch('之前讨论了搜索优化方案', '搜索优化')).toMatchObject({
      kind: 'exact',
      score: 1000,
    })
  })

  test('三个字查询允许连续两个字片段命中', () => {
    expect(findBestSearchMatch('我们讨论了搜索功能', '搜索优')).toMatchObject({
      kind: 'fragment',
    })
  })

  test('较长查询允许一个漏字或错字', () => {
    expect(findBestSearchMatch('这是搜索优方案', '搜索优化方案')?.kind).toBe('fuzzy')
    expect(findBestSearchMatch('这是搜索优先方案', '搜索优化方案')?.kind).toBe('fuzzy')
  })

  test('fuzzy 匹配覆盖正文前 2000 个字符之后的位置', () => {
    const text = `${'前'.repeat(2_100)}搜索优方案`

    expect(findBestSearchMatch(text, '搜索优化方案')).toMatchObject({
      kind: 'fuzzy',
      matchStart: 2_100,
    })
  })

  test('匹配忽略大小写、全角形式、空格和常见标点', () => {
    expect(findBestSearchMatch('Use SearchDialog now', 'ｓｅａｒｃｈ　ｄｉａｌｏｇ')).toMatchObject({
      kind: 'exact',
    })
    expect(findBestSearchMatch('搜索，优化', '搜索优化')).toMatchObject({
      kind: 'exact',
    })
  })

  test('一到两个字符仍然要求精确匹配', () => {
    expect(findBestSearchMatch('搜索功能', '索引')).toBeNull()
    expect(findBestSearchMatch('搜索功能', '搜')).toBeNull()
  })
})
