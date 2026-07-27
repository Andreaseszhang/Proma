import * as React from 'react'
import { Node, mergeAttributes } from '@tiptap/core'
import { TextSelection } from '@tiptap/pm/state'
import type { EditorView } from '@tiptap/pm/view'
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from '@tiptap/react'
import { Bot } from 'lucide-react'
import {
  dispatchAgentQuoteOpen,
  getAgentQuoteReferenceLabel,
  parseAgentQuoteReferencePayload,
  type AgentQuoteReference,
} from '@/lib/agent-quote-reference'

interface AgentQuoteReferenceChipProps {
  reference: AgentQuoteReference
}

export function AgentQuoteReferenceChip({ reference }: AgentQuoteReferenceChipProps): React.ReactElement {
  const label = getAgentQuoteReferenceLabel(reference)
  return (
    <button
      type="button"
      className="agent-quote-reference-chip"
      title={`跳转到 ${label}`}
      aria-label={`跳转到 ${label}`}
      onClick={(event) => {
        event.preventDefault()
        event.stopPropagation()
        dispatchAgentQuoteOpen(reference)
      }}
    >
      <Bot className="size-3 shrink-0" aria-hidden="true" />
      <span className="truncate">{label}</span>
    </button>
  )
}

function AgentQuoteReferenceNodeView({ node }: NodeViewProps): React.ReactElement {
  const reference = parseAgentQuoteReferencePayload(String(node.attrs.reference ?? ''))
  return (
    <NodeViewWrapper as="span" className="agent-quote-reference-node" contentEditable={false}>
      {reference ? (
        <AgentQuoteReferenceChip reference={reference} />
      ) : (
        <span className="agent-quote-reference-invalid">无效引用</span>
      )}
    </NodeViewWrapper>
  )
}

export function insertAgentQuoteReferenceAtSelection(view: EditorView, referencePayload: string): boolean {
  const nodeType = view.state.schema.nodes.agentQuoteReference
  if (!nodeType) return false

  const transaction = view.state.tr.replaceSelectionWith(nodeType.create({ reference: referencePayload }))
  const cursorPosition = transaction.selection.from
  // A trailing space supplies a real text position after an inline atom. Without it,
  // Chromium may move the caret into a following paragraph when the quote is at line end.
  transaction.insertText(' ', cursorPosition)
  transaction.setSelection(TextSelection.create(transaction.doc, cursorPosition + 1))
  view.dispatch(transaction.scrollIntoView())
  return true
}

export const AgentQuoteReferenceExtension = Node.create({
  name: 'agentQuoteReference',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      reference: {
        default: '',
        parseHTML: (element: HTMLElement) => element.getAttribute('data-reference') ?? '',
        renderHTML: (attributes: Record<string, string>) => (
          attributes.reference ? { 'data-reference': attributes.reference } : {}
        ),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'span[data-type="agent-quote-reference"]' }]
  },

  renderHTML({ HTMLAttributes }) {
    const reference = parseAgentQuoteReferencePayload(String(HTMLAttributes['data-reference'] ?? ''))
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'agent-quote-reference',
        class: 'agent-quote-reference-fallback',
      }),
      reference ? getAgentQuoteReferenceLabel(reference) : '无效引用',
    ]
  },

  addNodeView() {
    return ReactNodeViewRenderer(AgentQuoteReferenceNodeView)
  },
})
