import { describe, expect, test } from 'bun:test'
import { EditorState } from '@codemirror/state'
import { markdown } from '@codemirror/lang-markdown'
import { canRenderVaultWikiLink, resolveVaultWikiLink } from './vault-wikilinks'

describe('Vault 双链目标解析', () => {
  const files = ['首页.md', '项目/计划.md', '资料/参考.md', '甲/同名.md', '乙/同名.md']
  test('按完整路径、当前目录和唯一后缀定位笔记', () => {
    expect(resolveVaultWikiLink('首页', '项目/当前.md', files)).toBe('首页.md')
    expect(resolveVaultWikiLink('计划', '项目/当前.md', files)).toBe('项目/计划.md')
    expect(resolveVaultWikiLink('资料/参考.md', '项目/当前.md', files)).toBe('资料/参考.md')
    expect(resolveVaultWikiLink('参考', '项目/当前.md', files)).toBe('资料/参考.md')
    expect(resolveVaultWikiLink('../首页', '项目/当前.md', files)).toBe('首页.md')
  })
  test('根路径精确命中优先，显式相对路径选择当前目录，后缀重名不猜测', () => {
    const sameNames = ['计划.md', '项目/计划.md', '其他/计划.md']
    expect(resolveVaultWikiLink('计划', '项目/当前.md', sameNames)).toBe('计划.md')
    expect(resolveVaultWikiLink('./计划', '项目/当前.md', sameNames)).toBe('项目/计划.md')
    expect(resolveVaultWikiLink('计划', '外部/当前.md', sameNames.slice(1))).toBeNull()
  })
  test('缺失、歧义、越界或非笔记目标不猜测跳转', () => {
    for (const target of ['不存在', '同名', '../../首页', 'https://example.com', '首页#标题', '']) {
      expect(resolveVaultWikiLink(target, '项目/当前.md', files)).toBeNull()
    }
  })
})

describe('Vault 双链装饰边界', () => {
  const allowed = (doc: string): boolean => {
    const state = EditorState.create({ doc, extensions: [markdown()] })
    const from = doc.indexOf('[[')
    return canRenderVaultWikiLink(state, from)
  }
  test('正文、别名和属性区之后的正文可渲染', () => {
    expect(allowed('正文 [[笔记]]')).toBe(true)
    expect(allowed('[[笔记|别名]]')).toBe(true)
    expect(allowed('---\ntitle: 示例\n---\n[[笔记]]')).toBe(true)
    expect(allowed('\\\\[[笔记]]')).toBe(true)
  })
  test('首行分隔线和未形成封闭属性区的正文仍渲染', () => {
    expect(allowed('---\n\n正文 [[笔记]]')).toBe(true)
    expect(allowed('---\n---\n正文 [[笔记]]')).toBe(true)
    expect(allowed('---\ntitle: 示例\n正文 [[笔记]]')).toBe(true)
  })
  test('复杂属性区和 BOM 属性区保持原文，闭合之后正常渲染', () => {
    expect(allowed('---\naliases:\n  - [[笔记]]\n---')).toBe(false)
    expect(allowed('\uFEFF---\nalias: [[笔记]]\n---')).toBe(false)
    expect(allowed('\uFEFF---\ntitle: 示例\n---\n[[笔记]]')).toBe(true)
  })
  test('选区事务复用属性范围，文档变化后重新判断', () => {
    const doc = '---\nalias: [[笔记]]\n---'
    const state = EditorState.create({ doc, extensions: [markdown()] })
    const from = doc.indexOf('[[')
    expect(canRenderVaultWikiLink(state, from)).toBe(false)
    const selected = state.update({ selection: { anchor: from } }).state
    expect(selected.doc).toBe(state.doc)
    expect(canRenderVaultWikiLink(selected, from)).toBe(false)
    const unclosed = selected.update({ changes: { from: doc.lastIndexOf('---'), to: doc.length } }).state
    expect(canRenderVaultWikiLink(unclosed, from)).toBe(true)
  })
  test('代码、嵌入、转义、HTML 和属性原文不渲染', () => {
    for (const doc of ['`[[笔记]]`', '```md\n[[笔记]]\n```', '    [[笔记]]', '![[笔记]]', '\\[[笔记]]', '<div>\n[[笔记]]\n</div>', '---\nalias: [[笔记]]\n---']) {
      expect(allowed(doc)).toBe(false)
    }
  })
})
