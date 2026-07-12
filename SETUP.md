# codex-mcp セットアップ

Claude Codeまたはコーディングエージェントへ、次の一文を渡してください。

```text
https://github.com/sam-mountainman/codex-mcp をセットアップして。
```

手動セットアップ:

```sh
git clone https://github.com/sam-mountainman/codex-mcp.git
cd codex-mcp
./install.sh
```

Windows PowerShellでは`.\install.ps1`を実行します。

インストーラーはNode.js 18以上を確認し、必要なら公式Codex CLIとClaude Codeを導入します。既存のCodex認証があれば再利用し、なければChatGPTログイン（推奨）または環境変数のOpenAI APIキーを使用できます。

完了後、Claude Codeを再起動するか`/reload-plugins`を実行し、`Codexの状態を確認して`と依頼してください。

ライブモデル呼び出しを省く場合:

```sh
./install.sh --auth=existing --skip-live-check
```
