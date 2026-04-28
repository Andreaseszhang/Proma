import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}

/** 递增 Map 中指定 key 的数值版本号，返回新 Map（不可变） */
export function bumpMapVersion(prev: Map<string, number>, key: string): Map<string, number> {
  const m = new Map(prev)
  m.set(key, (m.get(key) ?? 0) + 1)
  return m
}
