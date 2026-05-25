# Debug Session: doubao-read-failure

**Status:** `[FIXED]`

**Started:** 2026-05-24

**Symptoms:** 豆包 `read` 命令无法读取对话内容，可能是 DOM 元素选择器失效

## Hypotheses (Initial)

1. **H1:** 豆包网页 DOM 结构发生变化，原有的 CSS 选择器无法匹配到新元素
2. **H2:** 消息列表容器的选择器失效，导致无法找到消息根元素
3. **H3:** 用户/助手角色的判断逻辑失效，无法正确识别消息发送方
4. **H4:** 豆包网页加载状态变化，需要等待更长时间或不同的加载条件
5. **H5:** 新的防爬机制或验证机制阻止了内容读取

## Evidence Log

**用户提供的运行时信息：**
- 用户消息 class: `whitespace-pre-wrap ... bg-g-send-msg-bubble-bg ...` ✅ 已有
- AI 消息 class: `container-P2rR72 flow-markdown-body theme-samantha-uDexJL ...` ⚠️ **新的 DOM 结构！**

**问题确认：** AI 消息不再有 `bg-g-receive-msg-bubble` 标记，而是使用 `flow-markdown-body` + `container-xxx` 的新结构

## Fix Applied (Round 2)

**修改文件：** `clis/doubao/utils.js`

**发现的新问题：**
- 消息列表容器变为 `[class*="v_list-"]` (如 `v_list-D34x3M`)
- 消息项变为 `.v_list_row`
- 原来的选择器完全失效

**修改内容：**

1. **更新消息列表选择器**（第 247 行）：
   ```javascript
   const messageList = document.querySelector('[class*="v_list-"], [class*="message-list-S2Fv2S"], ...');
   ```

2. **添加新的消息项选择器**（第 250-251 行）：
   ```javascript
   '.v_list_row',
   ```

3. **更新 `getRole()` 函数**以处理 `.v_list_row` 包装器：
   - 添加 `isVListRow` 检测
   - 新增 `checkSelector` 辅助函数
   - 添加针对 `.v_list_row` 的 AI 消息识别逻辑

## Verification

**✅ 已验证：** 用户确认 `doubao read` 命令可以正常工作

## Root Cause Summary

豆包网页在 2026-05 进行了 DOM 结构重构：
- 消息列表容器从 `[class*="message-list-S2Fv2S"]` 变为 `[class*="v_list-"]`
- 消息项从 `inner-item-xxx` / `top-item-xxx` 变为 `.v_list_row`
- AI 消息不再有 `bg-g-receive-msg-bubble` 标记，改为 `flow-markdown-body` + `container-xxx`

## Solution

更新 `clis/doubao/utils.js`：
1. 添加新的消息列表选择器 `[class*="v_list-"]`
2. 添加新的消息项选择器 `.v_list_row`
3. 更新 `getRole()` 函数处理新的 DOM 结构
