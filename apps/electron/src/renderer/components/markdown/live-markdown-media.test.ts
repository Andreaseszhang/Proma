import { describe, expect, test } from 'bun:test'
import {
  createLiveMarkdownImageResolver,
  getLiveMarkdownMediaCandidates,
  resolveLiveMarkdownImageSrc,
} from './live-markdown-media'

describe('LiveMarkdown project media resolution', () => {
  test('passes a relative image source to the main-process authorization boundary unchanged', () => {
    expect(getLiveMarkdownMediaCandidates('/repo/docs/guide.md', './assets/shot.png')).toEqual([
      './assets/shot.png',
    ])
    expect(getLiveMarkdownMediaCandidates('C:\\repo\\docs\\guide.md', 'assets/shot.png')).toEqual([
      'assets/shot.png',
    ])
  })

  test('does not send external media through local-file authorization', () => {
    expect(getLiveMarkdownMediaCandidates('/repo/README.md', 'https://example.com/shot.png')).toEqual([])
    expect(getLiveMarkdownMediaCandidates('/repo/README.md', 'data:image/png;base64,abc')).toEqual([])
  })

  test('rejects unsafe local sources before making an IPC request', async () => {
    for (const source of ['../outside.png', '%2e%2e/outside.png', '/etc/passwd', 'C:\\Windows\\win.ini', '\\\\server\\share\\shot.png', 'file:///etc/passwd']) {
      let attempted = false
      const resolved = await resolveLiveMarkdownImageSrc('/repo/README.md', source, async () => {
        attempted = true
        return 'proma-file://token'
      })
      expect(resolved).toBeNull()
      expect(attempted).toBeFalse()
    }
  })

  test('returns an authorized token URL for a main-process-approved relative image', async () => {
    const resolved = await resolveLiveMarkdownImageSrc('/repo/README.md', 'docs/My%20Shot.png', async (candidate) => (
      candidate === 'docs/My%20Shot.png' ? 'proma-file://token' : null
    ))

    expect(resolved).toBe('proma-file://token')
  })

  test('deduplicates concurrent authorization requests for the same image', async () => {
    let requestCount = 0
    const resolveImage = createLiveMarkdownImageResolver('/repo/README.md', async () => {
      requestCount += 1
      return 'proma-file://token'
    })

    expect(await Promise.all([resolveImage('assets/shot.png'), resolveImage('assets/shot.png')])).toEqual([
      'proma-file://token',
      'proma-file://token',
    ])
    expect(requestCount).toBe(1)
  })
  test('preserves remote URLs without requesting a local token', async () => {
    let attempted = false
    const resolved = await resolveLiveMarkdownImageSrc('/repo/README.md', 'https://example.com/shot.png', async () => {
      attempted = true
      return null
    })

    expect(resolved).toBe('https://example.com/shot.png')
    expect(attempted).toBeFalse()
  })
})
