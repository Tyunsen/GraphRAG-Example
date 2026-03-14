/**
 * Markdown parser — extracts heading structure, strips syntax,
 * then delegates to the text extraction engine.
 */
import { extractFromText } from './txtParser.js'

function stripInline(text) {
  return String(text || '')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/(`{1,3})([^`]+)\1/g, '$2')
    .replace(/(\*{1,3}|_{1,3})([^*_]+)\1/g, '$2')
    .replace(/<[^>]+>/g, ' ')
}

export function parseMD(text) {
  const headings = []
  const plainLines = []

  for (const line of text.split('\n')) {
    // Extract headings → entities with hierarchy level
    const hMatch = line.match(/^(#{1,6})\s+(.+)/)
    if (hMatch) {
      const level = hMatch[1].length
      const label = stripInline(hMatch[2]).trim()
      if (label.length >= 2) {
        headings.push({ label, type: '概念', level })
      }
      plainLines.push(label)
      continue
    }

    // Skip code blocks
    if (line.trim().startsWith('```')) { continue }

    // Extract link text  [text](url) → "text" kept as plain text
    // Extract bold/italic as candidate entities (kept in text)
    let cleaned = line
      .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')     // images → alt text
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')       // links → text
      .replace(/(`{1,3})([^`]+)\1/g, '$2')           // inline code → text
      .replace(/(\*{1,3}|_{1,3})([^*_]+)\1/g, '$2')  // bold/italic → text
      .replace(/^[\s>*\-+]+/, '')                      // list markers, blockquotes
      .replace(/^\d+\.\s+/, '')                        // ordered list markers
      .replace(/\|/g, ' ')                             // table pipes
      .replace(/^-{3,}$/, '')                          // horizontal rules

    plainLines.push(cleaned)
  }

  const plainText = plainLines.join('\n')
  return extractFromText(plainText, headings)
}
