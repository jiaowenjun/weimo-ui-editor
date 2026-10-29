# [Bug] 仅引入组件子路径时 `--md-*` token 全部未定义，引用块/列表等渲染静默退化为纯文本

> 留档溯源。报告针对 `weimo-ui-editor@0.4.1`（registry）；上游修复与防回归契约测试已落地,
> 随 0.4.1 之后的下一版本发布。修复记录见文末附录。

**包**: `weimo-ui-editor@0.4.1`（registry）
**消费环境**: React 19 + Vite 8 + `weimo-ui-core@0.2.2` + `weimo-wdf@0.1.0`
**严重度建议**: 高——默认消费路径即触发，且为无任何诊断信号的静默失败

## 一、问题表现

消费方只引入组件子路径（如 `weimo-ui-editor/components/wdf-card` 或 `components/wdf-render`）、未手动引入 `weimo-ui-editor/styles/tokens.css` 时：

1. **DOM 结构完全正确**：`blockquote.weimo-card-markdown__blockquote`、`ul.weimo-card-markdown__list--ul`、`h1~h6` 等元素与类名齐全，块映射无任何问题；
2. **组件 CSS 也已随包自动加载**：`markdown-content.css` 的规则确实出现在 `document.styleSheets` 中（可检索到 `weimo-card-markdown__blockquote` 选择器）；
3. **但所有引用 `--md-*` 自定义属性的声明在计算值阶段失效**，实测（暗色）：

| 属性 | 期望 | 实际 |
|---|---|---|
| `--md-quote-color` | `hsl(0 0% 64%)` | `''`（空串） |
| `--md-quote-pad-inline` | `20px` | `''` |
| `--md-list-indent` | `1.35em` | `''` |
| blockquote `padding-left` | `20px` | `0px` |
| blockquote `color` | `rgb(163,163,163)` | 继承正文色 |
| 列表 `padding-left` | `21.6px` | `0px` |

结果：引用块无边框无缩进、颜色不降级，列表无层级缩进，行内代码无边框圆角——**视觉上全部退化为普通段落**。暗色同样受影响（`--md-*` 的 `.dark` 覆盖也在 tokens.css 里）。

4. **零诊断信号**：无构建报错、无控制台警告、样式表确实在加载——这是最不友好的失败形态，消费方的常规冒烟（结构/交互断言）会全部通过，只有量计算样式或肉眼看像素才能发现。

## 二、问题根因

组件 CSS 的值引用约 15 个**包私有 token**（`--md-color`、`--md-font-size`、`--md-paragraph-color`、`--md-h1-*`、`--md-quote-color`、`--md-quote-pad-inline`、`--md-list-indent`、`--md-code-font-family/-size/-border-color/-border-radius`、`--md-selection-bg`），它们的唯一定义处在 `styles/tokens.css`，而：

- 组件 dist JS **自动加载**组件 CSS（`sideEffects: ["**/*.css"]` 契约），但**不加载** `tokens.css` ——形成"半自动契约"：样式自动来、样式的值要消费方手动搬；
- `--md-*` 并非跨包共享的主题 token（无其他包定义、常规消费方也不会去覆盖），本质是包的实现细节，却被外部化为一个必需但默认缺失的样式入口；
- CSS 层面的失败机制：自定义属性未定义 → 使用它的声明 *invalid at computed-value time* → 静默回退 initial 值，不产生任何错误。

**成因盲区**：包自带 site 在 `site/src/styles/global.css` 永远引入了 tokens.css，所以"只引组件"的路径从未被作者实际验证；现有契约测试（`wdf-card-contract.mjs`）与 `publint`/`attw` 均只覆盖导出完整性与行为契约，不覆盖"组件视觉自足性"。

## 三、复现方式（最小化）

1. 新建 Vite + React 19 项目：`pnpm add weimo-ui-editor weimo-wdf weimo-ui-core react react-dom`；
2. 入口**只**引入组件，不引 tokens：

```tsx
import { WdfCard } from 'weimo-ui-editor/components/wdf-card'

// 注意:不要 import 'weimo-ui-editor/styles/tokens.css'
```

3. 渲染一个含 `blockquote` / `bullet_list` 块的 WDF 文档；
4. 验证：

```js
const bq = document.querySelector('blockquote.weimo-card-markdown__blockquote')
getComputedStyle(bq).paddingLeft            // '0px' ← bug
getComputedStyle(document.documentElement)
  .getPropertyValue('--md-quote-color')     // '' ← bug
```

**对照实验**：入口补一行 `import 'weimo-ui-editor/styles/tokens.css'`，上述值立即恢复（`paddingLeft: '20px'`、`--md-quote-color: 'hsl(0 0% 28%)'`，暗色 `hsl(0 0% 64%)`）。

## 四、修复方案（按优先级三档）

1. **根治（推荐）**：`wdf-card.tsx` / `wdf-render.tsx` / `rich-editor.tsx` 补 `import 'weimo-ui-editor/styles/tokens.css'`。`:root` 定义幂等、重复引入无害；`sideEffects` 已含 css 直接生效；需要改主题的消费方在自己 CSS 中后置覆盖即可（级联天然支持），不损失可定制性。副作用评估：tokens.css 内部会再引 core tokens——core 本就是 peer 依赖、消费方必然已装，仅重复声明，无害。修复后组件子路径完全自足，消费零配置。
2. **防回归**：契约测试新增"打包自足性"检查——扫描 dist 全部 CSS 的 `var(--x)` 引用，断言每个 `x` 都能由本包（组件 CSS 自身或 tokens.css）或 peer（weimo-ui-core tokens）解析，否则 CI 红灯。本次 bug 即可在上游 CI 拦截，而非消费方像素层。
3. **可选**：`WdfRender` 内加 dev-only 探针（读任一 `--md-*` 计算值，为空则 `console.warn` 提示"检测到 --md-* 未定义，请确认引入 weimo-ui-editor/styles/tokens.css"）。做了方案 1 后此条非必需。

---

## 附录：上游修复记录（2026-10-29）

- **方案 1（根治）**：`wdf-render.tsx`、`wdf-card.tsx`、`rich-editor.tsx`、`card-composer.tsx` 四个入口均补
  `import 'weimo-ui-editor/styles/tokens.css'`（报告写三个；0.4.0 新增的 `card-composer` 入口经
  wdf-card 级联同样受影响，一并覆盖）。dist JS 以裸包名说明符引用，消费方经 exports 解析加载；
  tokens.css 首行 `@import "weimo-ui-core/styles/tokens.css"` 由消费方构建器解析内联（core 为 peer，幂等无害）。
- **方案 2（防回归）**：新增 `scripts/css-token-contract.mjs`（`pnpm test:css-tokens`，已接入 `verify` 链,
  位于 `check:package` 之后以读取新鲜 dist）。检查逻辑比"扫全部 dist CSS"更严：沿每个 `./components/*`
  入口的 dist JS 导入闭包（含无扩展名相对 JS 与包名自引用 CSS 说明符）收集**该入口实际可达**的 CSS,
  断言其中每个**无 fallback** 的 `var(--x)` 均可由可达 CSS 或 peer `weimo-ui-core` 的 dist CSS 解析;
  带 fallback 的引用（如 `--wdf-card-composer-gutter`）视为公开定制钩子放行。红→绿验证：修复前 dist
  报 45 条违例（4 入口 × 15 个 `--md-*`），与报告清单一致；修复后 `4 entries, 13 stylesheets, 565
  resolvable properties` 全绿。
- **方案 3（dev 探针）**：按报告结论不做——方案 1 落地后组件自足，探针无触发场景。
- **文档同步**：README「安装」节由"唯一必需的样式入口"改为"样式零配置"，并修正版本搭配行为
  0.4.x / wdf 0.1.x / core 0.2.x。
