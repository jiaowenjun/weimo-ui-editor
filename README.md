# weimo-ui-editor

> 小而稳的 React 内容组件:用一份 WDF 数据完成阅读、编辑和状态切换。

[![演示页](https://img.shields.io/badge/%E6%BC%94%E7%A4%BA%E9%A1%B5-GitHub_Pages-2ea44f?style=flat-square)](https://jiaowenjun.github.io/weimo-ui-editor/)
[![License: MIT](https://img.shields.io/badge/License-MIT-3a9bd6?style=flat-square)](./LICENSE)
[![React 19](https://img.shields.io/badge/React-19-61dafb?style=flat-square)](https://react.dev)

**[👉 在线演示与组件文档](https://jiaowenjun.github.io/weimo-ui-editor/)** — 渲染效果、编辑器交互、样式 token 一览,点开即看。

## 它解决什么问题

很多场景并不需要一个全功能编辑器:个人简介、商品描述、一条评论、一段公告……你需要的只是「把结构化内容显示出来」和「让用户写点格式受限的文字」,而不是图片上传、表格、数学公式和一整套工具栏。

weimo-ui-editor 把这三个必要部分组合起来:

- **WdfView** — 对外只读写 WDF,内部在阅读态使用 WdfRender,在编辑态使用 RichEditor;
- **WdfRender** — WDF 文档对象进,直接生成排版舒适的 React 内容;
- **RichEditor** — 格式受限的富文本编辑器,产出结构规整的 JSON 文档。

另提供实验组件 **NewMdfView**,以新的交互接口重做 WDF 阅读与编辑。
它支持保存等待和失败重试,提供两种过渡供实机对比。
[体验规格](./docs/new-mdf-view-design.md)只描述功能、动画和外观。

## 为什么选它

- 🎯 **聚焦 WDF v0.1** — 段落、1–6 级标题、加粗、引用和有序/无序列表在阅读与编辑两侧保持一致。
- 🔒 **安全默认** — 内容以结构化 JSON 进出,不解析原始 HTML,渲染用户输入的内容不用提心吊胆。
- 🌗 **明暗双主题** — 一份 token CSS 同时覆盖亮色与 `.dark` 暗色;颜色、字号、间距全部是 CSS 变量,覆盖变量即可定制,不用重写组件样式。
- 📦 **开箱即用** — 组件自动加载自身结构样式,提供 ESM 产物与完整的 TypeScript 类型,显式子路径导出,按需引入。
- 🪶 **轻心智** — 没有工具栏、没有插件系统、没有 Markdown 字符串的双向转换,接入成本低,行为可预期。

## 安装

```bash
pnpm add weimo-ui-editor weimo-wdf weimo-ui-core react react-dom
```

需要 React 19。`weimo-ui-editor@0.2.x` 与 `weimo-wdf@0.1.x`、`weimo-ui-core@0.1.x`
搭配使用,应用里分别保留一份兼容的 WDF 模型和 core 即可。

然后在应用入口引入唯一必需的样式:

```ts
import 'weimo-ui-editor/styles/tokens.css'
```

它会顺带引入 `weimo-ui-core` 的基础 token,并定义 `--md-*` 系列 Markdown 变量;给根元素挂上 `.dark` 类即可切换暗色主题。

## 三十秒上手

### 用一份 WDF 在阅读与编辑间切换

```tsx
import { useState } from 'react'
import {
  WdfView,
  type WdfDocument,
  type WdfViewMode,
} from 'weimo-ui-editor/components/wdf-view'

export function Description() {
  const [mode, setMode] = useState<WdfViewMode>('view')
  const [content, setContent] = useState<WdfDocument>({
    schema: 'weimo.document',
    version: 1,
    root: {
      type: 'doc',
      content: [{ type: 'paragraph', content: [] }],
    },
  })

  return (
    <>
      <button onClick={() => setMode(mode === 'view' ? 'edit' : 'view')}>
        {mode === 'view' ? '编辑' : '完成'}
      </button>
      <WdfView mode={mode} value={content} onChange={setContent} />
    </>
  )
}
```

`WdfView` 只维护 WDF:阅读态直接交给 `WdfRender`,进入编辑态时通过
`weimo-wdf` 的 `toTiptap` 创建一份会话草稿。输入期间草稿留在 `RichEditor`
内部;当 `mode` 从 `edit` 切回 `view` 时,组件才用 `fromTiptap` 转回规范化
WDF 并调用一次 `onChange`。`mode` 由业务层控制;你也可以用 `defaultValue`
让组件自己保存提交后的内容。

内联编辑退出时,工具栏图标先淡出,卡片与工具栏再同步收高。
卡片始终留在文档流内;系统开启减少动态效果时立即收起。
若下方还有内容需要同步上移,将它们放入一个紧邻 `WdfView`、处于同一
纵向文档流的容器,并传入 `inlineExitFollowRef`。例如:

```tsx
import { useRef } from 'react'
import { WdfView, type WdfDocument } from 'weimo-ui-editor/components/wdf-view'

export function EditableCard({ content }: { content: WdfDocument }) {
  const followingRef = useRef<HTMLDivElement>(null)

  return (
    <div>
      <WdfView
        defaultValue={content}
        editStyle="inline"
        inlineExitFollowRef={followingRef}
      />
      <div ref={followingRef} style={{ display: 'flow-root' }}>
        <p>这部分内容会跟随卡片平滑上移。</p>
      </div>
    </div>
  )
}
```

只有指定容器会参与跟随动画,未指定容器时下方内容在动画结束后更新位置。

### 渲染一份 WDF 文档

```tsx
import { WdfRender } from 'weimo-ui-editor/components/wdf-render'

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
import { RichEditor } from 'weimo-ui-editor/components/rich-editor'

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

编辑器以 Tiptap JSON 文档作为输入输出,支持受控 `value` 与非受控 `defaultValue` 两种用法,高度随内容自适应增长;通过 ref 还可以调用 `focus`、`clear`、`getContent`、`toggleBold` 等方法。更多交互见[演示页](https://jiaowenjun.github.io/weimo-ui-editor/)。

## 组件一览

| 组件 | 导出入口 | 输入 → 输出 | 适合的场景 |
| --- | --- | --- | --- |
| `WdfView` | `weimo-ui-editor/components/wdf-view` | WDF 文档 ↔ WDF 文档 | 同一份内容的阅读/编辑切换 |
| `NewMdfView` | `weimo-ui-editor/components/new-mdf-view` | WDF 文档 ↔ WDF 文档 | 新版阅读/编辑与两种动画方案对比,实验阶段 |
| `WdfRender` | `weimo-ui-editor/components/wdf-render` | WDF 文档 → React 节点 | 直接展示规范化的 WDF 内容 |
| `RichEditor` | `weimo-ui-editor/components/rich-editor` | Tiptap JSON → Tiptap JSON | 编辑描述、备注等格式受限的文本 |

### NewMdfView 实验接口

```tsx
import { NewMdfView } from 'weimo-ui-editor/components/new-mdf-view'

<NewMdfView
  defaultDocument={content}
  heading="内容"
  presentation="auto"
  motion="flow"
  onCommit={async (document) => { await saveDocument(document) }}
  following={<p>需要跟随卡片移动的后续内容。</p>}
/>
```

`document` 是受控的已保存内容,`defaultDocument` 用于非受控场景。
`onCommit` 仅在保存时调用;返回的 Promise 完成后退出,失败则显示错误并保留草稿。
等待保存时暂时禁止输入和重复操作。取消不调用 `onCommit`。
编辑中的外部内容更新不会覆盖草稿,取消时回到最新外部内容。

`presentation` 可选 `auto`、`inline`、`dialog`;`auto` 在宽度不超过
640px 时使用面板编辑。`motion="flow"` 连续改变真实布局;
`motion="snapshot"` 使用浏览器转场,不支持时回退 `flow`。
两种方式都遵守系统减少动态效果设置。`following` 接收需要同步跟随的普通内容。
两方案比较的是原位切换;面板编辑共用一套原生面板动画。方案 A 不依赖
`following` 也会自然推动后续布局;方案 B 需要将希望连续移动的后续内容放入
`following`,其他页面内容由浏览器默认转场处理。
通过 ref 的 `edit()`、`save()`、`cancel()` 也可以从外部操作。
进入编辑不会自动聚焦正文或唤起软件键盘;点击正文或使用键盘导航后开始输入。
窄屏面板顶部对齐,键盘出现时调整可用高度,不反复上下居中。

对比页位于 `/components/new-mdf-view`,支持普通内容、长文、空内容、
原位/面板编辑和保存等待/失败。最终方案尚待实机选择。

## 刻意不做的

边界清晰是这个包的一部分:

- 渲染器不引入表格、任务列表和数学公式等扩展结构;
- 编辑器不支持图片、表格、数学公式,也没有内置工具栏;
- 编辑器不解析或序列化 Markdown 字符串,避免格式来回转换造成的内容丢失。

如果你的场景确实需要这些能力,建议直接选用全功能方案——把简单场景留给我们。

## 链接

- [在线演示与组件文档](https://jiaowenjun.github.io/weimo-ui-editor/)
- [问题反馈](https://github.com/jiaowenjun/weimo-ui-editor/issues)
- 设计 token 与基础组件来自 [weimo-ui-core](https://github.com/jiaowenjun/weimo-ui-core)

## 许可证

[MIT](./LICENSE)
