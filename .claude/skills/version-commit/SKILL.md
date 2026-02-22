---
name: version-commit
description: 提交功能變更時自動更新 package.json 版本號，然後 commit 並 push。當使用者要求 commit 且包含功能變更時使用。
user-invocable: true
---

當使用者要求提交變更時，執行以下步驟：

1. 檢查 `git diff` 和 `git status` 確認變更內容
2. 判斷是否包含功能變更（非純文件、設定、或 style-only 的修改）
3. 如果有功能變更：
   - 讀取 `package.json` 取得目前版本號
   - 詢問使用者要升級哪個版本層級（patch/minor/major），預設建議 patch
   - 更新 `package.json` 中的 `version` 欄位
   - 將 `package.json` 的變更一併加入 commit
   - 打上tag，直接以version字串標示，不需要加上v，保持一致性
4. 使用 git-commit skill 進行 commit
5. Push 到遠端
