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

### 環境変数

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# OpenAI
OPENAI_API_KEY=your_openai_api_key

# Google OAuth
GOOGLE_CLIENT_ID=your_client_id
GOOGLE_CLIENT_SECRET=your_client_secret
GOOGLE_REFRESH_TOKEN=your_refresh_token
GOOGLE_MAPS_API_KEY=your_maps_api_key
```

### 実行

```bash
npm install
npm run dev
```

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
