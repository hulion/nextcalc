module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [
      2,
      'always',
      [
        'feat',     // 新功能
        'fix',      // 錯誤修復
        'perf',     // 效能改進
        'refactor', // 程式碼重構
        'docs',     // 文件更新
        'style',    // 程式碼格式調整 (不影響功能)
        'test',     // 測試相關
        'build',    // 建置系統或外部相依性變更
        'ci',       // CI/CD 設定檔變更
        'chore',    // 其他不修改 src 或測試檔案的變更
        'revert'    // 回復先前的 commit
      ]
    ],
    'subject-case': [0], // 不限制 subject 的大小寫格式
  }
};
