# Apify Store 競合スキャン: Actor#3 不動産取引価格（2026-07-09・実装前スキャン）

調査方法: Store検索API＋Actorページ・詳細API。**公開直前の最終スキャンは受入基準6として人間タスク**（人間タスク・Notionで管理）。

## 結論

完全競合2件・合計3ユーザー・レビュー0で市場はほぼ未開拓。**「reinfolib公式API×ユーザー側のキー申請不要（ゼロ設定）×日英二言語」のポジションは無人**。README第1段落の差別化はこれを事実ベースで主張（競合の名指しはしない）。

## 完全競合

1. **rationalistic_counsel/mlit-japan-real-estate-prices**（reinfolib直系・既知競合）
   - **BYOキー設計**: ユーザー自身がreinfolibへAPIキーを申請（約5営業日待ち）し入力必須
   - PPE: 起動$0.00005＋1件$0.00001（底値）。**ユーザー1・累計8実行**（2026-03公開）・レビュー0
   - 47都道府県・2005年〜・29フィールド・en/ja、レート1コール/3秒明記
2. **parseforge/mlit-japan-real-estate-prices-scraper**（旧WebLand API系）
   - キー不要だが**旧「土地総合情報システム」API依存**（reinfolibの前身。継続性リスクは推測）
   - 出力10フィールドと浅い。$0.0085/件と高価。ユーザー2・レビュー0

## 近接（非直接競合）

SUUMO等の民間ポータルスクレイパー群（最大59ユーザー）＝掲載情報であり成約・取引価格ではない。日本不動産データの需要自体は存在する示唆。

## 差別化（README第1段落・事実のみ）

ゼロ設定（キー申請・数営業日の待ちが不要、実行ボタンだけ）／取引価格・成約価格の両対応（priceClassification）／市区町村×四半期の集計同梱（追加課金なし）／snake_case＋`*_ja`二言語／"Tested against frozen datasets on every release"。価格競争には応じない（marketing.md §9）。
