# Voice Engine Studio - 引き継ぎドキュメント

## 新しいチャットで伝えること

以下をコピーして新しいチャットに貼り付けてください：

---

Voice Engine Studioプロジェクトの開発を続けてください。

## 現在の状態
- プロジェクト: `/home/mizuki/dev/voice-engine-studio`
- 全APIは実装完了、テストも通過
- **Issue #15** が作業中: VAPI Web SDKで実際の音声通話を実装

## やるべきこと
Issue #15: VAPI Web SDK統合
- 現在VoiceInterfaceはセッションAPIを呼ぶが、実際の音声接続がない
- `@vapi-ai/web` SDKを使って音声通話を確立する必要がある

## スタッシュされた作業
```bash
git stash list  # WIP: VAPI SDK integration
git stash pop   # 作業を復元
```

## 必要な環境変数追加
`.env`に追加:
```
NEXT_PUBLIC_VAPI_ASSISTANT_ID=ab86c67d-ec15-4d1a-af47-5b9bc6239121
```

## 参照すべきドキュメント
- 詳細計画: `/home/mizuki/.claude/plans/purring-churning-koala.md`
- 作業ログ: `docs/logs/2026-01-24-001.md`
- セッションサマリー: `docs/SESSION_SUMMARY.md`
- 実装計画: `docs/IMPLEMENTATION_PLAN.md`

## 起動方法
```bash
npm run dev    # 開発サーバー
ngrok http 3000  # Webhook用トンネル（別ターミナル）
```

## モデル設定
GPT 5.2を使用（VAPIダッシュボードで確認可能）

---

## 環境情報まとめ

| 項目 | 値 |
|------|-----|
| Supabase Project | diaroeomiyinntmjrpuw |
| VAPI Assistant ID | ab86c67d-ec15-4d1a-af47-5b9bc6239121 |
| Google Cloud Project | whisper-poc-485210 |

## Open Issues
- #8: Picovoice統合（低優先度）
- #9: Camera Bridge（低優先度）
- #15: VAPI Web SDK統合（**作業中**）
