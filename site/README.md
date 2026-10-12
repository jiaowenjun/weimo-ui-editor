# weimo-ui-editor site

`site` 是 `weimo-ui-editor` 的文档与交互预览应用。它通过组件包公开入口展示 WDF 渲染器和编辑器，并复用 `weimo-ui-template` 提供的导航、主题切换、响应式壳层和预览卡片；站点本身不拥有可复用组件。

## 开发

从仓库根目录运行：

```bash
pnpm site:dev
pnpm site:build
pnpm site:preview
```

本地开发地址为 `http://localhost:4178/weimo-ui-editor/`。
