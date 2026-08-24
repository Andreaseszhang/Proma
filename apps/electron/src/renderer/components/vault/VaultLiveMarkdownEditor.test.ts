import { describe, expect, test } from 'bun:test'
import { detectVaultBlockKinds } from './VaultLiveMarkdownEditor'

describe('Vault live Markdown block detection', () => {
  test('recognizes only leading YAML frontmatter and skips ordinary thematic breaks', () => {
    expect(detectVaultBlockKinds('---\ntags: [vault]\n---\n\n正文\n---')).toEqual([
      { kind: 'frontmatter', startLine: 1, endLine: 3 },
    ])
    expect(detectVaultBlockKinds('正文\n---\n内容\n---')).toEqual([])
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
