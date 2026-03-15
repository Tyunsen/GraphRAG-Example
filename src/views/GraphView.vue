<template>
  <div class="graph-view">
    <div class="workspace-sidebar">
      <AppSidebar />
    </div>

    <div class="workspace-nav-shell">
      <WorkspaceNavigator v-model:activePanel="activePanel" />
    </div>

    <main class="workspace-main">
      <div v-if="!graphStore.currentGraphMeta" class="workspace-intro">
        <div class="intro-panel">
          <div class="intro-kicker">图谱问答系统</div>
          <div class="intro-title">先创建工作区，再围绕这个意图持续导入资料和对话</div>
          <div class="intro-copy">
            工作区负责定义抽取范围，会话负责提问和证据追踪，右侧图谱负责展示当前工作区或当前消息的子图。
          </div>
        </div>
      </div>

      <div v-else class="workspace-main-inner">
        <div class="workspace-main-body" :class="{ 'workspace-main-body-chat': activePanel === 'chat' }">
          <div v-show="activePanel === 'chat'" class="panel-layer panel-layer-chat">
            <ChatPanel />
          </div>
          <div v-show="activePanel === 'files'" class="panel-layer">
            <WorkspaceFilesPanel />
          </div>
        </div>
      </div>
    </main>

    <aside class="graph-stage-shell">
      <div v-if="!graphStore.currentGraphMeta" class="graph-intro">
        <div class="graph-intro-card">
          <div class="graph-intro-kicker">图谱视图</div>
          <div class="graph-intro-copy">选中工作区后默认显示全图，点消息或证据后切到对应子图。</div>
        </div>
      </div>

      <template v-else>
        <div class="graph-stage-header">
          <div class="graph-stage-header-copy">
            <div class="graph-stage-title">{{ graphPanelTitle }}</div>
            <div class="graph-stage-subtitle">
              {{ graphStore.isFocusedView ? '当前消息对应的证据子图' : '当前工作区全图' }}
            </div>
          </div>
          <button v-if="graphStore.isFocusedView" class="graph-stage-action" @click="graphStore.showFullGraph()">
            查看全图
          </button>
        </div>

        <div v-if="graphStore.selectedNode" class="graph-node-card">
          <div class="graph-node-card-head">
            <div>
              <div class="graph-node-card-kicker">当前节点</div>
              <div class="graph-node-card-title">{{ graphStore.selectedNode.label }}</div>
            </div>
            <div class="graph-node-card-actions">
              <div class="graph-node-card-type">{{ formatNodeTypeLabel(graphStore.selectedNode.type) }}</div>
              <button class="graph-node-card-close" type="button" @click="closeNodeExplain">关闭</button>
            </div>
          </div>

          <div v-if="nodeExplainLoading" class="graph-node-card-loading">正在加载节点来源...</div>

          <template v-else-if="nodeExplain">
            <div class="graph-node-card-meta">
              <span>{{ nodeExplain.canonical?.supportCount || 0 }} 份文件支撑</span>
              <span>{{ nodeExplain.evidence?.length || 0 }} 条来源</span>
            </div>

            <div v-if="nodeExplain.evidence?.length" class="graph-node-card-group">
              <div class="graph-node-card-label">证据</div>
              <div class="graph-node-evidence-list">
                <div
                  v-for="(item, index) in nodeExplain.evidence.slice(0, 4)"
                  :key="`${item.fileId}-${item.mentionText}-${item.createdAt}`"
                  class="graph-node-evidence-item"
                >
                  <div class="graph-node-evidence-file">来源 {{ index + 1 }}</div>
                  <div class="graph-node-evidence-copy graph-node-evidence-copy-primary">
                    <span>{{ item.fileName }}</span>
                    <span v-if="item.paragraphRefs?.length">{{ formatParagraphRefSummary(item.paragraphRefs) }}</span>
                  </div>
                  <div v-if="nodeExplain.canonical?.kind === 'event'" class="graph-node-svo">
                    {{ formatEventSvo(nodeExplain.canonical) }}
                  </div>
                  <div v-if="item.paragraphs?.length" class="graph-node-paragraph-list">
                    <div
                      v-for="paragraph in item.paragraphs.slice(0, 2)"
                      :key="`${item.fileId}-${paragraph.paragraphIndex}`"
                      class="graph-node-paragraph"
                      role="button"
                      tabindex="0"
                      @click="openParagraphPreview(item.fileName, paragraph)"
                      @keydown.enter.prevent="openParagraphPreview(item.fileName, paragraph)"
                      @keydown.space.prevent="openParagraphPreview(item.fileName, paragraph)"
                    >
                      <div class="graph-node-paragraph-index">第 {{ paragraph.paragraphIndex }} 段</div>
                      <div class="graph-node-paragraph-content">{{ paragraph.content }}</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </template>
        </div>

        <div class="graph-stage">
          <GraphCanvas />
        </div>
      </template>
    </aside>

    <transition name="workspace-panel">
      <div v-if="paragraphPreview" class="workspace-overlay" @click="closeParagraphPreview">
        <div class="workspace-card graph-paragraph-preview" @click.stop>
          <div class="workspace-card-head">
            <div>
              <div class="workspace-title">{{ paragraphPreview.fileName }}</div>
              <div class="workspace-subtitle">第 {{ paragraphPreview.paragraphIndex }} 段全文</div>
            </div>
            <button class="workspace-close" type="button" @click="closeParagraphPreview">关闭</button>
          </div>
          <div class="graph-paragraph-preview-content">{{ paragraphPreview.content }}</div>
        </div>
      </div>
    </transition>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import AppSidebar from '@/components/layout/AppSidebar.vue'
import WorkspaceNavigator from '@/components/workspace/WorkspaceNavigator.vue'
import GraphCanvas from '@/components/graph/GraphCanvas.vue'
import ChatPanel from '@/components/rag/ChatPanel.vue'
import WorkspaceFilesPanel from '@/components/workspace/WorkspaceFilesPanel.vue'
import { useGraphStore } from '@/stores/graphStore'
import { useRagStore } from '@/stores/ragStore'
import { fetchNodeExplainApi } from '@/services/apiClient'
import { formatNodeTypeLabel } from '@/utils/displayText'

const graphStore = useGraphStore()
const ragStore = useRagStore()
const activePanel = ref('chat')
const nodeExplain = ref(null)
const nodeExplainLoading = ref(false)
const paragraphPreview = ref(null)

const activeMessage = computed(() =>
  ragStore.messages.find(item => item.id === ragStore.activeMessageId) || null
)

const graphPanelTitle = computed(() => {
  if (!graphStore.isFocusedView) return graphStore.currentGraphMeta?.name || '工作区图谱'
  const text = activeMessage.value?.content?.trim()
  if (!text) return '当前消息'
  return text.length > 26 ? `${text.slice(0, 26)}...` : text
})

watch(() => graphStore.currentGraphId, () => {
  activePanel.value = 'chat'
  nodeExplain.value = null
  nodeExplainLoading.value = false
})

watch(
  () => [graphStore.currentGraphId, graphStore.selectedNode?.id],
  async ([graphId, nodeId]) => {
    if (!graphId || !nodeId) {
      nodeExplain.value = null
      nodeExplainLoading.value = false
      return
    }

    nodeExplainLoading.value = true
    try {
      const explain = await fetchNodeExplainApi(graphId, nodeId)
      if (explain?.canonical?.kind === 'event' && (!explain.evidence || explain.evidence.length === 0)) {
        nodeExplain.value = null
        graphStore.setSelectedNode(null)
        return
      }
      nodeExplain.value = explain
    } catch (error) {
      console.warn('[GraphView] failed to load node explain:', error.message)
      nodeExplain.value = null
    } finally {
      nodeExplainLoading.value = false
    }
  },
  { immediate: true }
)

function formatRoleKeys(keys = []) {
  return keys
    .map(item => String(item || '').replace(/^(entity|event):/, ''))
    .filter(Boolean)
    .join('、')
}

function parseEventLabel(label = '') {
  const text = String(label || '').trim()
  if (!text) return { subject: '', predicate: '', object: '' }

  const predicates = [
    '持续打击', '发动打击', '联合打击', '直接打击', '空袭', '袭击', '打击',
    '施压', '封锁', '威胁封锁', '拦截', '发射', '报复', '回应', '谈判', '停火',
    '声明', '会谈', '伤亡', '遇袭', '受损'
  ].sort((a, b) => b.length - a.length)

  for (const predicate of predicates) {
    const index = text.indexOf(predicate)
    if (index <= 0) continue
    return {
      subject: text.slice(0, index).trim(),
      predicate,
      object: text.slice(index + predicate.length).trim()
    }
  }

  if (text.endsWith('伤亡') && text.length > 2) {
    return { subject: text.slice(0, -2).trim(), predicate: '伤亡', object: '' }
  }

  return { subject: '', predicate: text, object: '' }
}

function formatEventSvo(canonical) {
  if (!canonical) return ''
  const parsed = parseEventLabel(canonical.label || canonical.summary || '')
  const parsedIsUsable = Boolean(parsed.subject && parsed.predicate)
  const predicate = (() => {
    const raw = String(canonical.predicateText || '').trim()
    if (parsedIsUsable) return parsed.predicate
    if (raw && raw !== canonical.label) return raw
    return parsed.predicate || String(canonical.trigger || canonical.label || '相关').trim()
  })()
  const subject = parsedIsUsable
    ? parsed.subject
    : (formatRoleKeys(canonical.subjectKeys || []) || parsed.subject || '未知主体')
  const object = parsedIsUsable
    ? (parsed.object || '未知客体')
    : (formatRoleKeys(canonical.objectKeys || []) || parsed.object || '未知客体')
  return `${subject} -> ${predicate} -> ${object}`
}

function formatParagraphRefSummary(paragraphRefs = []) {
  const refs = [...new Set((paragraphRefs || []).map(item => Number(item)).filter(item => Number.isInteger(item) && item > 0))]
    .sort((a, b) => a - b)
  if (refs.length === 0) return ''
  const visible = refs.slice(0, 3)
  if (refs.length <= 3) return `第 ${visible.join('、')} 段`
  return `第 ${visible.join('、')} 等 ${refs.length} 段`
}

function openParagraphPreview(fileName, paragraph) {
  if (!paragraph) return
  paragraphPreview.value = {
    fileName,
    paragraphIndex: paragraph.paragraphIndex,
    content: paragraph.content
  }
}

function closeParagraphPreview() {
  paragraphPreview.value = null
}

function closeNodeExplain() {
  graphStore.setSelectedNode(null)
}
</script>

<style scoped>
.graph-view {
  display: grid;
  grid-template-columns: clamp(232px, 18vw, 280px) clamp(220px, 16vw, 260px) minmax(0, 1.18fr) minmax(320px, 0.92fr);
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.workspace-sidebar,
.workspace-nav-shell,
.graph-stage-shell {
  min-width: 0;
  overflow: hidden;
}

.workspace-main {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  background: linear-gradient(180deg, #ffffff 0%, #f8f9fb 100%);
}

.workspace-main-inner {
  flex: 1;
  min-height: 0;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.workspace-main-body {
  flex: 1;
  display: flex;
  min-height: 0;
  overflow: hidden;
  padding: 20px 24px 24px;
  position: relative;
}

.workspace-main-body-chat {
  padding: 0;
}

.panel-layer {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

.panel-layer-chat {
  background: #fff;
}

.workspace-intro,
.graph-intro {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}

.intro-panel,
.graph-intro-card {
  width: 100%;
  max-width: 760px;
  border-radius: 24px;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.92), rgba(247, 248, 251, 0.96));
  border: 1px solid rgba(148, 163, 184, 0.18);
  box-shadow: 0 20px 60px rgba(15, 23, 42, 0.08);
  padding: 28px;
}

.intro-kicker,
.graph-intro-kicker {
  font-size: 11px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--color-text-muted);
}

.intro-title {
  margin-top: 12px;
  font-size: 30px;
  line-height: 1.12;
  font-weight: 700;
}

.intro-copy,
.graph-intro-copy {
  margin-top: 12px;
  font-size: 14px;
  line-height: 1.8;
  color: var(--color-text-secondary);
}

.graph-stage-shell {
  display: flex;
  flex-direction: column;
  min-height: 0;
  border-left: 1px solid var(--color-border);
  background: linear-gradient(180deg, #fafaf9 0%, #f3f4f6 100%);
}

.graph-stage-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  padding: 16px 16px 12px;
  border-bottom: 1px solid rgba(148, 163, 184, 0.16);
  background: rgba(255, 255, 255, 0.76);
}

.graph-stage-title {
  font-size: 14px;
  font-weight: 700;
}

.graph-stage-subtitle {
  margin-top: 4px;
  font-size: 12px;
  color: var(--color-text-secondary);
}

.graph-stage-action {
  padding: 8px 10px;
  border-radius: 10px;
  background: rgba(79, 109, 245, 0.1);
  color: var(--color-primary);
  font-size: 12px;
  font-weight: 600;
}

.graph-node-card {
  margin: 14px 16px 0;
  padding: 14px;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.92);
  border: 1px solid rgba(148, 163, 184, 0.18);
  overflow: auto;
  max-height: min(46vh, 520px);
}

.graph-node-card-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.graph-node-card-kicker {
  font-size: 11px;
  color: var(--color-text-muted);
}

.graph-node-card-title {
  margin-top: 4px;
  font-size: 18px;
  font-weight: 700;
  line-height: 1.25;
}

.graph-node-card-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.graph-node-card-type {
  padding: 4px 8px;
  border-radius: 999px;
  background: rgba(79, 109, 245, 0.1);
  color: var(--color-primary);
  font-size: 11px;
  font-weight: 600;
}

.graph-node-card-close {
  padding: 6px 10px;
  border-radius: 10px;
  background: rgba(241, 245, 249, 0.96);
  color: var(--color-text-secondary);
  font-size: 12px;
  font-weight: 600;
}

.graph-node-card-loading,
.graph-node-card-meta {
  margin-top: 12px;
  font-size: 12px;
  color: var(--color-text-secondary);
}

.graph-node-card-meta {
  display: flex;
  gap: 12px;
}

.graph-node-card-group {
  margin-top: 14px;
}

.graph-node-card-label {
  font-size: 12px;
  font-weight: 700;
}

.graph-node-evidence-list {
  display: grid;
  gap: 10px;
  margin-top: 10px;
}

.graph-node-evidence-item {
  padding: 10px;
  border-radius: 14px;
  background: rgba(248, 250, 252, 0.95);
  border: 1px solid var(--color-border-light);
}

.graph-node-evidence-file {
  font-size: 11px;
  font-weight: 700;
  color: var(--color-text-secondary);
}

.graph-node-evidence-copy {
  margin-top: 6px;
  font-size: 12px;
  color: var(--color-text-secondary);
  display: flex;
  justify-content: space-between;
  gap: 12px;
}

.graph-node-evidence-copy-primary {
  color: var(--color-text);
  font-weight: 600;
}

.graph-node-svo {
  margin-top: 8px;
  padding: 8px 10px;
  border-radius: 12px;
  background: rgba(79, 109, 245, 0.08);
  color: var(--color-primary);
  font-size: 12px;
  line-height: 1.6;
}

.graph-node-paragraph-list {
  display: grid;
  gap: 8px;
  margin-top: 10px;
}

.graph-node-paragraph {
  padding: 8px 10px;
  border-radius: 12px;
  background: #fff;
  border: 1px solid rgba(226, 232, 240, 0.9);
  cursor: pointer;
  transition: background 0.15s ease, border-color 0.15s ease;
}

.graph-node-paragraph:hover {
  background: rgba(248, 250, 252, 0.98);
  border-color: rgba(79, 109, 245, 0.22);
}

.graph-node-paragraph-index {
  font-size: 11px;
  font-weight: 700;
  color: var(--color-text-secondary);
}

.graph-node-paragraph-content {
  margin-top: 4px;
  font-size: 12px;
  line-height: 1.7;
  color: var(--color-text);
  white-space: pre-wrap;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.graph-stage {
  flex: 1;
  min-height: 0;
  padding: 12px 16px 16px;
}

.workspace-overlay {
  position: fixed;
  inset: 0;
  z-index: 80;
  background: rgba(15, 23, 42, 0.34);
  backdrop-filter: blur(10px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}

.workspace-card {
  width: min(920px, calc(100vw - 40px));
  max-height: calc(100vh - 48px);
  display: grid;
  gap: 18px;
  padding: 28px;
  border-radius: 22px;
  background: rgba(255, 255, 255, 0.99);
  border: 1px solid rgba(148, 163, 184, 0.22);
  box-shadow: 0 24px 60px rgba(15, 23, 42, 0.18);
  overflow: auto;
}

.workspace-card-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.workspace-title {
  font-size: 24px;
  line-height: 1.2;
  font-weight: 700;
}

.workspace-subtitle {
  margin-top: 6px;
  font-size: 13px;
  line-height: 1.7;
  color: var(--color-text-secondary);
}

.workspace-close {
  padding: 8px 12px;
  border-radius: 12px;
  background: rgba(241, 245, 249, 0.94);
  color: var(--color-text-secondary);
  font-size: 12px;
  font-weight: 600;
}

.graph-paragraph-preview {
  width: min(760px, calc(100vw - 40px));
}

.graph-paragraph-preview-content {
  font-size: 14px;
  line-height: 1.85;
  color: var(--color-text);
  white-space: pre-wrap;
}

@media (max-width: 1360px) {
  .graph-view {
    grid-template-columns: clamp(216px, 20vw, 260px) 220px minmax(0, 1fr) minmax(300px, 0.9fr);
  }
}

@media (max-width: 1120px) {
  .graph-view {
    grid-template-columns: 260px minmax(0, 1fr);
  }

  .workspace-nav-shell,
  .graph-stage-shell {
    display: none;
  }
}
</style>
