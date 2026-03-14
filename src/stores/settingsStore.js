import { defineStore } from 'pinia'
import { ref, watch, computed } from 'vue'
import { getDefaultPrompt } from '@/services/llmExtractor'

const STORAGE_KEY = 'zstp-settings'
const DEFAULTS = {
  apiEndpoint: '/api/llm',
  apiKey: '',
  modelName: 'MiniMax-M2.5',
  temperature: 0.7,
  maxTokens: 1024,
  bfsDepth: 2,
  bfsMaxNodes: 50,
  useLLMExtraction: true,
  extractionPrompt: getDefaultPrompt()
}

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

  const apiEndpoint = ref(saved?.apiEndpoint || DEFAULTS.apiEndpoint)
  const apiKey = ref(saved?.apiKey || DEFAULTS.apiKey)
  const modelName = ref(saved?.modelName || DEFAULTS.modelName)
  const temperature = ref(saved?.temperature ?? DEFAULTS.temperature)
  const maxTokens = ref(saved?.maxTokens ?? DEFAULTS.maxTokens)
  const bfsDepth = ref(saved?.bfsDepth ?? DEFAULTS.bfsDepth)
  const bfsMaxNodes = ref(saved?.bfsMaxNodes ?? DEFAULTS.bfsMaxNodes)

  const useLLMExtraction = ref(saved?.useLLMExtraction ?? DEFAULTS.useLLMExtraction)
  const extractionPrompt = ref(saved?.extractionPrompt || DEFAULTS.extractionPrompt)

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
    apiEndpoint.value = DEFAULTS.apiEndpoint
    apiKey.value = DEFAULTS.apiKey
    modelName.value = DEFAULTS.modelName
    temperature.value = DEFAULTS.temperature
    maxTokens.value = DEFAULTS.maxTokens
    bfsDepth.value = DEFAULTS.bfsDepth
    bfsMaxNodes.value = DEFAULTS.bfsMaxNodes
    useLLMExtraction.value = DEFAULTS.useLLMExtraction
    extractionPrompt.value = DEFAULTS.extractionPrompt
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
