# Voice Engine PoC - 実装計画

## GitHub Issue マッピング

| GitHub # | 内容 | Phase | Priority | Status |
|----------|------|-------|----------|--------|
| #1 | プロジェクト初期セットアップ | Phase 1 | High | ✅ Closed |
| #2 | Supabase設定 (スキーマ + RLS) | Phase 1 | High | ✅ Closed |
| #12 | Google Cloud OAuth設定 | Phase 1 | High | ✅ Closed |
| #14 | テスト環境セットアップ | Phase 1 | High | ✅ Closed |
| #3 | セッション管理API | Phase 2 | High | ✅ Closed |
| #4 | 記憶システム (Supabase Edge Functions) | Phase 2 | High | ✅ Closed |
| #13 | VAPI Assistant設定 | Phase 2 | High | ✅ Closed |
| #5 | Server Side Tools API (Calendar, Docs, Memo) | Phase 3 | High | ✅ Closed |
| #6 | 位置情報処理 (Maps/Geofence) | Phase 3 | High | ✅ Closed |
| #7 | Cockpit (ユーザー管理) | Phase 4 | API:High / UI:Low | ✅ Closed |
| #8 | Picovoice統合 (WakeWord/Voiceprint) | Phase 4 | Low | 🔴 Open |
| #9 | Camera Bridge (Vision) | Phase 4 | Low | 🔴 Open |
| #10 | Simulation Tools + Debug Console UI | Phase 5 | High | ✅ Closed |
| #11 | E2Eテスト・検証 | Phase 6 | High | ✅ Closed |
| #15 | VAPI Web SDK統合（実際の音声通話） | Phase 7 | High | 🟡 In Progress |

---

## Issue分解 (DAG順)

### Phase 1: 基盤構築 (並行可能)

#### Issue #1: プロジェクト初期セットアップ
- Next.js 15 + TypeScript + Tailwind CSS
- ESLint/Prettier設定
- 環境変数テンプレート (.env.local.example)
- ディレクトリ構造

**完了条件**:
- [ ] `npm run dev` で起動確認
- [ ] 全ディレクトリ構造が作成済み
- [ ] `.env.local.example` が作成済み
- [ ] ESLint/Prettier設定済み

#### Issue #2: Supabase設定 (スキーマ + RLS)
- Supabase CLI セットアップ
- user_profiles / user_memories テーブル
- RLSポリシー設定
- Edge Functions環境準備

**SQLスキーマ**:
```sql
-- user_profiles
CREATE TABLE user_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  voice_profile_blob TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- user_memories
CREATE TABLE user_memories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES user_profiles(id) ON DELETE CASCADE,
  fact TEXT NOT NULL,
  source TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);
```

**完了条件**:
- [ ] Supabase プロジェクトが作成済み
- [ ] Supabase CLI で接続確認
- [ ] テーブルがマイグレーション済み
- [ ] RLSポリシーが設定済み
- [ ] Edge Functions用シークレット設定済み

#### Issue #12: Google Cloud OAuth設定 (New)
- GCPプロジェクト作成
- OAuth同意画面・認証情報設定
- リフレッシュトークン取得

**完了条件**:
- [ ] GCPプロジェクトが作成済み
- [ ] 必要なAPIが有効化済み
- [ ] OAuth認証情報取得済み
- [ ] リフレッシュトークン取得済み

#### Issue #14: テスト環境セットアップ (New)
- Jest + ts-jest 設定
- API単体テスト雛形
- Postman/Brunoコレクション

**完了条件**:
- [ ] `npm test` でテスト実行可能
- [ ] 各APIの基本テストが存在する
- [ ] Postman/Bruno コレクション作成済み

---

### Phase 2: コアAPI実装 (#1, #2完了後)

#### Issue #3: セッション管理API
- POST /api/session
- Supabaseから Fact List 取得
- VAPIトークン発行 with System Prompt

**実装ファイル**:
- `src/app/api/session/route.ts`
- `src/lib/supabase.ts`
- `src/lib/vapi.ts`

**完了条件**:
- [ ] `/api/session` が200を返す
- [ ] VAPIトークンが正しく発行される
- [ ] System Promptにメモリが注入される

#### Issue #4: 記憶システム (Supabase Edge Functions)
- Supabase Edge Function: extract-facts
- POST /api/webhooks/call-ended (Next.js - 転送用)
- Webhook署名検証（本番用）
- OpenAI API連携 (gpt-4o-mini)
- user_memories更新

**実装ファイル**:
- `src/app/api/webhooks/call-ended/route.ts`
- `supabase/functions/extract-facts/index.ts`

**検証ポイント**:
- [ ] Webhook受信が機能
- [ ] Supabase StudioでDB確認
- [ ] Fact保存検証

#### Issue #13: VAPI Assistant設定 (New)
- VAPIダッシュボードでAssistant作成
- Tool定義（calendar_action, docs_action, etc.）
- Webhook URL設定

**完了条件**:
- [ ] VAPI Assistantが作成済み
- [ ] 全Tool定義が設定済み
- [ ] Webhook URLが設定済み
- [ ] テスト通話で確認済み

---

### Phase 3: ツール実行API (#3完了後)

#### Issue #5: Server Side Tools
- POST /api/tools/calendar (Google Calendar)
- POST /api/tools/docs (Google Docs)
- POST /api/tools/memo (Explicit Memo Save)

**実装ファイル**:
- `src/app/api/tools/calendar/route.ts`
- `src/app/api/tools/docs/route.ts`
- `src/app/api/tools/memo/route.ts`

**完了条件**:
- [ ] 各APIが正しくGoogle APIと連携
- [ ] レスポンスが正しく返る

#### GitHub Issue #6: 位置情報処理 (Maps/Geofence)
- POST /api/tools/location (逆ジオコーディング + 施設情報)
- Google Geocoding API: 座標 → 住所/地名
- Google Places API: 周辺の観光名所・施設情報
- VAPI連携: 位置情報をコンテキストとしてTTS応答生成

**実装ファイル**:
- `src/app/api/tools/location/route.ts`

**完了条件**:
- [ ] 座標から住所への変換が機能
- [ ] 周辺施設検索が機能
- [ ] VAPIセッションへのコンテキスト注入が機能

**Note**: シミュレータAPI (`/api/simulate/location`) は GitHub Issue #10 で実装

---

### Phase 4: クライアント実装 (#3完了後)

#### GitHub Issue #7: Cockpit (ユーザー管理)
- 声紋登録UI (Enrollment)
- ユーザー選択UI (Selection)
- POST /api/cockpit/enroll
- GET /api/cockpit/users
- POST /api/cockpit/select

**実装ファイル**:
- `src/app/api/cockpit/enroll/route.ts`
- `src/app/api/cockpit/users/route.ts`
- `src/app/api/cockpit/select/route.ts`
- `src/app/components/cockpit/CockpitPanel.tsx`
- `src/app/components/cockpit/EnrollmentForm.tsx`
- `src/app/components/cockpit/UserSelector.tsx`

**完了条件**:
- [ ] 声紋データがBase64でDBに保存される
- [ ] ユーザー一覧が取得できる
- [ ] ユーザー選択が機能する

#### GitHub Issue #8: Picovoice統合
- Mode A: WakeWord (Porcupine)
- Mode B: Voiceprint Gating (Eagle)
- ゲート処理の検証

**実装ファイル**:
- `src/app/components/voice/PicovoiceProvider.tsx`
- `src/app/components/voice/WakeWordDetector.tsx`
- `src/app/components/voice/VoiceprintGate.tsx`

**完了条件**:
- [ ] Porcupine WakeWord検知が機能
- [ ] Eagle 声紋認証が機能
- [ ] ゲート処理が正しく動作

#### GitHub Issue #9: Camera Bridge (Client Side Tool)
- capture_image指示の受信
- Webカメラキャプチャ → Base64
- VAPI経由でGPT-4o Visionへ送信

**実装ファイル**:
- `src/app/components/camera/CameraBridge.tsx`
- `src/app/components/camera/CaptureButton.tsx`

**完了条件**:
- [ ] カメラキャプチャが機能
- [ ] Base64変換が正しく行われる
- [ ] VAPIへの送信が機能

---

### Phase 5: シミュレーションUI (#4, #5完了後)

#### GitHub Issue #10: Simulation Tools + Debug Console UI
- Location Simulator (緯度経度/地名入力)
- Notification Simulator (テキスト入力)
- POST /api/simulate/location
- POST /api/simulate/notification
- Conversation Log (会話履歴表示)
- Voice Interface (VAPI接続・Mute/Unmute)
- 全コンポーネントを1画面に統合

**実装ファイル**:
- `src/app/api/simulate/location/route.ts`
- `src/app/api/simulate/notification/route.ts`
- `src/app/components/simulator/LocationSimulator.tsx`
- `src/app/components/simulator/NotificationSimulator.tsx`
- `src/app/components/simulator/SimulatorPanel.tsx`
- `src/app/components/log/ConversationLog.tsx`
- `src/app/components/voice/VoiceInterface.tsx`
- `src/app/page.tsx` (統合)

**完了条件**:
- [ ] 位置シミュレータが機能
- [ ] 通知シミュレータが機能
- [ ] 会話ログがリアルタイム表示される
- [ ] Voice Interfaceでセッション制御可能
- [ ] 全コンポーネントが1画面に統合

---

### Phase 6: 統合・検証 (全Phase完了後)

#### GitHub Issue #11: E2Eテスト・検証
- 全APIの疎通確認
- シミュレータによるバックエンドテスト
- 記憶システムの動作確認

**完了条件**:
- [ ] 全API疎通確認完了
- [ ] バックエンドロジック検証完了
- [ ] クライアント機能検証完了

---

## DAG (Directed Acyclic Graph)

```
Phase 1 (並行可能):
#1 (Setup) ─────────┬───────────────────────────────────────┐
#2 (Supabase) ──────┤                                        │
#12 (Google OAuth) ─┤                                        │
#14 (Test Setup) ───┘                                        │
                    │                                        │
                    ▼                                        │
Phase 2:       #3 (Session API) ◄── #13 (VAPI設定) ─────────┤
                    │                                        │
                    ├──► #4 (Memory) ◄── #13 (Webhook) ─────┤
                    │                                        │
Phase 3:            ├──► #5 (Tools) ◄── #12 (OAuth) ────────┤
                    │                                        │
                    ├──► #6 (Location) ◄── #12 (OAuth) ─────┤
                    │                                        │
Phase 4:            ├──► #7 (Cockpit API/UI) ───────────────┤
                    │                                        │
                    ├──► #8 (Picovoice) ────────────────────┤
                    │                                        │
                    └──► #9 (Camera) ───────────────────────┤
                                                             │
Phase 5:   #4, #5, #6 ──► #10 (Simulator + UI) ─────────────┤
                                                             │
                                                             ▼
Phase 6:                                              #11 (E2E Test)
```

### 依存関係まとめ

| Issue | 依存先 |
|-------|--------|
| #1, #2, #12, #14 | なし（並行可能） |
| #3 | #1, #2 |
| #13 | #1 |
| #4 | #3, #13 |
| #5, #6 | #3, #12 |
| #7, #8, #9 | #3 |
| #10 | #4, #5, #6 |
| #11 | 全Issue |

## クリティカルパス

```
#1 → #3 → #4 → #10 → #11
         ↑
   #2, #12, #13 (並行)
```

このパスが最も長い依存チェーンであり、プロジェクト全体のスケジュールを決定する。

**Note**: #12 (Google OAuth) は #5, #6 のブロッカーとなるため、Phase 1で早期に着手することを推奨。

## 検証チェックリスト

### API疎通確認 (High Priority)
- [ ] POST /api/session → VAPIトークン発行成功
- [ ] POST /api/webhooks/call-ended → Fact抽出・保存成功
- [ ] POST /api/tools/* → 各外部API連携成功
- [ ] POST /api/simulate/* → 割り込み発話成功
- [ ] POST /api/cockpit/enroll → 声紋データ保存成功

### バックエンドロジック (High Priority)
- [ ] Fact抽出ロジックが正しく動作
- [ ] System Prompt注入が機能
- [ ] ジオフェンス判定が正しく動作
- [ ] 割り込み通知がTTS生成

### クライアント (Low Priority)
- [ ] Porcupine WakeWord検知
- [ ] Eagle 声紋認証
- [ ] カメラキャプチャ → Base64送信

---

## Phase 7: VAPI Web SDK統合 (Issue #15)

### 概要
VoiceInterfaceコンポーネントに実際のVAPI音声接続（WebRTC）を実装する。
現在はセッション作成APIを呼んでいるが、実際の音声通話は確立されていない。

### 必要な作業
1. `@vapi-ai/web` パッケージインストール（済み、スタッシュ内）
2. `.env`に`NEXT_PUBLIC_VAPI_ASSISTANT_ID`追加
3. `src/app/hooks/useVapi.ts` 作成（VAPI SDKラッパーフック）
4. `src/app/components/voice/VoiceInterface.tsx` 修正

### 実装ファイル
- `src/app/hooks/useVapi.ts` (新規作成)
- `src/app/components/voice/VoiceInterface.tsx` (修正)

### 完了条件
- [ ] Start Sessionボタンで音声通話が開始される
- [ ] マイク入力がVAPIに送信される
- [ ] AIアシスタントの応答が音声で再生される
- [ ] 会話ログにトランスクリプトが表示される
- [ ] Mute/Unmuteが機能する
- [ ] End Sessionで通話が終了する

### スタッシュされた作業
```bash
git stash list
# stash@{0}: On main: WIP: VAPI SDK integration for voice interface
```

### 詳細計画
`/home/mizuki/.claude/plans/purring-churning-koala.md` を参照
