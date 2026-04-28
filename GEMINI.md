# 概要
- 分散SNSソフトウェア `Misskey`のミニマルなCLIクライアントを作りたい
  - ここではその内の、タイムライン閲覧に特化したコマンドとしたいです
  - 他の機能は他のコマンドとして別プロジェクトに分け、最終的には`tmux`とかで併用できたらいいかなと

# 環境
- Linux (w/ ANSI Escape Sequence)
- Some terminal emurator
- Node.js (npm, ESModule)
- Any other?

---

# 詳細

## 大まかな流れ

1. コマンドライン引数を読み込む
2. `env.json`ファイルからAPIトークンを読み出す
3. APIトークンを使ってMisskeyサーバの"ストリーミングAPI"のタイムライン用チャンネルに接続する
4. 取得した投稿を1文字ずつ標準出力する
5. `Ctrl+C`か何かで終了

ストリーミングAPIについては以下を参照のこと:
https://misskey-hub.net/ja/docs/for-developers/api/streaming/

## インターフェース

### env.json

``` json
{
  "profiles": [
    {
      "name": "alice",
      "server": "mi.tsujigoya.net",
      "token": "XXXXXXXX"
    }
  ] 
}
```

### コマンドライン引数
`index.js`参照。

---

## 方針
`概要`の記述も参照のこと。

`.env.json`ファイルの生成も別途スクリプトを用意するので、
ここではreadだけ考えればよいものとする。

変数はなるべく`const`を使って定義。

