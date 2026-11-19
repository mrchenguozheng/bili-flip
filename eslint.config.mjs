// 本仓库只有一份用户脚本，在这里统一约束它的写法。
// 用法：npm install && npm run lint（改代码时想顺手修，用 npm run lint:fix）
import js from '@eslint/js';
import globals from 'globals';

// 篡改猴注入的全局，按 @grant 列表声明，来自管理器而非浏览器。
const tampermonkeyGlobals = {
  GM_getValue: 'readonly',
  GM_setValue: 'readonly',
  GM_registerMenuCommand: 'readonly',
  GM_unregisterMenuCommand: 'readonly',
  GM_setClipboard: 'readonly',
  GM_info: 'readonly',
  unsafeWindow: 'readonly',
};

export default [
  {
    files: ['tampermonkey/*.user.js'],
    ...js.configs.recommended,
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'script',
      globals: { ...globals.browser, ...tampermonkeyGlobals },
    },
    rules: {
      ...js.configs.recommended.rules,
      // 对齐的行尾注释只能有一个空格（多个空格会被 --fix 逐个收敛）。
      'no-multi-spaces': 'error',
      // 空 catch 里常写一句“失败就忽略”的注释，允许。
      'no-empty': ['error', { allowEmptyCatch: true }],
      // 脚本用 const 为主，var 一律视为笔误。
      'no-var': 'error',
      // 未用参数常见于事件回调与占位函数，只查未用变量。
      'no-unused-vars': ['error', { args: 'none', caughtErrors: 'none' }],
    },
  },
];
