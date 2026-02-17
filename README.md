<p align="center">
  <img src="assets/banner.png" alt="Suno BGM Player Banner" width="100%">
</p>

<h1 align="center">🎵 Suno BGM Player</h1>

<p align="center">
  <strong>Suno のトレンド曲やお気に入りアーティストの曲をシャッフル再生できる Chrome 拡張機能</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Manifest-V3-blue?style=flat-square" alt="Manifest V3">
  <img src="https://img.shields.io/badge/License-MIT-green?style=flat-square" alt="MIT License">
  <img src="https://img.shields.io/badge/Version-2.1.0-orange?style=flat-square" alt="Version 2.1.0">
  <img src="https://img.shields.io/badge/UI-Liquid%20Glass-blueviolet?style=flat-square" alt="Liquid Glass UI">
</p>

---

## 概要

**Suno BGM Player** は、AI音楽生成プラットフォーム [Suno](https://suno.com) の楽曲をワンクリックでBGMとして再生できる Chrome 拡張機能です。作業中やリラックスタイムに、Suno のトレンド曲を流したり、お気に入りのアーティストの曲だけを集めて聴くことができます。ポップアップを閉じてもバックグラウンドで再生が継続するため、ブラウジングの邪魔になりません。

UI は macOS の **Liquid Glass** にインスパイアされたダークグラスモーフィズムデザインを採用しており、半透明のすりガラス質感とアンバーのアクセントカラーが特徴です。

## スクリーンショット

<p align="center">
  <img src="assets/screenshot-trending.png" alt="トレンド再生画面" width="280">
  &nbsp;&nbsp;&nbsp;&nbsp;
  <img src="assets/screenshot-artist.png" alt="アーティスト指定画面" width="280">
</p>

<p align="center">
  <em>左: トレンド曲の再生画面 ／ 右: アーティスト指定で曲を読み込んだ画面</em>
</p>

## 主な機能

| 機能 | 説明 |
|:---|:---|
| **トレンド再生** | Suno のトレンドプレイリストから曲を自動取得して再生 |
| **アーティスト指定** | `@ハンドル名` を入力して特定アーティストの曲だけを再生 |
| **シャッフル再生** | ランダム順で曲を再生（ON/OFF 切替可） |
| **連続再生** | 曲が終わると自動で次の曲へ |
| **バックグラウンド再生** | ポップアップを閉じても音楽は止まらない |
| **基本コントロール** | 再生/一時停止、前/次の曲、音量調整 |
| **リピート** | プレイリスト全体のループ再生 |
| **プレイリスト表示** | 全曲一覧から好きな曲を選んで再生 |
| **設定の永続化** | 音量・シャッフル・リピート・最後のソースを記憶 |

## インストール

### 手動インストール（デベロッパーモード）

1. このリポジトリを clone またはダウンロードします

   ```bash
   git clone https://github.com/aigeboku/suno-bgm-player.git
   ```

2. Chrome で `chrome://extensions` を開きます

3. 右上の **「デベロッパーモード」** を ON にします

4. **「パッケージ化されていない拡張機能を読み込む」** をクリックします

5. clone した `suno-bgm-player` フォルダを選択します

6. ツールバーにアイコンが表示されたら完了です

## 使い方

### トレンド曲を聴く

ツールバーのアイコンをクリックしてプレイヤーを開き、**「トレンド」** タブが選択された状態で再生ボタンを押すだけです。Suno で人気の曲がシャッフル再生されます。

### アーティストの曲を聴く

**「アーティスト」** タブをクリックし、検索欄にハンドル名（例: `lightjourner`）を入力して矢印ボタンを押します。そのアーティストの公開曲がプレイリストに読み込まれます。Suno のプロフィール URL（`https://suno.com/@lightjourner`）をそのまま貼り付けることもできます。

### 操作方法

| 操作 | 説明 |
|:---|:---|
| ▶️ 再生ボタン | 再生 / 一時停止の切替 |
| ⏮ ⏭ | 前の曲 / 次の曲 |
| 🔀 シャッフル | ランダム再生の ON/OFF |
| 🔁 リピート | プレイリストループの ON/OFF |
| 🔊 音量スライダー | 音量調整（0〜100%） |
| 🔄 更新ボタン | プレイリストを最新の状態に更新 |
| 📋 プレイリスト | 全曲一覧を展開、曲をクリックで直接再生 |

## プロジェクト構成

```
suno-bgm-player/
├── manifest.json          # Chrome 拡張機能マニフェスト (V3)
├── popup.html             # ポップアップ UI
├── offscreen.html         # オフスクリーンドキュメント（オーディオ再生用）
├── css/
│   └── popup.css          # ポップアップのスタイル
├── js/
│   ├── background.js      # サービスワーカー（曲管理・再生制御）
│   ├── popup.js           # ポップアップ UI ロジック
│   └── offscreen.js       # オフスクリーンオーディオプレイヤー
├── icons/                 # 拡張機能アイコン（16/48/128px）
├── assets/                # README 用画像素材
│   ├── banner.png
│   ├── icon512.png
│   ├── screenshot-trending.png
│   └── screenshot-artist.png
├── LICENSE
└── README.md
```

## 技術的な仕組み

**Suno BGM Player** は Chrome Manifest V3 の **Offscreen Document API** を活用して、バックグラウンドでのオーディオ再生を実現しています。

Suno のページ（トレンドプレイリストやアーティストプロフィール）から SSR（サーバーサイドレンダリング）データを解析して曲情報（ID、タイトル）を抽出し、Suno の CDN（`cdn1.suno.ai/{id}.mp3`）から直接 MP3 ストリームを再生します。設定は `chrome.storage.local` に永続化されるため、ブラウザを再起動しても前回の状態が復元されます。

UI は CSS の `backdrop-filter: blur()` と半透明レイヤーを組み合わせた **ダークグラスモーフィズム** で構築されています。背景にはパープル/ブルーのアンビエントグラデーション、各要素には微妙な光の反射とアンバーのアクセントグローを配置し、macOS Liquid Glass のような奥行きのある質感を実現しています。

## 注意事項

この拡張機能は Suno の公式プロダクトではありません。Suno のサービス利用規約に従ってご利用ください。Suno のサイト構造が変更された場合、曲の取得が正常に動作しなくなる可能性があります。

## ライセンス

[MIT License](LICENSE)
