# 火山引擎播客生成工具

基于 Tauri + React 开发的桌面应用程序，集成火山引擎播客 TTS API，可将文本内容转换为多人对话的播客音频。

## ✨ 主要特性

- 🎙️ **智能播客生成**：将文本转换为自然的多人对话播客
- 🎵 **多种音频格式**：支持 MP3、OGG、PCM、AAC 等格式
- 👥 **多说话人支持**：可配置不同的说话人角色和对话内容
- 🎚️ **灵活配置选项**：语速调节、背景音乐、文本提取等
- 📊 **实时进度监控**：显示生成进度和详细状态信息
- 🎧 **内置播放器**：可直接预览和下载生成的播客
- 💻 **跨平台支持**：基于 Tauri 的原生桌面应用

## 🚀 快速开始

### 环境要求

- Node.js 18+
- Rust 1.75+
- 火山引擎账号和 API 密钥

### 安装依赖

```bash
npm install
```

### 开发模式

```bash
npm run tauri dev
```

### 生产构建

```bash
npm run tauri build
```

## 📖 使用说明

详细使用说明请参考 [USAGE.md](./USAGE.md)

### 基本使用流程

1. **配置 API 密钥**：在火山引擎控制台获取 App ID 和 Access Key
2. **输入内容**：支持文本输入、URL 提取或手动配置对话列表
3. **调整设置**：选择音频格式、语速、背景音乐等选项
4. **生成播客**：点击生成按钮，实时监控进度
5. **使用结果**：预览播客、下载音频文件或查看文本内容

## 🛠️ 技术栈

### 前端技术
- **React 19.1.0** - 用户界面框架
- **TypeScript** - 类型安全的JavaScript
- **Tailwind CSS v4** - 实用优先的CSS框架
- **Vite 7.x** - 现代前端构建工具

### 桌面技术
- **Tauri 2.x** - 现代桌面应用框架
- **Rust** - 高性能后端语言
- **WebSocket** - 实时通信协议

### 核心模块
- **协议处理**：实现火山引擎 WebSocket 协议栈
- **播客生成器**：管理音频生成流程和文件处理
- **用户界面**：响应式设计，支持实时状态更新

## 📁 项目结构

```
broadcast-tauri/
├── src/                    # React 前端源码
│   ├── App.tsx            # 主界面组件
│   ├── protocols.ts       # 协议处理模块
│   ├── podcastGenerator.ts # 播客生成核心
│   └── App.css           # 样式文件
├── src-tauri/             # Tauri 后端
│   ├── tauri.conf.json   # Tauri 配置
│   ├── Cargo.toml        # Rust 依赖
│   └── src/              # Rust 源码
├── public/                # 静态资源
└── bak/                   # 参考实现 (Node.js)
```

## 🔧 配置说明

### API 配置
- 在火山引擎控制台创建应用获取密钥
- 配置 WebSocket 端点和请求头信息

### 安全配置
- CSP 策略允许外部 WebSocket 连接
- 文件系统权限仅限于必要目录

## 🤝 贡献指南

1. Fork 项目
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 创建 Pull Request

## 📝 API 参考

- [火山引擎播客 API 文档](https://www.volcengine.com/docs/6561/1668014)
- [Tauri 官方文档](https://tauri.app/v1/guides/)
- [React 文档](https://react.dev/)

## 📄 许可证

本项目采用 MIT 许可证，详见 [LICENSE](LICENSE) 文件。

## 🙏 致谢

- [火山引擎](https://www.volcengine.com/) 提供的播客 TTS API
- [Tauri](https://tauri.app/) 跨平台桌面应用框架
- [React](https://react.dev/) 用户界面库
