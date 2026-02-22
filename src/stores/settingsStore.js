import { defineStore } from 'pinia'
import { ref, watch, computed } from 'vue'
import { getDefaultPrompt } from '@/services/llmExtractor'

const STORAGE_KEY = 'zstp-settings'

function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export const useSettingsStore = defineStore('settings', () => {
  const saved = loadFromStorage()

  const apiEndpoint = ref(saved?.apiEndpoint || '')
  const apiKey = ref(saved?.apiKey || '')
  const modelName = ref(saved?.modelName || '')
  const temperature = ref(saved?.temperature ?? 0.7)
  const maxTokens = ref(saved?.maxTokens ?? 1024)
  const bfsDepth = ref(saved?.bfsDepth ?? 2)
  const bfsMaxNodes = ref(saved?.bfsMaxNodes ?? 50)

  // LLM extraction settings
  const useLLMExtraction = ref(saved?.useLLMExtraction ?? true)
  const extractionPrompt = ref(saved?.extractionPrompt || getDefaultPrompt())

  const isApiConfigured = computed(() => !!apiEndpoint.value)

  function persist() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      apiEndpoint: apiEndpoint.value,
      apiKey: apiKey.value,
      modelName: modelName.value,
      temperature: temperature.value,
      maxTokens: maxTokens.value,
      bfsDepth: bfsDepth.value,
      bfsMaxNodes: bfsMaxNodes.value,
      useLLMExtraction: useLLMExtraction.value,
      extractionPrompt: extractionPrompt.value
    }))
  }

  watch(
    [apiEndpoint, apiKey, modelName, temperature, maxTokens, bfsDepth, bfsMaxNodes, useLLMExtraction, extractionPrompt],
    persist,
    { deep: true }
  )

  function resetDefaults() {
    apiEndpoint.value = ''
    apiKey.value = ''
    modelName.value = ''
    temperature.value = 0.7
    maxTokens.value = 1024
    bfsDepth.value = 2
    bfsMaxNodes.value = 50
    useLLMExtraction.value = true
    extractionPrompt.value = getDefaultPrompt()
  }

  function resetExtractionPrompt() {
    extractionPrompt.value = getDefaultPrompt()
  }

  return {
    apiEndpoint, apiKey, modelName, temperature, maxTokens,
    bfsDepth, bfsMaxNodes, useLLMExtraction, extractionPrompt,
    isApiConfigured, resetDefaults, resetExtractionPrompt
  }
})
