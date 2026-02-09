# Voice Agent - OpenAI Realtime API

OpenAI Realtime APIを使ったボイス AI エージェントのバックエンドサーバー。

## 概要

iOS ネイティブ / Meta Glass アプリ開発の前段として、音声AIバックエンドの疎通確認とロジック検証を行う Web ベースの PoC です。

**設計方針: Client is Thin, Server is Fat**

- **クライアント**: 音声の入出力（録音・再生）とUIのみ
- **サーバー**: 記憶、判断、音声変換、ツール実行の全てを集約

## 技術スタック

| Layer | Technology |
|-------|------------|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript 5.x |
| UI | React 19, Tailwind CSS |
| Voice AI | OpenAI Realtime API (Direct) |
| Database | Supabase PostgreSQL |
| Deployment | Cloud Run |

## アーキテクチャ

```
┌─────────────────┐         WebRTC         ┌──────────────────────┐
│   Browser       │◄────────────────────────►│   OpenAI Realtime    │
│   Client        │      (Data Channel)      │      API Server      │
└────────┬────────┘                          └──────────────────────┘
         │                                         │
         │ REST API                                │ Function Call
         ▼                                         ▼
┌─────────────────┐         Tool Execution ┌──────────────────────┐
│  Next.js API    │◄──────────────────────────│  External Services   │
│   /api/tools/*  │                            │  (Calendar/Docs/etc) │
└─────────────────┘                            └──────────────────────┘
```

## セットアップ

### Prerequisites

**重要: Node.js バージョン要件**

このプロジェクトは **Node.js v22.22.0 以上** が必要です。

古いバージョンを使用すると、以下のエラーが発生します：

```
Error: Invariant: AsyncLocalStorage accessed in runtime where it is not available
```

これは **CVE-2025-59466** に関連する脆弱性です。

#### Node.js のインストール方法

**nvm を使用する場合（推奨）:**
```bash
nvm install 22.22.0
nvm use 22.22.0
```

**n を使用する場合:**
```bash
n 22.22.0
```

**公式サイトからダウンロード:**
https://nodejs.org/

バージョン確認:
```bash
node --version  # v22.22.0 以上であることを確認
```

### 環境変数

```bash
# .env.local ファイルを作成
cp .env.example .env.local

# 環境変数を編集
```

**必須環境変数:**

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Vapi (Voice AI Platform)
VAPI_API_KEY=your_vapi_api_key
VAPI_PUBLIC_KEY=your_vapi_public_key
VAPI_ASSISTANT_ID=your_assistant_id

# Cartesia (TTS Provider)
CARTESIA_API_KEY=your_cartesia_api_key
```

**オプション環境変数:**

```bash
# WebSocket サーバー設定（デュアルサーバーアーキテクチャ使用時）
WEBSOCKET_PORT=3001
NEXT_PUBLIC_WEBSOCKET_URL=ws://localhost:3001/api/webrtc

# Google OAuth（Google統合使用時）
GOOGLE_CLIENT_ID=your_client_id
GOOGLE_CLIENT_SECRET=your_client_secret
GOOGLE_REFRESH_TOKEN=your_refresh_token
GOOGLE_MAPS_API_KEY=your_maps_api_key
```

### 実行

**標準モード（カスタムサーバー）:**
```bash
npm install
npm run dev
```

**デュアルサーバーモード（WebSocket分離）:**
```bash
npm run dev:all
```
※ このモードでは、Next.js（ポート3000）とWebSocketサーバー（ポート3001）が別々に起動します。

**Next.jsのみ（プレーンモード）:**
```bash
npm run dev:plain
```

## トラブルシューティング

### AsyncLocalStorage エラー

以下のエラーが表示される場合：

```
Error: Invariant: AsyncLocalStorage accessed in runtime where it is not available
```

**解決方法:**
1. Node.js のバージョンを確認: `node --version`
2. v22.22.0 以上でない場合はアップグレード:
   ```bash
   nvm install 22.22.0
   nvm use 22.22.0
   ```
3. `node_modules` と `package-lock.json` を削除して再インストール:
   ```bash
   rm -rf node_modules package-lock.json
   npm install
   ```

### WebSocket 接続エラー

WebSocket に接続できない場合：

**解決方法:**
1. デュアルサーバーモードを試す:
   ```bash
   npm run dev:all
   ```
2. WebSocket URL 環境変数を確認:
   ```bash
   # .env.local で設定
   NEXT_PUBLIC_WEBSOCKET_URL=ws://localhost:3001/api/webrtc
   ```

### サーバーが起動しない

ポートが使用中の場合：

**解決方法:**
1. ポートを変更:
   ```bash
   # .env.local で設定
   PORT=3001
   WEBSOCKET_PORT=3002
   ```
2. または使用中のプロセスを終了

## API エンドポイント

| Method | Endpoint | 説明 |
|--------|----------|------|
| POST | `/api/session` | セッション作成 |
| POST | `/api/tools/calendar` | Google Calendar 操作 |
| POST | `/api/tools/docs` | Google Docs 操作 |
| POST | `/api/tools/location` | 位置情報→コンテキスト生成 |
| POST | `/api/tools/memo` | 明示的メモ保存 |
| POST | `/api/simulate/location` | 位置シミュレーション |
| POST | `/api/simulate/notification` | 通知シミュレーション |
| POST | `/api/cockpit/enroll` | 声紋登録 |
| GET | `/api/cockpit/users` | ユーザー一覧 |
| POST | `/api/cockpit/select` | ユーザー選択 |

## ドキュメント

- [要件定義](./docs/REQUIREMENTS.md)
- [システムアーキテクチャ](./docs/ARCHITECTURE.md)
- [API仕様](./docs/API_SPECIFICATION.md)
- [実装計画](./docs/IMPLEMENTATION_PLAN.md)
- [Cloud Runデプロイ](./docs/CLOUD_RUN_DEPLOYMENT.md)

## ライセンス

MIT
