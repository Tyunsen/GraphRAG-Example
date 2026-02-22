import { createRouter, createWebHashHistory } from 'vue-router'
import GraphView from '@/views/GraphView.vue'
import SettingsView from '@/views/SettingsView.vue'

const routes = [
  { path: '/', name: 'graph', component: GraphView },
  { path: '/settings', name: 'settings', component: SettingsView }
]

const router = createRouter({
  history: createWebHashHistory(),
  routes
})

export default router
