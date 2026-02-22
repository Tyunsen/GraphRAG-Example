# ZSTP - 知识图谱系统

基于 Vue 3 + Express 的知识图谱构建与可视化平台，支持多格式文件导入、D3 力导向图可视化、RAG 智能问答。

## 功能特性

- **多格式文件导入**：支持 JSON、CSV、TXT、Markdown、PDF 文件的拖拽导入，自动解析并提取实体与关系
- **LLM 智能提取**：可对接 OpenAI 兼容 API，利用大语言模型从非结构化文本中抽取知识三元组
- **D3 图谱可视化**：提供力导向、环形、网格、同心圆等多种布局，支持缩放、拖拽、节点高亮
- **RAG 智能问答**：基于图谱结构与导入文档的检索增强生成（RAG）对话，结合 BFS 子图与关键词检索构建上下文
- **图谱管理**：支持多图谱的创建、切换、重命名、删除，数据持久化存储于 SQLite
- **导入历史**：记录每次导入的文件信息，支持按次撤销导入

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端框架 | Vue 3 + Vite |
| 状态管理 | Pinia |
| 路由 | Vue Router (Hash 模式) |
| 图谱渲染 | D3.js |
| 文件解析 | PapaParse (CSV)、PDF.js (PDF) |
| 后端框架 | Express |
| 数据库 | SQL.js (SQLite) |

## 项目结构

```
zstp/
├── src/                      # 前端源码
│   ├── components/
│   │   ├── graph/            # 图谱画布、控件、图例、提示框
│   │   ├── import/           # 文件导入、预览、图谱列表、导入历史
│   │   ├── layout/           # 顶栏、侧边栏
│   │   └── rag/              # RAG 对话面板、消息组件、上下文查看
│   ├── composables/          # 组合式函数 (D3 图谱、文件解析、RAG 查询)
│   ├── router/               # 路由配置
│   ├── services/             # API 客户端、LLM 服务、解析器、检索器
│   ├── stores/               # Pinia 状态 (图谱、RAG、设置)
│   ├── utils/                # 工具函数
│   └── views/                # 页面视图 (图谱页、设置页)
├── server/                   # 后端源码
│   ├── routes/               # API 路由 (graphs、messages、files)
│   ├── data/                 # SQLite 数据库文件
│   ├── db.js                 # 数据库初始化与操作
│   └── index.js              # Express 入口
├── package.json
└── vite.config.js
```

## 快速启动

### 环境要求

- [Node.js](https://nodejs.org/) >= 18

### 安装依赖

```bash
npm install
```

### 启动开发服务

**同时启动前后端（推荐）：**

```bash
npm run dev:all
```

**分别启动：**

```bash
# 终端 1 - 启动后端 (端口 3001)
npm run dev:server

# 终端 2 - 启动前端 (端口 5173)
npm run dev
```

启动后访问 [http://localhost:5173](http://localhost:5173) 即可使用。

### 生产构建

```bash
npm run build
npm run preview
```

## API 端点

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/health` | 健康检查 |
| GET/POST/PUT/DELETE | `/api/graphs/*` | 图谱 CRUD |
| GET/POST/DELETE | `/api/messages/*` | 聊天消息管理 |
| GET/POST | `/api/files/*` | 文件内容存储与关键词搜索 |

## 配置说明

进入应用的**设置**页面可配置：

- **API 端点**：OpenAI 兼容的 LLM 服务地址
- **API Key**：接口密钥
- **模型选择**：使用的模型名称
- **生成参数**：温度 (temperature)、最大 token 数
- **图谱参数**：BFS 搜索深度与子图大小上限
- **提取提示词**：自定义知识三元组提取的 system prompt

配置保存在浏览器 `localStorage` 中，图谱数据持久化于 `server/data/zstp.db`。
