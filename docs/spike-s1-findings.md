# Spike S1 结论：BlockNote 自定义块内的可交互内容

验证环境：BlockNote 0.56.0 + React 19.3.1，`spikeTable` 自定义块（`content: "none"`，外层 `contentEditable={false}`），内含裸 `<input>`（无任何事件防护）、防护 `<input>`、计数按钮。

## 已确认的边界

**1. 原生表单控件不泄漏键盘事件给 ProseMirror —— 不需要 `stopPropagation`。**
裸 `<input>`（完全没有事件防护）里输入、Backspace、Enter、方向键，文档均不受影响；计数按钮点击不进文档。原生 `<input>/<textarea>/<select>/<button>` 在 `contentEditable={false}` 容器内自行消费键盘事件，ProseMirror 拿不到。**这一条推翻了原计划"所有交互元素都要 `stopPropagation()`"的假设。**

**2. 中文 IME 组合输入安全。** 组合过程中文档不变，不产生 spurious `onChange`。

**3. 自定义块的增/删/移动都能被 `onChange` 的 `getChanges()` 正确报告**（P2 保存管线的硬依赖，全部实测通过）：
- 插入 → `insert:spikeTable:local`
- 删除（块首 Backspace 删整块）→ `delete:spikeTable:local`
- 移动 → `move:spikeTable:local`
每条都带正确的 `block.type`，服务端据此做级联软删（`delete` 里的 subpage/database）与 sort_key 重算（`move`）都成立。

## 需要留意（非阻塞）

- **`stopPropagation` 仍需保留的场景**：若未来在单元格内用 `contentEditable` 富文本或自绘的 role="textbox"（非原生 input），那才会进入 ProseMirror 的 keymap。当前设计（title/rich_text/url→`<input>`，number→`type=number`，date→`type=date`，checkbox→点击，select→弹层）全部是原生控件，无需防护。
- **React StrictMode 下 render 双调用**是 dev-only 现象，生产构建单次，不影响 diff 管线。
- **拖拽手柄**：`moveBlocksUp/moveBlocksDown` 已确认 move-diff 契约；拖拽手柄的显隐/落点是 BlockNote 自身代码作用于标准 `bn-block-outer` 包裹层，自定义块不改变该机制，故未做真实鼠标拖拽自动化验证。

## 对项目风险的影响

原计划"最高风险 = 自定义块内放可交互表格"已解除。P5 的 `DatabaseViewHost`（普通 React 组件、`contentEditable={false}`、原生控件单元格）可以按现设计推进，无需为键盘事件做额外防护。
