# NewMobileWdfView 设计基线:时序契约与回归清单

> 状态:基于当前设计记录整理,供重构前冻结行为契约。
> 实施策略:新增 `NewMobileWdfView`,不修改、不替换、不重命名现有
> `MobileWdfView`。旧组件作为可运行的行为基线;新组件独立实现并行
> 验证。首阶段不改变既有交互语义、动画参数或 fix-v3 时序。
> 行号基准:ef20da2(src/components/mobile-wdf-view/mobile-wdf-view.tsx,
> 简称"旧组件";card-shell.ts 简称 shell 原语层)。

## 1. 重构边界

本轮不重构原有 `MobileWdfView`,而是新建 `NewMobileWdfView` 并存。旧
组件是行为参照与回归对照,不在本轮修改。新组件可复用已验证的叶子组件
(WdfRender/RichEditor)与 `card-shell.ts` 纯函数,但其生命周期编排、
组件状态与专属样式(`new-mobile-wdf-view` 前缀)有清晰边界。不以减少
DOM 层级为目标。

行为基线(对齐,不逐处复制内部实现):

- slot:top layer 提升期间保留文档流占位,兼 Ghost 宿主。
- CardShell:卡片 chrome、Popover、固定定位几何与 morph。
- 常驻 WdfRender:查看态撑高;会话态内容衬底。
- 会话期 RichEditor:异步就绪后显示,关闭后卸载。
- Header/Toolbar 的 DOM 顺序、class 语义、工具栏高度态与 `inert`。
- shell 原语层既有原语(不改动其语义)。
- iOS Safari fix-v3 关闭后不可见绘制与 Ghost 视觉交接。

## 2. 关闭流程时序契约

### 2.1 提交与收起飞行:目标高度依赖新文档

顺序不可变:

1. `commitDraft`:读 Tiptap 草稿 → `fromTiptap`;成功才提交。
2. 新文档更新到 WdfRender 衬底(非受控 `setInternalDoc` + `onChange`)。
3. 衬底新内容先完成 React/DOM 更新——现状由 `setTimeout(0)` 与 React
   MessageChannel 调度先后次序保证(旧组件 L566-569 注释),**这是防
   落位跳闪的时序契约,不是实现细节**(历史修复 7429551、14ba6c0)。
4. `runCloseAnimation` 以克隆探针测新文档目标高度。
5. 飞向新内容高度(动画期间页下方唯一一次位移,被飞行掩盖)。

抽离 Editor Session 与 Card Morph 时,须把「文档已提交且衬底可测量」
做成显式协作点(新组件中名为 `scheduleCloseFlightAfterBackingCommit`),
不得依赖两模块各自的内部异步时序。

### 2.2 settle-to-view 顺序不可变(fix-v3)

1. **先 `flushSync` 切 view 布局**(render 转 static、编辑层卸载、slot
   回内容高度)。
2. `hidePopover()` 退 top layer(popover 属性常驻)。
3. 清 shell 临时几何(`clearShellGeometry`)。
4. 释放 slot 钉高;解除滚动锁;还原 `inert`。
5. 恢复打开前 `scrollY`(仅确有偏移时)。
6. 最终布局位创建 Ghost 深克隆挂 slot。
7. 真实 shell `visibility: hidden` 一次不可见绘制。
8. 双 rAF 恢复 + `setTimeout(64)` 兜底;恢复函数幂等,旧会话回调不得
   影响新会话(phaseRef 守卫)。

禁止:hidePopover 先于 flushSync;Ghost 先于布局恢复;Ghost/visibility
清理先于收起飞行动画完成。

### 2.3 提交失败与取消

- 转换失败:不提交、不开始收起飞行;保留会话与草稿,提示/上报错误
  (用户路径 3s 复位;外部强制路径不提交但完成退出)。
- 取消:丢草稿、不 `onChange`,仍走动画与 fix-v3 清理。
- 数据提交不依赖动画结束事件;动画中断不造成提交丢失/重复。

## 3. 状态语义契约

- `mode`(外部意图)与 `phase`(内部生命周期)必须分开;mode 不可由
  phase 派生(mode='edit' 横跨 prepare/opening/edit;closing 期间外部
  view 请求遵守现行显式协议)。
- `data-ready`:旧组件中 prepare 仅表示「已发起挂载」,RichEditor 的
  onReady 是独立异步事实——**新组件保留独立 ready 信号**;仅当未来
  状态机严格表达就绪时才可移除。

## 4. openCard 真实顺序(源码抄录)

旧组件 `openCard`(L395-443),逐项:

1. 守卫 `phaseRef === 'view'`(L396)。
2. `closeSourceRef = 'user'`;`phaseRef = 'prepare'`(ref 先行,DOM
   属性随 React 提交)(L402-403)。
3. `savedScrollYRef = window.scrollY`(L404)。
4. `lockBody()`:body overflow hidden + 滚动条宽补偿 padding(L405,
   实现 L226-239)。
5. `first = shell.getBoundingClientRect()` 折叠矩形(L407)。
6. slot 钉高至当前高度(L408)。
7. `inertSiblingsOf(shell)` 惰性化祖先链兄弟(已惰性则跳过)(L409-411)。
8. `showInTopLayer(shell)`(L413):popover 属性常驻策略——无则设
   `popover=manual` 再 `showPopover`;失败仅 console.warn 降级
   fixed 覆盖(L414-418)。
9. 清 `--animating` 类;shell 内联 `position: fixed; z-index: 101;
   margin: 0; right/bottom: auto`(L420-425)。
10. `applyRect(shell, first)`——钉在原视口矩形(L426-431)。
11. `setEditorReady(false)`、`setSessionContent(toWdfEditorContent(
    当前文档))`、`setPhase('prepare')`(L433-435):编辑器挂载、衬底
    转会话布局(absolute)。
12. 看门狗:`readyTimerRef = setTimeout(startOpening, 800)`(prepare
    超时直接展开)(L437-442)。

编辑器就绪 → 展开(`handleEditorReady` L388-393 + `startOpening`
L341-386):

1. onReady(守卫 prepare)→ **50ms 定时**(等首帧内容真正上屏,避免
   动画起点拍到骨架屏)。
2. `startOpening`:清看门狗;`setEditorReady(true)` + phase='opening'。
3. `void shell.getBoundingClientRect()` 落定 prepare 布局。
4. rAF:加 `--animating` 类 + `applyRect(getDialogRect())`——FLIP
   起点=折叠矩形、终点=视口推算的对话框矩形(≤640px 顶部对齐,否则
   居中;maxWidth 720/maxHeight 620/margin 12)。
   (注:f5ea053 曾把本步同步化,随 embedded 撤销,现行保留 rAF。)
5. `setTimeout(duration + MORPH_PAD)`(320+24):移除动画类、
   phase='edit';autoFocus 时带「已聚焦即停」守卫重试 ×3(50ms)聚焦。

## 5. 真机回归清单(摘要)

改动先整页刷新确认新构建;状态栏/软键盘结论以真机为准,IAB 辅助:

- 查看/打开/关闭:初始仅 WdfRender;展开无页面上涌、无空白首帧;聚焦
  无意外滚动、键盘收起后滚动可恢复;保存一次 onChange、新内容高度参与
  飞行目标;落位无跳闪;状态栏无白带。
- 数据/错误/快速操作:取消不 onChange;转换失败保留会话;Cmd+S 与退出
  语义分离;快速开合无旧回调污染;卸载/中断无残留 Ghost/定时器/滚动锁/
  inert;Ghost 无重复 id、清理幂等。
- 验收:类型检查、IAB 冒烟、真机新旧组件同文档并排各开合 3-5 次。

## 6. 新旧并行与文件边界

- 新建 `src/components/new-mobile-wdf-view/`(组件 + 专属 css,前缀
  `new-mobile-wdf-view`,CSS 变量 `--new-mobile-wdf-morph-duration`);
  复用 `../mobile-wdf-view/card-shell` 原语,不改其语义。
- 旧组件实现/样式/API/演示入口不动。
- 站点新增并排实验页(旧+新同文档),manifest/definitions 注册
  `new-mobile-wdf-view`。
- 共享 helper 如需改造:先证旧组件行为不变,且与新组件功能分开提交。

## 7. 实施清单

1. [x] 对照源码记录 openCard/提交测量/settle 真实顺序(本文 §2/§4)。
2. [x] 冻结旧组件真机基线(设备/iOS 版本/演示页)。
3. [x] 创建最小可运行 NewMobileWdfView(复制行为协议,无新状态机库)。
4. [x] mode/phase 区分;显式「已提交且可测量」协作点
    (`scheduleCloseFlightAfterBackingCommit`)。
5. [x] 复用 card-shell 原语;打开/关闭编排在具名操作内,关闭顺序遵守
    §2。
6. [x] data-ready 判定:prepare≠就绪,保留独立 ready 信号(§3)。
7. [x] 新旧并排真机对照;全基线通过后才考虑内部简化。

> 验收记录:2026-10-23 并排页新旧组件真机对照通过(用户确认),
> §8 门槛解锁,可启动新组件内部简化(会话标识/集中式转换/模块拆分,
> 每步独立提交并保留旧组件为对照)。

## 8. 下一阶段门槛

新组件独立运行 + 与旧组件逐项行为对照 + 真机回归通过,方可扩大重构
范围。旧 `MobileWdfView` 在此之前保持不变;是否替换是后续独立决策。

## 附录 A:相位转换盘点(内部简化阶段一)

事件 → 相位变更 → 附带副作用(以 NewMobileWdfView 首版为准):

| # | 事件 | 转换 | 附带副作用 |
|---|---|---|---|
| 1 | openCard(铅笔/受控 edit) | view→prepare | 会话开始;存 scrollY;锁滚动;测折叠矩形;slot 钉高;inert 兄弟;提升 top layer;内联 fixed 几何;挂编辑器;衬底转会话布局;800ms 看门狗 |
| 2 | onReady + 50ms | prepare(不变) | 等首帧上屏(定时器) |
| 3 | startOpening | prepare→opening | editorReady=true;FLIP:rAF 加动画类+applyRect(dialog rect);320+24ms 完成定时器 |
| 4 | 展开完成定时器 | opening→edit | 移除动画类;autoFocus 重试×3(50ms) |
| 5 | closeEditor(save/cancel) | edit→closing | 提交草稿(save);失焦收键盘;按键盘态 180ms/协作点 setTimeout(0) 起飞 |
| 6 | runCloseAnimation 定时器 | closing(不变) | 测新内容高度;钉高对齐;飞行;320+24ms |
| 7 | settleToView | closing→view(flushSync);prepare/opening→view(外部取消) | flushSync 三态复位;退 top layer;清几何;释放钉高;解锁;去 inert;恢复 scrollY;Ghost+一帧隐藏;双 rAF/64ms 幂等恢复;onModeChange('view')(用户路径) |

异步回调清单(须会话隔离):onReady 50ms 定时器、看门狗、FLIP rAF、
展开完成定时器、autoFocus 重试链、键盘等待/协作点定时器、收起飞行
settle 定时器、键盘避让定时器。例外:Ghost 恢复回调**不加**会话守卫
——幂等且恒向正确终态(visibility 复位),跳过可能把壳搁置在 hidden。

合法转换表(view→prepare;prepare→opening|view;opening→edit|view;
edit→closing;closing→view)由集中式 `transitionPhase` 执行,非法组合
告警拒绝;纯 reducer 不承载副作用(基线约束)。
