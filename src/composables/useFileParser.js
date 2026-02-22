import { ref } from 'vue'
import { useGraphStore } from '@/stores/graphStore'
import { useSettingsStore } from '@/stores/settingsStore'
import { parseJSON } from '@/services/parsers/jsonParser'
import { parseCSV } from '@/services/parsers/csvParser'
import { parseTXT } from '@/services/parsers/txtParser'
import { parseMD } from '@/services/parsers/mdParser'
import { parsePDF } from '@/services/parsers/pdfParser'
import { extractWithLLM } from '@/services/llmExtractor'
import { saveFileContent } from '@/services/apiClient'
import { generateId } from '@/utils/idGenerator'

export function useFileParser() {
  const graphStore = useGraphStore()
  const settings = useSettingsStore()
  const parsing = ref(false)
  const extracting = ref(false)
  const parseError = ref(null)
  const lastResult = ref(null)

  function getExt(fileName) {
    return fileName.split('.').pop().toLowerCase()
  }

  /** Check if this file type should use LLM extraction */
  function isUnstructuredType(ext) {
    return ['txt', 'md', 'markdown', 'pdf'].includes(ext)
  }

  /** Check if LLM extraction is available */
  function canUseLLM() {
    return settings.useLLMExtraction && settings.isApiConfigured
  }

  async function parseFile(file) {
    parsing.value = true
    extracting.value = false
    parseError.value = null
    lastResult.value = null

    try {
      const ext = getExt(file.name)
      let result
      let fileTextContent = null // plain text for saving to backend

      if (ext === 'json') {
        const text = await file.text()
        fileTextContent = text
        result = parseJSON(text)
      } else if (ext === 'csv') {
        const text = await file.text()
        fileTextContent = text
        result = parseCSV(text)
      } else if (isUnstructuredType(ext) && canUseLLM()) {
        // Unstructured text + LLM available → use LLM extraction
        let plainText
        if (ext === 'pdf') {
          const arrayBuffer = await file.arrayBuffer()
          plainText = await extractPdfText(arrayBuffer)
        } else {
          plainText = await file.text()
        }
        fileTextContent = plainText

        extracting.value = true
        try {
          result = await extractWithLLM(plainText, settings)
        } catch (llmErr) {
          // LLM failed → fall back to regex extraction
          console.warn('LLM extraction failed, falling back to regex:', llmErr.message)
          result = fallbackParse(ext, plainText, file)
        }
        extracting.value = false
      } else {
        // Unstructured text without LLM → regex extraction
        if (ext === 'pdf') {
          const arrayBuffer = await file.arrayBuffer()
          fileTextContent = await extractPdfText(arrayBuffer)
          result = await parsePDF(arrayBuffer)
        } else {
          const text = await file.text()
          fileTextContent = text
          result = fallbackParse(ext, text, file)
        }
      }

      if (!result) throw new Error(`不支持的文件格式: ${ext}`)

      lastResult.value = {
        fileName: file.name,
        fileType: ext,
        fileSize: file.size,
        fileTextContent,
        nodes: result.nodes,
        edges: result.edges,
        nodeCount: result.nodes.length,
        edgeCount: result.edges.length
      }
      return lastResult.value
    } catch (e) {
      parseError.value = e.message
      throw e
    } finally {
      parsing.value = false
      extracting.value = false
    }
  }

  /** Fall back to regex-based parsing for unstructured text */
  function fallbackParse(ext, text) {
    switch (ext) {
      case 'md':
      case 'markdown':
        return parseMD(text)
      case 'txt':
      default:
        return parseTXT(text)
    }
  }

  /** Extract plain text from PDF ArrayBuffer (reuses pdfParser internals) */
  async function extractPdfText(arrayBuffer) {
    let pdfjsLib
    try {
      pdfjsLib = await import('pdfjs-dist')
      try {
        const workerModule = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
        pdfjsLib.GlobalWorkerOptions.workerSrc = workerModule.default
      } catch {
        pdfjsLib.GlobalWorkerOptions.workerSrc = ''
      }
    } catch {
      // pdfjs not available, return empty
      return ''
    }

    const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise
    const pages = []
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i)
      const content = await page.getTextContent()
      const lines = new Map()
      for (const item of content.items) {
        if (!item.str) continue
        const y = Math.round(item.transform[5])
        if (!lines.has(y)) lines.set(y, [])
        lines.get(y).push(item.str)
      }
      const sorted = Array.from(lines.entries())
        .sort((a, b) => b[0] - a[0])
        .map(([, strs]) => strs.join(' '))
      pages.push(sorted.join('\n'))
    }
    return pages.join('\n\n')
  }

  async function confirmImport() {
    if (!lastResult.value) return
    graphStore.mergeGraph(
      { nodes: lastResult.value.nodes, edges: lastResult.value.edges },
      lastResult.value.fileName
    )

    // Save file content to backend for RAG
    const graphId = graphStore.currentGraphId
    if (graphId && lastResult.value.fileTextContent) {
      try {
        await saveFileContent(graphId, {
          id: generateId('f'),
          fileName: lastResult.value.fileName,
          content: lastResult.value.fileTextContent,
          fileType: lastResult.value.fileType,
          fileSize: lastResult.value.fileSize
        })
      } catch (e) {
        console.warn('[useFileParser] Failed to save file content to backend:', e.message)
      }
    }

    const imported = lastResult.value
    lastResult.value = null
    return imported
  }

  function cancelImport() {
    lastResult.value = null
  }

  return { parsing, extracting, parseError, lastResult, parseFile, confirmImport, cancelImport }
}
