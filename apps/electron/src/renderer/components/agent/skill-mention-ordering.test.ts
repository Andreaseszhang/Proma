import { expect, test } from 'bun:test'
import { orderSkillsForMention } from './skill-mention-ordering'

test('places pinned Skills first without changing the relative order within each group', () => {
  const skills = [
    { slug: 'first' },
    { slug: 'pinned-first', pinned: true },
    { slug: 'second' },
    { slug: 'pinned-second', pinned: true },
  ]

  expect(orderSkillsForMention(skills).map((skill) => skill.slug)).toEqual([
    'pinned-first',
    'pinned-second',
    'first',
    'second',
  ])
})
