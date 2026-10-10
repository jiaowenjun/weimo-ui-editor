# weimo-ui-markdown

`weimo-ui-markdown` 是独立的 Markdown 组件包，拥有 Markdown 渲染、Tiptap 编辑、数学公式和查看/编辑模式编排。它唯一的 `weimo-ui` 依赖是 `weimo-ui-core`。

`weimo-ui-core` 通过 `git@github.com:jiaowenjun/weimo-ui-core.git` 获取。包通过显式子路径导出组件和样式；包根不提供 `.` 导出。

## 组件入口

| 入口 | 导出 | 职责 |
| --- | --- | --- |
| `components/md-render` | `MdRender` | 安全的只读 Markdown 渲染 |
| `components/md-editor` | `MdEditor` | Tiptap 编辑器及公开编辑器类型 |
| `components/md-view` | `MdView` | 查看/编辑切换、延迟加载和布局保护 |
| `components/math-editor` | `MathEditor` | 数学公式编辑弹层 |
| `components/deferred-md-editor-toolbar` | 延迟工具栏 | 编辑器工具栏的异步加载边界 |

样式入口包括 `styles/tokens.css`、`styles/markdown-content.css`、`styles/md-editor.css` 和 `styles/md-view.css`。完整清单以本包 `package.json#exports` 为准；包根不提供 `.` 导出。

## 使用

```tsx
import { MdEditor } from 'weimo-ui-markdown/components/md-editor'
import { MdRender } from 'weimo-ui-markdown/components/md-render'
import { MdView } from 'weimo-ui-markdown/components/md-view'
```

应用入口加载 Markdown token。该入口会同时加载 core token：

```ts
import 'weimo-ui-markdown/styles/tokens.css'
```

组件会导入各自的结构样式，并以 TypeScript、TSX 与 CSS 源码交付。

## 依赖边界

- 只依赖 `weimo-ui-core` 的控件、材质和工具函数。
- `MdRender`、`MdEditor` 与 `MdView` 通过公开子路径协作，不依赖彼此的内部文件。
- 共享 Markdown 语义处理放在 `components/markdown/`，仅由本包组件使用。
- DOM 测量由拥有真实 DOM 的组件暴露稳定能力，父组件不能查询编辑器内部选择器。

## 源码结构

```text
src/
├── components/
│   ├── markdown/   # 渲染器与编辑器共享的纯 Markdown 语义处理
│   ├── md-render/  # 只读渲染
│   ├── md-editor/  # Tiptap 编辑器、扩展、工具栏和数学编辑
│   └── md-view/    # 模式编排、延迟加载与布局保护
└── styles/         # Markdown token 与共享内容样式
```

## 验证

```bash
pnpm install
pnpm test:typecheck
```

组件的公开入口和依赖边界以本仓库的 `package.json#exports` 为准。
