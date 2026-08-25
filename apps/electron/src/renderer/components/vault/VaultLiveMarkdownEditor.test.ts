import { describe, expect, test } from 'bun:test'
import { detectVaultBlockKinds } from './VaultLiveMarkdownEditor'

describe('Vault live Markdown block detection', () => {
  test('recognizes leading YAML frontmatter without treating its delimiters as thematic breaks', () => {
    expect(detectVaultBlockKinds('---\ntags: [vault]\n---\n\n正文\n---')).toEqual([
      { kind: 'frontmatter', startLine: 1, endLine: 3 },
      { kind: 'thematic_break', startLine: 6, endLine: 6 },
    ])
    expect(detectVaultBlockKinds('正文\n---\n内容\n---')).toEqual([
      { kind: 'thematic_break', startLine: 2, endLine: 2 },
      { kind: 'thematic_break', startLine: 4, endLine: 4 },
    ])
  })

  test('recognizes GFM tables without rendering the separator row', () => {
    expect(detectVaultBlockKinds('| Name | Value |\n| --- | :---: |\n| A | B |')).toEqual([
      { kind: 'table', startLine: 1, endLine: 3 },
    ])
  })

  test('recognizes closed Mermaid fences and leaves ordinary code fences alone', () => {
    expect(detectVaultBlockKinds('```mermaid\nflowchart TD\n  A --> B\n```')).toEqual([
      { kind: 'mermaid', startLine: 1, endLine: 4 },
    ])
    expect(detectVaultBlockKinds('```ts\nconst value = 1\n```')).toEqual([])
    expect(detectVaultBlockKinds('```mermaid\nflowchart TD\n  A --> B')).toEqual([])
  })
})
