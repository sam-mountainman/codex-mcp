# codex-mcp

[![CI](https://github.com/sam-mountainman/codex-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/sam-mountainman/codex-mcp/actions/workflows/ci.yml)

English README: [README.en.md](README.en.md)

短いセットアップガイド: [SETUP.md](SETUP.md)

Claude CodeからOpenAI Codexを、読み取り専用の設計・深い推論・コードレビュー役として呼び出すプラグインです。`fable-mcp`と逆向きの構成です。

```text
ユーザー
  ↓
Claude Code（実装担当）
  ↓ MCP
codex-mcp
  ↓ Codex CLI
GPT-5.6 Solなど（設計・推論・レビュー担当）
```

## 一文でセットアップ

最も簡単な方法は、次の一文をClaude Codeまたは普段使っているコーディングエージェントへ渡すことです。

```text
https://github.com/sam-mountainman/codex-mcp をセットアップして。
```

受け取ったエージェントは`AGENTS.md`をセットアップ契約として読み、Node.js、Codex CLI、Claude Code、認証、プラグイン登録、実動確認まで進めます。APIキーを通常チャットへ貼る必要はありません。

## 機能

- `gpt_plan`: リポジトリを読んで具体的な実装計画を作る
- `gpt_ask`: 技術相談、難しいデバッグ、トレードオフ分析
- `gpt_review`: 現在の差分を読み取り専用でレビューする
- `gpt_continue`: `session_id`を使って同じCodex会話を継続する
- `gpt_status`: CLI、認証、モデル一覧、既定値をローカル診断する（モデル利用なし）

既定値は`gpt-5.6-sol`と`max`です。すべてのモデル呼び出しは`approval_policy=never`、`sandbox_mode=read-only`で実行されるため、Codex側はリポジトリを変更できません。

## セットアップ

前提はNode.js 18以上です。セットアップスクリプトは、Codex CLIまたはClaude Codeがなければ公式npmパッケージをインストールし、MCPをビルドしてClaude Codeへプラグイン登録します。

macOS / Linux:

```sh
git clone https://github.com/sam-mountainman/codex-mcp.git
cd codex-mcp
./install.sh
```

Windows PowerShell:

```powershell
git clone https://github.com/sam-mountainman/codex-mcp.git
Set-Location codex-mcp
.\install.ps1
```

既にCodexへログイン済みなら、その認証を再利用します。未ログイン時はChatGPTログイン（推奨）またはAPIキーを選べます。

明示指定する場合:

```sh
# ChatGPTアカウントでログイン
./install.sh --auth=chatgpt

# 環境変数のAPIキーでログイン（キーはコマンド引数に載せない）
OPENAI_API_KEY=... ./install.sh --auth=api

# プラグインだけセットアップ
./install.sh --auth=skip --skip-live-check
```

完了後にClaude Codeを再起動するか`/reload-plugins`を実行し、`Codexの状態を確認して`と依頼してください。

## モデル・推論レベルの変更

Claude Codeへ自然文で指定できます。

```text
GPT-5.6 Terra、reasoning lowでこの設計を考えて
Solのmaxで実装をレビューして
さっきのsession_idをLunaのmediumで続けて
```

MCPツールを直接呼ぶ場合の例:

```json
{
  "task": "この機能の設計と実装計画を作って",
  "model": "gpt-5.6-sol",
  "reasoning_effort": "max",
  "cwd": "/absolute/path/to/project"
}
```

サーバーが受け付ける推論値は`none / low / medium / high / xhigh / max / ultra`です。実際に使える組み合わせはローカルCodex CLIのモデルカタログに従います。`gpt_status`で対象モデルの対応値を確認できます。

環境変数でサーバー既定値も変更できます。

```sh
export CODEX_MCP_DEFAULT_MODEL=gpt-5.6-terra
export CODEX_MCP_DEFAULT_REASONING_EFFORT=medium
```

その他の設定:

- `CODEX_MCP_CODEX_BIN`: Codex CLIの絶対パス
- `CODEX_MCP_TIMEOUT_MS`: 1回のタイムアウト（既定20分）
- `CODEX_MCP_MAX_OUTPUT_CHARS`: MCPへ返す最大文字数（既定200,000）

## 開発・検証

```sh
npm install
npm run verify
npm run live-smoke
claude plugin validate --strict .
```

`npm run live-smoke`だけが実際にモデルを呼び出します。その他のテストはローカルのみです。

ローカル開発中はマーケットプレイスへ登録せず、Claude Codeを次のように起動して確認することもできます。

```sh
claude --plugin-dir /absolute/path/to/codex-mcp
```

## 認証と課金

内部ではResponses APIを直接呼ばず、`codex exec --json`を使います。そのためCodex CLIが公式に対応する両方の認証を利用できます。

- ChatGPTログイン: ChatGPTプラン側のCodex利用枠
- OpenAI APIキー: OpenAI Platformの従量課金

APIキーやCodexの認証ファイルをリポジトリへ保存しません。APIキー方式のセットアップでも、キーは環境変数から標準入力へ渡し、コマンド引数や通常出力には載せません。

## 制約

- `model`は将来のCodexモデルIDも通せるよう固定リストにしていません。最終的な有効性はCodex CLIが検証します。
- `reasoning_effort`はCLI/APIで差があり得ます。例えばローカルカタログが`none`を表示しないモデルでは、その値は実行時に拒否される場合があります。
- `gpt_continue`はCodex CLIが保存したセッションを使うため、初回呼び出しと同じローカル認証・Codexホームが必要です。

## ライセンス

MIT

## 参考資料

- [OpenAI: GPT-5.6モデルガイド](https://developers.openai.com/api/docs/guides/latest-model)
- [OpenAI: Codex認証](https://learn.chatgpt.com/docs/auth)
- [OpenAI: Codex非対話モード](https://learn.chatgpt.com/docs/non-interactive-mode)
- [Anthropic: Claude Codeプラグイン](https://code.claude.com/docs/en/plugins)
- [Anthropic: Claude CodeでMCPを使う](https://code.claude.com/docs/en/mcp)
- [参照実装: fable-mcp](https://github.com/sam-mountainman/fable-mcp)
