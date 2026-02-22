/**
 * PDF parser — extracts text from PDF using pdfjs-dist,
 * then delegates to the text extraction engine.
 */
import { parseTXT } from './txtParser.js'

let pdfjsLib = null

async function loadPdfJs() {
  if (pdfjsLib) return pdfjsLib
  pdfjsLib = await import('pdfjs-dist')

  // Try to load the bundled worker via Vite ?url import
  try {
    const workerModule = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
    pdfjsLib.GlobalWorkerOptions.workerSrc = workerModule.default
  } catch {
    // Fallback: no worker — runs on main thread (fine for document-sized PDFs)
    pdfjsLib.GlobalWorkerOptions.workerSrc = ''
  }

  return pdfjsLib
}

/**
 * @param {ArrayBuffer} arrayBuffer  Raw PDF bytes
 * @returns {{ nodes: Array, edges: Array }}
 */
export async function parsePDF(arrayBuffer) {
  const pdfjs = await loadPdfJs()
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(arrayBuffer) }).promise

  const pages = []
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()

    // Group text items into lines by Y-coordinate
    const lines = new Map()
    for (const item of content.items) {
      if (!item.str) continue
      const y = Math.round(item.transform[5])   // vertical position
      if (!lines.has(y)) lines.set(y, [])
      lines.get(y).push(item.str)
    }

    // Sort lines top-to-bottom and join
    const sorted = Array.from(lines.entries())
      .sort((a, b) => b[0] - a[0])
      .map(([, strs]) => strs.join(' '))

    pages.push(sorted.join('\n'))
  }

  const fullText = pages.join('\n\n')
  return parseTXT(fullText)
}
