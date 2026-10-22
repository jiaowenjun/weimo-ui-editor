# iOS Safari 状态栏白带问题修复记录(卡片式编辑 rich-editor-card)

- **日期**: 2026-10-21
- **影响范围**: site 演示页「卡片式编辑」(`rich-editor-card`)与「卡片式编辑(无阴影/遮罩)」;仅 iOS Safari 真机
- **最终状态**: 白带已真机修复;G5 隐形窗口已压至约 1 帧(fix-v2),待真机复验闪烁消除且白带不回归

## TL;DR

**根因**: iOS Safari 中,top layer 元素(Popover API 或原生 `<dialog>`)关闭后,若元素仍以**可见状态**留在渲染树中(author 样式覆盖了 UA 对 `[popover]:not(:popover-open)` / `dialog:not([open])` 的 `display:none`),状态栏安全区的着色**不会重新采样**,停留在退出 top layer 时刻的白色;只有元素经历一次**不可见状态**(`display:none` 或 `visibility:hidden`)的绘制,才会触发重采样恢复磨砂。

**修复**(三项,均在 `site/src/docs/catalog/packages/weimo-ui-editor/rich-editor-card.tsx`):

1. popover 属性常驻:`hideFromTopLayer` 不再 `removeAttribute`,只切换 `:popover-open`
2. 滚动恢复:手势聚焦加 `preventScroll`,展开保存 `scrollY`、收起恢复(兼修卡片上漂)
3. 收起清理末尾短暂 `visibility: hidden`(双 rAF 恢复 + `setTimeout(64)` 兜底,隐形约 1 帧)

---

## 1. 问题现象

iOS Safari 真机上,卡片式编辑页的卡片展开为对话框、再收起回卡片后:

- 系统状态栏区域出现**白色条带**且持续不恢复;正常应为透明磨砂,透出页面 `html` 深色背景
- 展开期间(top layer 打开时)状态栏也会脱掉磨砂、直透页面背景——后确认为**基线行为**,非 bug
- 真正的 bug 是「**关闭后未恢复**」

环境要点:页面无 `viewport-fit=cover`、无 `theme-color`,`html` 背景承担状态栏区域着色。

## 2. 排查过程

### 2.1 方法论演进

| 阶段 | 方法 | 结果 |
|---|---|---|
| 第一阶段 | **单机制隔离复刻**(隔离页,逐字复刻卡片各机制的时序做单变量实验) | 复刻全部「可恢复」,无法复现真卡片 → 失效 |
| 第二阶段 | **减法排查**(真实卡片 + omit 开关逐项移除功能) | 备用手段,未成为主战场 |
| 第三阶段 | **渐进式构建**(从已证可恢复的复刻基线出发,11 步累积叠加真实卡片功能) | 步骤 0 即复现 → 与复刻实验的差异被压缩到 2 个,一轮判别定位根因 |

关键转折:复刻实验全部「可恢复」而真卡片必失败,说明**复刻不够忠实**;渐进式构建从已知好状态出发逼近真卡片,差异收敛后一轮定位。

### 2.2 实验时间线(全部真机判定)

| 轮次 | 实验 | 结论 |
|---|---|---|
| 0 | 无阴影/遮罩对照页;展开不聚焦对照页(`focusOnOpen`) | 阴影/遮罩、软键盘**排除**(当时前提) |
| 0 | 弹出式编辑页对照(portal + fixed + z-index,**不进 top layer**) | 关闭后保持透明 → 差异锁定在卡片独有机制 |
| 1 | 隔离页 A/B/C/D:A1 `hidePopover`+同步 `removeAttribute` 复现;A2 保留属性恢复;B 滚动锁、C 批量 inert、D FLIP 几何均无罪 | **误判定罪 removeAttribute**(实为表象,见 §3);A3 原生 dialog 因关闭按钮在模态外无法关闭(页面 bug,后续修复) |
| 1.5 | 第一版修复(属性常驻)上真机 | 仍白带 + 发现新问题:卡片收起后**上漂**;同时澄清 A2 真实行为是「开=白带、关=恢复」→ 基线重定义 |
| 2 | E 系列(关闭路径变体:同步/延迟清理、双元素、滚动锁组合、滚动扰动)、F 系列(E1 基线 + inert/FLIP 过渡/内部滚动容器/可见遮罩孪生/contenteditable 聚焦) | **全部可恢复** → 复刻路线失效 |
| 2.5 | 上漂定位:桌面 WebKit 实测无漂移(computed margin/inset 全 0,排除 UA 样式嫌疑) | 上漂 = iOS 聚焦滚动不回位 → `preventScroll` + `scrollY` 恢复修复 |
| 3 | 渐进页步骤 0 复现,而 F 行全部恢复 → 仅剩两个差异。G 系列:G1(延后关闭+关闭后 `display:none`)恢复;G2(手势内同步关闭+关闭后常显)**失败**;G3(叠加)失败 | **根因 = 关闭后元素是否仍可见**;关闭时机(手势 vs 定时器)无关 |
| 4 | 修复路径:G4(`display:none` 100ms)可恢复但有重排;G5(`visibility:hidden` 100ms)可恢复且保留布局盒;G6(滚动扰动 ±4px)无效 | 选 **G5** |
| 5 | 渐进式构建 11 步(基线→真实 RichEditor→FLIP→槽位钉高→inert→可见遮罩→收起滚动归零→flushSync→vv 跟随→modal→完整 chrome)逐级真机验证 | **全部通过** → 修复与完整功能兼容 |
| 6 | 三项修复移植回真实卡片 | **白带真机修复**;但 100ms 隐形期被感知为落位闪烁 |
| 7 | G5 窗口压至约 1 帧(双 rAF + 64ms 兜底,实测隐形 ~20ms) | fix-v2,待真机复验 |

### 2.3 排查中的坑(工程教训)

- **SPA 真机测试必须整页刷新**:SPA 内部导航不重新加载模块,极易测到旧代码。后期所有诊断页都带构建标记(iso-v6 / sub-v1 / step-v3 / fix-v2),看不到标记即未刷新。
- **桌面 WebKit(IAB)≠ iOS Safari**:同内核但滚动行为、状态栏、rAF 调度均有差异;桌面只能验证 DOM/样式/时序,状态栏着色只能真机。IAB 中程序化滚动(`scrollTo`/`scrollTop`)完全无效、rAF 常挂起,自动化验证需 `setTimeout` 兜底。
- **全屏浮层会盖住行内按钮**:实验页的关闭按钮必须放在浮层内部(真机踩坑两次:A3 模态 inert 外部按钮、E1/E2 全覆盖矩形遮挡)。
- **iOS `body overflow:hidden` 锁不住聚焦滚动**:聚焦会滚穿锁,收起后不回位。

## 3. 根因分析

### 3.1 统一理论

**top layer 元素关闭后,元素若在后续绘制中仍可见 → 状态栏着色不恢复(停留白色);元素经历一次不可见绘制(`display:none` 或 `visibility:hidden`)→ 恢复。**

该理论统一解释了全部实验:

| 实验 | 关闭后元素状态 | 结果 |
|---|---|---|
| A1(`removeAttribute`) | 回到普通流,**可见** | 白带 |
| A2 / E1-E5 / F1-F5 / G1 | UA `display:none` 或实验安排的隐藏 | 恢复 |
| G2 / G3 / 真卡片 / 渐进页步骤 0 | author `display` 覆盖 UA 隐藏,**可见** | 白带 |
| A3 原生 `<dialog>` | 其 css 有 author `display:flex`,关闭后**可见** | 残留遮罩色(同机理的变体表现) |
| G4 / G5 | 关闭后短暂不可见 | 恢复 |
| G6 滚动扰动 | 仍可见 | 白带 |

早期对 A1 的定罪(`removeAttribute` 同步时序问题)是表象:`removeAttribute` 的实际效果是让无 author display 的元素回到可见的普通流。G 系列把「关闭时机」与「关闭后可见性」拆开后,后者才是唯一决定因素。

### 3.2 机理推测(未证实到 WebKit 源码级)

Safari 以页面可见内容采样状态栏区域着色;top layer 打开期间采样退化为默认白;退出 top layer 后,需要一次「该元素不可见」的绘制才会触发重新评估。滚动(G6)不触发,说明不是普通的重绘/视口事件能唤醒的路径。

## 4. 修复方案

三项修复,位置 `site/src/docs/catalog/packages/weimo-ui-editor/rich-editor-card.tsx`(渐进页 `rich-editor-card-stepwise.tsx` 与诊断副本 `rich-editor-card-diagnostic.tsx` 同步):

1. **popover 属性常驻**:`hideFromTopLayer` 只调 `hidePopover()`,属性设置后常驻,只切换 `:popover-open`。关闭态下 UA 对 `[popover]:not(:popover-open)` 的 `display:none` 会被 `.rec-card { display:flex }` 覆盖,卡片照常显示(author origin 优先于 UA origin,逐属性级联)。
2. **滚动恢复**:`focusEditorDomInGesture` 聚焦加 `{ preventScroll: true }`(对话框是 fixed 定位,无需滚进视口);展开时保存 `window.scrollY`,收起清理时若变化则 `scrollTo` 恢复。
3. **G5 可见性窗口**:收起清理末尾(顺序固定:`hidePopover` → 清 inline 样式 → 解锁/去 inert → 滚动恢复 → 本项):

   ```ts
   shell.style.visibility = 'hidden'
   const restoreVisibility = () => {
     if (shellRef.current === shell) shell.style.visibility = ''
   }
   window.requestAnimationFrame(() => {
     window.requestAnimationFrame(restoreVisibility)
   })
   window.setTimeout(restoreVisibility, 64) // 兜底 rAF 挂起的环境
   ```

   隐形窗口约 1 个绘制帧(~16-20ms),布局盒保留(无重排);双 rAF 保证至少一帧以不可见状态绘制,`setTimeout(64)` 兜底恢复(rAF 可能被挂起)。

### 4.1 已知取舍

- **白带 vs 闪烁此消彼长**:G5 窗口越长越保险(100ms 是实验验证值),但隐形期越可感知。当前取 ~1 帧;若真机复验白带回归,依次放宽 50ms → 100ms。
- 修复仅针对 iOS Safari 的 top layer 行为,对其他浏览器无副作用(visibility 一帧不可见,`setTimeout` 恢复幂等)。

## 5. 修复验证

- 渐进页 11 步(完整卡片功能 + 三项修复)真机逐级验证全部通过
- 三项修复移植回真实卡片后,真机复验:**白带修复**(100ms 版)
- 短窗口版(fix-v2,~1 帧):IAB 实测隐藏 ~20ms 后恢复、样式/属性常驻/清理全部正确;真机复验进行中

## 6. 遗留事项

- [ ] fix-v2 真机复验:闪烁是否不可感知、白带是否保持修复;失败则按 §4.1 放宽窗口
- [ ] 确认稳定后清理诊断设施:`fix-v2` 标记(`rich-editor-card.tsx` demo 与对应 CSS)、三个诊断页(隔离 iso-v6 / 减法 sub-v1 / 渐进 step-v3)及其 manifest/definitions 注册(建议至少保留渐进页作回归页)
- [ ] 回归验证入口:渐进页(`.../components/rich-editor-card-stepwise`)11 步走一遍,或直接开合「卡片式编辑」页数次观察状态栏

## 7. 相关提交

| 提交 | 内容 |
|---|---|
| `dd424e0` | 无阴影对照页展开不聚焦(键盘排除) |
| `1e55d16` | 机制隔离诊断页 |
| `1e6eecb` | 第一版修复:属性常驻(后被证明不充分,先误判后修正) |
| `df320c9` | 隔离页 E/F 系列 |
| `f807a2e` | 两主页回退原始行为,诊断改动收敛到副本 |
| `ae59c42` | 减法排查页 + 诊断副本 |
| `9277817` | 渐进式构建页(基线含三项修复雏形) |
| `14f763c` | G 系列:根因统一 + 修复路径判定 |
| `04371db` | 三项修复移植回真实卡片,G5 压至约 1 帧 |
| `694bb26` | 渐进页 G5 窗口同步 |
