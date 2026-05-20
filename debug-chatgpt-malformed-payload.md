# Debug Session: chatgpt-composer-malformed-payload

## Status: [OPEN]

## Bug Description
执行 `opencli --profile 8qatyy5j chatgpt send "dd"` 时报错：
```
ok: false
error:
  code: COMMAND_EXEC
  message: chatgpt composer readiness returned malformed extraction payload
  exitCode: 1
```

## Hypotheses

1. **H1**: Browser Bridge 返回了 envelope 格式但解包失败
   - Observation Point: `unwrapEvaluateResult` 的输入和输出
   
2. **H2**: `page.evaluate` 返回了 null/undefined 或非布尔值
   - Observation Point: `page.evaluate` 原始返回值
   
3. **H3**: Browser Bridge 版本不兼容，返回格式与期望不符
   - Observation Point: bridge 返回的完整数据结构
   
4. **H4**: ChatGPT 页面结构变化，导致 `findComposer()` 返回非预期值
   - Observation Point: `findComposer()` 的执行结果

## Evidence Log

### Pre-fix Evidence

已在 `clis/chatgpt/utils.js` 的 `sendChatGPTMessage` 函数中添加调试日志。

需要用户重新运行命令来收集证据：
```bash
opencli --profile 8qatyy5j chatgpt send "dd"
```

预期输出会包含：
- `[DEBUG] Raw evaluate result:` - page.evaluate 的原始返回值
- `[DEBUG] Unwrapped result:` - 经过 unwrapEvaluateResult 处理后的值
- `[DEBUG] typeResult:` - 最终的布尔值结果

### Post-fix Evidence

*To be collected after fix...*

## Root Cause

**H4 成立**: ChatGPT 页面结构变化不是直接原因，根本原因是 `buildComposerLocatorScript()` 函数返回的脚本字符串包含 `return { findComposer, markerAttr };`，当这个脚本在 IIFE 中执行时，会立即返回该对象，导致后续的 `findComposer()` 调用永远不会执行。

### 证据
```
[DEBUG] Raw evaluate result: {"findComposer":{"toString":{}},"markerAttr":"data-opencli-chatgpt-composer"}
```

这证明 `page.evaluate` 返回的是 `buildComposerLocatorScript()` 中 `return { findComposer, markerAttr }` 的结果，而不是 `findComposer()` 的执行结果。

### 修复方案
将 `buildComposerLocatorScript()` 的内容内联到 IIFE 中，移除 `return` 语句，使 `findComposer` 函数在局部作用域定义并可以被后续代码调用。

## Fix Applied

*To be documented...*
