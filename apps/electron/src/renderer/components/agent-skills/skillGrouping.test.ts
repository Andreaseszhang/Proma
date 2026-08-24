import { expect, test } from 'bun:test'
import { groupSkills } from './skillGrouping'

test('places pinned Skills first within their own category without changing category order', () => {
  const groups = groupSkills([
    { slug: 'docs-first', name: 'Docs first', group: '文档', enabled: true },
    { slug: 'docs-pinned', name: 'Docs pinned', group: '文档', enabled: true, pinned: true },
    { slug: 'dev-pinned', name: 'Dev pinned', group: '开发', enabled: true, pinned: true },
    { slug: 'dev-first', name: 'Dev first', group: '开发', enabled: true },
  ])

  expect(groups.map((group) => group.title)).toEqual(['开发', '文档'])
  expect(groups.find((group) => group.title === '开发')?.skills.map((skill) => skill.slug)).toEqual([
    'dev-pinned',
    'dev-first',
  ])
  expect(groups.find((group) => group.title === '文档')?.skills.map((skill) => skill.slug)).toEqual([
    'docs-pinned',
    'docs-first',
  ])
})
