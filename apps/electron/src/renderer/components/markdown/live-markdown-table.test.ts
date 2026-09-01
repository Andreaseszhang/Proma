import { describe, expect, test } from 'bun:test'
import {
  isLiveMarkdownTableSeparator,
  parseLiveMarkdownTable,
  serializeLiveMarkdownTable,
  type LiveMarkdownTable,
  type LiveMarkdownTableAlignment,
  updateLiveMarkdownTableCell,
} from './live-markdown-table'

describe('Live Markdown table model', () => {
  test('识别并解析带对齐方式的 GFM 表格', () => {
    const source = '| Name | Score |\n| :--- | ---: |\n| Ada | 10 |'
    expect(isLiveMarkdownTableSeparator('| :--- | ---: |')).toBe(true)
    expect(parseLiveMarkdownTable(source)).toEqual({
      header: ['Name', 'Score'],
      rows: [['Ada', '10']],
      alignments: ['left', 'right'],
    })
  })

  test('不合法的表格语法不会被误判为表格', () => {
    expect(parseLiveMarkdownTable('| A | B |\n| -- | --- |')).toBeNull()
    expect(isLiveMarkdownTableSeparator('| --- | text |')).toBe(false)
  })
  test('序列化后可再次解析并保留竖线与反斜杠', () => {
    const table: LiveMarkdownTable = {
      header: ['Item', 'Formula'],
      rows: [['A | B', '$x\\\\y$']],
      alignments: [null, 'center'] as LiveMarkdownTableAlignment[],
    }
    const serialized = serializeLiveMarkdownTable(table)
    expect(serialized).toContain('A \\| B')
    expect(parseLiveMarkdownTable(serialized)).toEqual(table)
  })

  test('接受美元和反斜杠分隔的 LaTeX 单元格内容', () => {
    const source = '| Inline | Parenthesized | Display |\n| --- | --- | --- |\n| $x^2$ | \\(a+b\\) | \\[\\frac{1}{2}\\] |'
    expect(parseLiveMarkdownTable(source)).toEqual({
      header: ['Inline', 'Parenthesized', 'Display'],
      rows: [['$x^2$', '\\(a+b\\)', '\\[\\frac{1}{2}\\]']],
      alignments: [null, null, null],
    })
  })

  test('更新表头和数据单元格不会影响其它单元格', () => {
    const table: LiveMarkdownTable = {
      header: ['A', 'B'],
      rows: [['1', '2']],
      alignments: [null, null],
    }
    const withHeader = updateLiveMarkdownTableCell(table, 0, 1, 'B2')
    const withBody = updateLiveMarkdownTableCell(withHeader, 1, 0, '10')
    expect(withBody).toEqual({
      header: ['A', 'B2'],
      rows: [['10', '2']],
      alignments: [null, null],
    })
  })
})
