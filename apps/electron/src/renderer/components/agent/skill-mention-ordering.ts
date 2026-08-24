export function orderSkillsForMention<T extends { pinned?: boolean }>(skills: readonly T[]): T[] {
  return skills
    .map((skill, index) => ({ skill, index }))
    .sort((left, right) => Number(Boolean(right.skill.pinned)) - Number(Boolean(left.skill.pinned)) || left.index - right.index)
    .map(({ skill }) => skill)
}
