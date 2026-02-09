# 詳細セットアップガイド

このガイドでは、Voice Agent プロジェクトの開発環境を構築する手順を詳しく説明します。

## 目次

1. [Prerequisites](#prerequisites)
2. [Node.js セットアップ](#nodejs-セットアップ)
3. [プロジェクトのインストール](#プロジェクトのインストール)
4. [環境変数の設定](#環境変数の設定)
5. [Supabase セットアップ](#supabase-セットアップ)
6. [Vapi セットアップ](#vapi-セットアップ)
7. [Cartesia セットアップ](#cartesia-セットアップ)
8. [開発サーバーの起動](#開発サーバーの起動)
9. [一般的な問題の解決](#一般的な問題の解決)

## Prerequisites

開発には以下が必要です：

- **Node.js v22.22.0 以上**（必須）
- **npm 10.x 以上**
- **Git**
- **VS Code**（推奨）
- **Postman** または **curl**（API テスト用）

## Node.js セットアップ

### なぜ v22.22.0 以上が必要なのか？

このプロジェクトは Next.js 15 とカスタムサーバーを使用しています。Node.js v22.22.0 未満のバージョンには **CVE-2025-59466** という脆弱性があり、`AsyncLocalStorage` に関するエラーが発生します。

### インストール方法

#### 方法 1: nvm を使用（推奨）

```bash
# nvm をインストール（まだの場合）
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.0/install.sh | bash

# ターミナルを再起動するか、以下を実行
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

# Node.js 22.22.0 をインストール
nvm install 22.22.0

# デフォルトとして設定
nvm alias default 22.22.0

# 使用確認
nvm use 22.22.0
node --version  # v22.22.0 と表示されるはず
```

#### 方法 2: n を使用

```bash
# n をインストール
npm install -g n

# Node.js 22.22.0 をインストール
n 22.22.0

# 使用確認
node --version
```

#### 方法 3: 公式サイトからダウンロード

https://nodejs.org/ から v22.22.0 以上のインストーラーをダウンロードしてインストールします。

### バージョンの固定

プロジェクトには `.nvmrc` ファイルが含まれています。プロジェクトディレクトリで以下を実行すると自動的に正しいバージョンが使用されます：

```bash
nvm use
```

## プロジェクトのインストール

```bash
# リポジトリのクローン
git clone https://github.com/your-org/voice-agent-vapi-cartesia.git
cd voice-agent-vapi-cartesia

# Node.js バージョンを確認
node --version  # v22.22.0 以上であること

# 依存関係のインストール
npm install
```

## 環境変数の設定

### 1. 環境変数ファイルの作成

```bash
# テンプレートからコピー
cp .env.example .env.local
```

### 2. 必須環境変数の設定

`.env.local` ファイルを編集して、以下の値を設定します：

```bash
# ============================================================
# Supabase 設定
# ============================================================
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here

# ============================================================
# Vapi 設定（音声AIプラットフォーム）
# ============================================================
VAPI_API_KEY=your-vapi-api-key
VAPI_PUBLIC_KEY=your-vapi-public-key
VAPI_ASSISTANT_ID=your-assistant-id

# ============================================================
# Cartesia 設定（TTSプロバイダー）
# ============================================================
CARTESIA_API_KEY=your-cartesia-api-key
```

### 3. オプション環境変数

必要に応じて以下も設定します：

```bash
# WebSocket 設定（デュアルサーバーモード使用時）
WEBSOCKET_PORT=3001
NEXT_PUBLIC_WEBSOCKET_URL=ws://localhost:3001/api/webrtc

# Google API（Google 統合使用時）
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_REFRESH_TOKEN=your-google-refresh-token
GOOGLE_MAPS_API_KEY=your-maps-api-key

# 開発設定
LOG_LEVEL=info
DEBUG=false
```

## Supabase セットアップ

### 1. プロジェクトの作成

1. https://supabase.com にアクセス
2. "New Project" をクリック
3. 组织名とプロジェクト名を入力
4. データベースパスワードを設定（忘れないように！）
5. リージョンを選択（近いリージョン推奨）
6. "Create new project" をクリック

### 2. API キーの取得

1. プロジェクトダッシュボードで "Settings" → "API" をクリック
2. 以下の値を `.env.local` にコピー：
   - Project URL → `NEXT_PUBLIC_SUPABASE_URL`
   - anon/public key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - service_role key → `SUPABASE_SERVICE_ROLE_KEY`

### 3. データベーススキーマの適用

```bash
# Supabase CLI をインストール（まだの場合）
npm install -g supabase

# マイグレーションを実行
npm run db:migrate
```

## Vapi セットアップ

### 1. アカウントの作成

1. https://vapi.ai にアクセス
2. アカウントを作成

### 2. API キーの取得

1. ダッシュボードで "Settings" → "API Keys" をクリック
2. API キーを `.env.local` にコピー：
   - API Key → `VAPI_API_KEY`
   - Public Key → `VAPI_PUBLIC_KEY`

### 3. アシスタントの作成

1. "Assistants" → "Create Assistant" をクリック
2. アシスタントの設定：
   - Name: "Voice Agent"
   - Model: GPT-4o
   - Voice: 好みの声を選択
3. "Create" をクリック
4. Assistant ID を `.env.local` にコピー：
   - Assistant ID → `VAPI_ASSISTANT_ID`

## Cartesia セットアップ

### 1. アカウントの作成

1. https://cartesia.ai にアクセス
2. アカウントを作成

### 2. API キーの取得

1. ダッシュボードで "API Keys" をクリック
2. API キーを `.env.local` にコピー：
   - API Key → `CARTESIA_API_KEY`

### 3. 音声設定（オプション）

```bash
# .env.local で Cartesia の設定をカスタマイズ
CARTESIA_VOICE_ID=79a125e6-c5a2-4b9d-8b3f-5c2a1b2d3e4f
CARTESIA_DEFAULT_SPEED=1.0
CARTESIA_SAMPLE_RATE=24000
CARTESIA_OUTPUT_FORMAT=pcm16
```

## 開発サーバーの起動

### 標準モード（カスタムサーバー）

```bash
npm run dev
```

- Next.js + WebSocket がポート 3000 で起動します
- ブラウザで http://localhost:3000 にアクセス

### デュアルサーバーモード（推奨）

```bash
npm run dev:all
```

- Next.js がポート 3000 で起動
- WebSocket サーバーがポート 3001 で起動

### プレーンモード（WebSocket なし）

```bash
npm run dev:plain
```

- Next.js のみ起動（API ルートのみ利用可能）

## 一般的な問題の解決

### 問題: AsyncLocalStorage エラー

```
Error: Invariant: AsyncLocalStorage accessed in runtime where it is not available
```

**解決方法:**
```bash
# Node.js バージョンを確認
node --version

# v22.22.0 未満の場合はアップグレード
nvm install 22.22.0
nvm use 22.22.0

# node_modules を再インストール
rm -rf node_modules package-lock.json
npm install
```

### 問題: ポートが使用中

```
Error: listen EADDRINUSE: address already in use :::3000
```

**解決方法:**
```bash
# 使用中のプロセスを探す
lsof -ti:3000

# プロセスを終了
kill -9 $(lsof -ti:3000)

# またはポートを変更
# .env.local で:
PORT=3001
```

### 問題: 環境変数が読み込まれない

**解決方法:**
```bash
# .env.local ファイルが存在するか確認
ls -la .env.local

# ファイル名が正しいか確認（.env ではなく .env.local）
# ファイルを .gitignore に追加されているか確認

# サーバーを再起動
npm run dev
```

### 問題: Supabase 接続エラー

**解決方法:**
```bash
# 環境変数を確認
echo $NEXT_PUBLIC_SUPABASE_URL
echo $NEXT_PUBLIC_SUPABASE_ANON_KEY

# Supabase プロジェクトが一時停止されていないか確認
# https://supabase.com/dashboard で確認

# データベースが正常に動作しているか確認
npm run db:types
```

## IDE 設定

### VS Code 推奨拡張機能

```bash
# 推奨拡張機能のインストール
code --install-extension dbaeumer.vscode-eslint
code --install-extension esbenp.prettier-vscode
code --install-extension bradlc.vscode-tailwindcss
code --install-extension ms-vscode.vscode-typescript-next
```

### VS Code 設定

`.vscode/settings.json`:

```json
{
  "typescript.tsdk": "node_modules/typescript/lib",
  "typescript.enablePromptUseWorkspaceTsdk": true,
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true
  }
}
```

## 次のステップ

セットアップ完了後、以下を参照してください：

- [API 仕様](./docs/API_SPECIFICATION.md) - API エンドポイントの詳細
- [アーキテクチャ](./docs/ARCHITECTURE.md) - システム設計の詳細
- [実装計画](./docs/IMPLEMENTATION_PLAN.md) - 開発ロードマップ
