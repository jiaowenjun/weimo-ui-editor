# weimo-ui-markdown

`weimo-ui-markdown` 是一个收敛到简单场景的 Markdown 组件包，只提供简单渲染器和简单编辑器。它唯一的 `weimo-ui` 依赖是 `weimo-ui-core`。

包发布编译后的 ESM、类型声明和 CSS，并通过显式子路径导出组件和样式；包根不提供 `.` 导出。

## 安装

```bash
pnpm add weimo-ui-markdown weimo-ui-core react react-dom
```

`weimo-ui-markdown@0.1.x` 支持 `weimo-ui-core@0.1.x`；应用必须只安装一份兼容的 core。

## 组件入口

| 入口 | 导出 | 职责 |
| --- | --- | --- |
| `components/md-render-simple` | `MdRenderSimple` | 渲染简单 Markdown 内容 |
| `components/md-editor-simple` | `MdEditorSimple` | 编辑受限的 Tiptap JSON 文档 |

样式入口包括 `styles/tokens.css`、`styles/markdown-content.css` 和 `styles/md-editor-simple.css`。组件会自动导入自身结构样式；应用入口只需加载 Markdown token：

```ts
import 'weimo-ui-markdown/styles/tokens.css'
```

## 简单渲染

```tsx
import { MdRenderSimple } from 'weimo-ui-markdown/components/md-render-simple'

export function Preview() {
  return <MdRenderSimple content={'# 标题\n\n正文 **加粗**'} />
}
```

`MdRenderSimple` 面向基础 Markdown 展示，不启用完整编辑器对应的 GFM 表格、任务列表和数学公式扩展。链接会经过协议限制，原始 HTML 会经过白名单清理。

## 简单编辑

```tsx
import { useRef } from 'react'
import {
  MdEditorSimple,
  type MdEditorSimpleHandle,
} from 'weimo-ui-markdown/components/md-editor-simple'

export function Editor() {
  const editorRef = useRef<MdEditorSimpleHandle>(null)

  return (
    <MdEditorSimple
      ref={editorRef}
      placeholder="输入内容"
      onSave={(content) => console.log(content)}
    />
  )
}
```

`MdEditorSimple` 以 Tiptap `JSONContent` 作为输入和输出，只开放段落、一级标题、加粗、引用和无序列表。它不解析或序列化 Markdown 字符串，也不包含图片、表格、数学公式或内置工具栏。

## 依赖边界

- 只依赖 `weimo-ui-core` 的 token 和工具函数。
- `MdRenderSimple` 与 `MdEditorSimple` 彼此独立，不依赖已删除的全量组件。
- 共享 Markdown 语义处理放在 `components/markdown/`，仅供简单渲染器内部使用。

## 验证

```bash
pnpm install
pnpm verify
npm pack --dry-run
```

`verify` 会检查类型、测试、构建产物、公开入口和类型声明解析。
