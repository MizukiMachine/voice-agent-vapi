# Voice Engine PoC - 要件定義

## 1. プロジェクト目的

iOS ネイティブ / Meta Glass アプリ開発の前段として、
音声AIバックエンドの疎通確認とロジック検証を行う Web ベースの PoC。

---

## 2. 基本原則

### 2.1 Client is Thin, Server is Fat

| 層 | 責務 |
|----|------|
| **クライアント** | 音声の入出力（録音・再生）とUIのみ。ロジックを持たない |
| **サーバー** | 記憶、判断、音声変換、ツール実行の **全て** を集約 |

クライアントが行うのは:
- マイクから音声を取得し、サーバーに送る
- サーバーから返された音声を再生する
- UIを表示する

クライアントが行わ **ない** こと:
- 音声認識 (STT)
- LLM呼び出し
- 音声合成 (TTS)
- 記憶の管理
- ツール実行の判断

### 2.2 One API 原則

```
https://<server-base-url>/api/*
```

- **全てのクライアント（Web / iOS / Meta Glass）が同一のAPI群を使う**
- クライアント固有のエンドポイントは作らない
- Cloud Run 等にデプロイした1つのサーバーが全クライアントに対応
- クライアントは Base URL さえ知っていれば動作する

### 2.3 移行要件

> ネイティブアプリ移行時に、APIサーバーを **修正なし** で利用できる設計とする

- Web PoC で検証した API をそのまま iOS / Meta Glass から呼ぶ

---

## 3. 音声パイプライン

### 3.1 アーキテクチャ

```
┌─────────────────┐         WebRTC (SDP)         ┌──────────────────────┐
│   Browser       │◄────────────────────────────►│   OpenAI Realtime    │
│   Client        │      (Data Channel)          │      API Server      │
└────────┬────────┘                                └──────────────────────┘
         │                                                 │
         │                                                 │
         │ REST API                                        │ Function Call
         │                                                 │ (via Data Channel)
         ▼                                                 ▼
┌─────────────────┐         Tool Execution        ┌──────────────────────┐
│  Next.js API    │◄──────────────────────────────│  External Services   │
│   /api/tools/*  │                                │  (Calendar/Docs/etc) │
└─────────────────┘                                └──────────────────────┘
```

### 3.2 セッションフロー

1. **Client** → `POST /api/session` → Server
2. **Server** → `POST https://api.openai.com/v1/realtime/sessions` → OpenAI
3. **OpenAI** → `{ client_secret, model }` → Server
4. **Server** → `{ sessionId, clientSecret, model }` → Client
5. **Client**: WebRTC PeerConnection 確立
6. **OpenAI** → SDP Answer → Client
7. **Start Conversation**: 双方向音声ストリーム通信
8. **Function Call**: `/api/tools/*` 経由でルーティング

---

## 4. API エンドポイント

### 4.1 セッション・音声

| Method | Endpoint | 説明 |
|--------|----------|------|
| POST | `/api/session` | セッション作成 |

### 4.2 記憶・ツール

| Method | Endpoint | 説明 |
|--------|----------|------|
| POST | `/api/tools/calendar` | Google Calendar 操作 |
| POST | `/api/tools/docs` | Google Docs 操作 |
| POST | `/api/tools/location` | 位置情報→コンテキスト生成 |
| POST | `/api/tools/memo` | 明示的メモ保存 |

### 4.3 シミュレーション・管理

| Method | Endpoint | 説明 |
|--------|----------|------|
| POST | `/api/simulate/location` | 位置シミュレーション |
| POST | `/api/simulate/notification` | 通知シミュレーション |
| POST | `/api/cockpit/enroll` | 声紋登録 |
| GET | `/api/cockpit/users` | ユーザー一覧 |
| POST | `/api/cockpit/select` | ユーザー選択 |

---

## 5. 記憶システム

### 5.1 固定スロット方式

1ユーザー10スロット（各200文字）

### 5.2 データベーススキーマ

**user_memory_slots**

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary Key |
| user_id | UUID | FK → user_profiles.id |
| slot_number | INTEGER | 1-10 |
| content | TEXT | 最大200文字 |
| updated_at | TIMESTAMP | 自動更新 |

**制約**: `UNIQUE(user_id, slot_number)`

### 5.3 ロジック

- **Load**: セッション開始時に全スロット取得 → System Prompt に注入
- **Update**: LLMツール経由で特定スロットを UPSERT
- **Delete**: content を空文字にセットでクリア

---

## 6. データベース

### user_profiles

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary Key |
| name | TEXT | ユーザー識別名 |
| voice_profile_blob | TEXT | Base64 声紋データ |
| created_at | TIMESTAMP | 作成日時 |

---

## 7. 技術スタック

| Layer | Technology | Purpose |
|-------|------------|---------|
| Framework | Next.js 16 (App Router) | SSR, API Routes |
| Language | TypeScript 5.x | 型安全性 |
| UI | React 19, Tailwind CSS | デバッグUI |
| Voice AI | OpenAI Realtime API (Direct) | GPT-4o, TTS/STT, Function Calling |
| Database | Supabase PostgreSQL | user_profiles, user_memory_slots |
| External APIs | Google Calendar, Docs, Geocoding | ツール実行 |
| Deployment | Cloud Run | Serverless container |

---

## 8. 優先度ルール

| 優先度 | 対象 |
|--------|------|
| **High** | サーバーサイドロジック（API, DB, Webhook） |
| **High** | バックエンドロジックの包括的テスト |
| **Low** | UIデザイン（開発者用管理画面レベルでOK） |

---

## 9. 厳守事項

1. **Web固有のハック禁止**: スリープ対策、WakeLock等に工数を使わない
2. **Client is Thin**: クライアントにロジックを実装しない
3. **One API**: 全クライアントが同一APIを利用する
4. **ブラウザ Foreground 前提**: 表示状態で検証する
5. **移行互換性**: APIサーバーはネイティブアプリから修正なしで利用可能にする
