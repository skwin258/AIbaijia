# SK AI 部署說明

這個專案已整理成兩種部署方式：

- 本機 / VPS Node：使用 `server.js`
- Cloudflare Workers：使用 `worker/index.js`、`wrangler.jsonc`、Cloudflare KV

## 必要環境變數

正式部署請把預設密碼改掉。

```env
PORT=3000
HOST=0.0.0.0
SUPERADMIN_USERNAME=koko85830
SUPERADMIN_PASSWORD=請改成正式強密碼
DATA_DIR=/app/data
```

`DATA_DIR` 必須放在平台的持久化磁碟，否則重新部署後後台使用者資料可能消失。

## Cloudflare Workers + GitHub 部署

### 1. 推到 GitHub

在電腦安裝 Git 後：

```bash
git init
git add .
git commit -m "Initial SK AI deployment"
git branch -M main
git remote add origin https://github.com/你的帳號/你的倉庫.git
git push -u origin main
```

### 2. 建立 Cloudflare KV

Cloudflare Dashboard：

1. Workers & Pages
2. KV
3. Create namespace
4. 建立 `SK_DATA`
5. 複製 namespace ID
6. 把 `wrangler.jsonc` 裡的 `REPLACE_WITH_PRODUCTION_KV_ID` 換成該 ID

### 3. 設定 Cloudflare Worker

Cloudflare Dashboard：

1. Workers & Pages
2. Create application
3. Workers
4. Connect to Git
5. 選 GitHub repo
6. Framework preset 選 None
7. Build command 留空
8. Deploy command 使用：

```bash
npx wrangler deploy
```

### 4. 設定 Cloudflare 環境變數

Cloudflare Worker Settings 裡設定：

```env
SUPERADMIN_USERNAME=koko85830
SUPERADMIN_PASSWORD=請換成正式強密碼
```

並確認 KV binding：

```text
Binding name: SK_DATA
Namespace: SK_DATA
```

## 部署後要確認

部署完成後確認：

- `/` 首頁可以開
- `/admin.html` 後台可以登入
- `/shortcut.html?token=...` 使用者安裝頁可以開
- `/api/access/validate?token=...` 可以回傳授權狀態
- 網址必須是 HTTPS，否則 iPhone Safari 可能會擋外掛載入

## 重要提醒

不要在正式環境使用預設密碼。正式部署前請把 `SUPERADMIN_PASSWORD` 換掉。
