# weimo-ui-markdown

> 小而稳的 React 内容组件:把一份 WDF 文档渲染出来,或者让人舒服地编辑一段格式干净的内容。

[![演示页](https://img.shields.io/badge/%E6%BC%94%E7%A4%BA%E9%A1%B5-GitHub_Pages-2ea44f?style=flat-square)](https://jiaowenjun.github.io/weimo-ui-markdown/)
[![License: MIT](https://img.shields.io/badge/License-MIT-3a9bd6?style=flat-square)](./LICENSE)
[![React 19](https://img.shields.io/badge/React-19-61dafb?style=flat-square)](https://react.dev)

**[👉 在线演示与组件文档](https://jiaowenjun.github.io/weimo-ui-markdown/)** — 渲染效果、编辑器交互、样式 token 一览,点开即看。

## 它解决什么问题

很多场景并不需要一个全功能编辑器:个人简介、商品描述、一条评论、一段公告……你需要的只是「把结构化内容显示出来」和「让用户写点格式受限的文字」,而不是图片上传、表格、数学公式和一整套工具栏。

weimo-ui-markdown 只做这两件事,并把它们做好:

- **WdfRender** — WDF 文档对象进,直接生成排版舒适的 React 内容;
- **RichEditor** — 格式受限的富文本编辑器,产出结构规整的 JSON 文档。

## 为什么选它

- 🎯 **聚焦常用结构** — 渲染器覆盖段落、标题、加粗、引用、列表等日常结构;编辑器同样只开放段落、一级标题、加粗、引用和无序列表,用户写出来的内容天然规整。
- 🔒 **安全默认** — 内容以结构化 JSON 进出,不解析原始 HTML,渲染用户输入的内容不用提心吊胆。
- 🌗 **明暗双主题** — 一份 token CSS 同时覆盖亮色与 `.dark` 暗色;颜色、字号、间距全部是 CSS 变量,覆盖变量即可定制,不用重写组件样式。
- 📦 **开箱即用** — 组件自动加载自身结构样式,提供 ESM 产物与完整的 TypeScript 类型,显式子路径导出,按需引入。
- 🪶 **轻心智** — 没有工具栏、没有插件系统、没有 Markdown 字符串的双向转换,接入成本低,行为可预期。

## 安装

```bash
pnpm add weimo-ui-markdown weimo-ui-core react react-dom
```

需要 React 19。`weimo-ui-markdown@0.2.x` 与 `weimo-ui-core@0.1.x` 搭配使用,应用里保留一份兼容的 core 即可。

然后在应用入口引入唯一必需的样式:

```ts
import 'weimo-ui-markdown/styles/tokens.css'
```

它会顺带引入 `weimo-ui-core` 的基础 token,并定义 `--md-*` 系列 Markdown 变量;给根元素挂上 `.dark` 类即可切换暗色主题。

## 三十秒上手

### 渲染一份 WDF 文档

```tsx
import { WdfRender } from 'weimo-ui-markdown/components/wdf-render'

export function Profile() {
  return (
    <WdfRender
      content={{
        schema: 'weimo.document',
        version: 1,
        root: {
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: '一段 WDF 正文' }],
            },
          ],
        },
      }}
    />
  )
}
```

`WdfRender` 按 WDF v0.1 结构直接生成 React 节点,不经过 Markdown 或 HTML 中转;
排版使用 `--md-*` token 和内容样式,覆盖变量即可定制。

### 编辑一段内容

```tsx
import { RichEditor } from 'weimo-ui-markdown/components/rich-editor'

export function DescriptionEditor() {
  return (
    <RichEditor
      placeholder="写点什么……"
      onChange={(content) => console.log(content)}
      onSave={(content) => console.log(content)} // ⌘S / Ctrl+S 触发
    />
  )
}
```

编辑器以 Tiptap JSON 文档作为输入输出,支持受控 `value` 与非受控 `defaultValue` 两种用法,高度随内容自适应增长;通过 ref 还可以调用 `focus`、`clear`、`getContent`、`toggleBold` 等方法。更多交互见[演示页](https://jiaowenjun.github.io/weimo-ui-markdown/)。

## 组件一览

| 组件 | 导出入口 | 输入 → 输出 | 适合的场景 |
| --- | --- | --- | --- |
| `WdfRender` | `weimo-ui-markdown/components/wdf-render` | WDF 文档 → React 节点 | 直接展示规范化的 WDF 内容 |
| `RichEditor` | `weimo-ui-markdown/components/rich-editor` | Tiptap JSON → Tiptap JSON | 编辑描述、备注等格式受限的文本 |

## 刻意不做的

边界清晰是这个包的一部分:

- 渲染器不引入表格、任务列表和数学公式等扩展结构;
- 编辑器不支持图片、表格、数学公式,也没有内置工具栏;
- 编辑器不解析或序列化 Markdown 字符串,避免格式来回转换造成的内容丢失。

如果你的场景确实需要这些能力,建议直接选用全功能方案——把简单场景留给我们。

## 链接

- [在线演示与组件文档](https://jiaowenjun.github.io/weimo-ui-markdown/)
- [问题反馈](https://github.com/jiaowenjun/weimo-ui-markdown/issues)
- 设计 token 与基础组件来自 [weimo-ui-core](https://github.com/jiaowenjun/weimo-ui-core)

## 许可证

[MIT](./LICENSE)
