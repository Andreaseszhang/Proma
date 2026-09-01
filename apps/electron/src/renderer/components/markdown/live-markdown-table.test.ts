import { describe, expect, test } from 'bun:test'
import {
  isLikelyLiveMarkdownLatex,
  nextLiveMarkdownTableCell,
  parseLiveMarkdownTable,
  serializeLiveMarkdownTable,
  shouldCommitLiveMarkdownTableCell,
  updateLiveMarkdownTableCell,
} from './live-markdown-table'

describe('Live Markdown 表格', () => {
  test('解析并序列化时保留列对齐与转义管道符', () => {
    const table = parseLiveMarkdownTable([
      '| 名称 | 公式 |',
      '| :--- | :---: |',
      '| A\\|B | $x^2$ |',
    ].join('\n'))

    expect(table).not.toBeNull()
    expect(table?.alignments).toEqual(['left', 'center'])
    expect(table?.rows[0]).toEqual(['A|B', '$x^2$'])
    expect(serializeLiveMarkdownTable(table!)).toBe([
      '| 名称 | 公式 |',
      '| :--- | :---: |',
      '| A\\|B | $x^2$ |',
    ].join('\n'))
  })

  test('只有草稿变化时才需要提交文档事务', () => {
    expect(shouldCommitLiveMarkdownTableCell('原始值', '原始值')).toBe(false)
    expect(shouldCommitLiveMarkdownTableCell('原始值', '新值')).toBe(true)
  })

  test('Tab 导航在表格边界循环，并保留单元格更新', () => {
    const table = parseLiveMarkdownTable([
      '| A | B |',
      '| --- | --- |',
      '| 1 | 2 |',
    ].join('\n'))!

    expect(nextLiveMarkdownTableCell(table, { row: 1, column: 1 }, false)).toEqual({ row: 0, column: 0 })
    expect(nextLiveMarkdownTableCell(table, { row: 0, column: 0 }, true)).toEqual({ row: 1, column: 1 })
    expect(updateLiveMarkdownTableCell(table, 1, 0, '已更新').rows[0]?.[0]).toBe('已更新')
  })

  test('只把明确的反引号 LaTeX 识别为公式', () => {
    expect(isLikelyLiveMarkdownLatex('\\frac{a}{b}')).toBe(true)
    expect(isLikelyLiveMarkdownLatex('x^2')).toBe(true)
    expect(isLikelyLiveMarkdownLatex('a_{ij}')).toBe(true)
    expect(isLikelyLiveMarkdownLatex('file_name')).toBe(false)
    expect(isLikelyLiveMarkdownLatex('v1_2')).toBe(false)
  })
})
