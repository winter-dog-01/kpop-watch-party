# 🎵 K-Pop 觀看派對

一個讓 K-pop 粉絲可以一起觀看 YouTube 視頻並實時聊天、發送彈幕的網站。

## ✨ 功能特色

- 🎬 **YouTube 視頻同步** - 所有用戶同步觀看視頻
- 💬 **實時聊天** - 房間內即時聊天功能
- 💨 **彈幕系統** - 全屏幕飄浮彈幕評論
- 🏠 **房間管理** - 創建公開/私人房間
- 🎨 **自定義主題** - 自定義背景和主題顏色
- 👥 **多用戶支援** - 支援多人同時在線

## 🚀 部署到 Render

1. Fork 這個存儲庫
2. 在 Render.com 創建新的 Web Service
3. 連接你的 GitHub 存儲庫
4. 使用以下設置：
   - **Build Command**: `cd server && npm install`
   - **Start Command**: `cd server && npm start`
   - **Environment**: Node.js

## 🛠️ 本地開發

### 前置需求
- Node.js 16+ 
- npm

### 安裝步驟

1. 克隆存儲庫：
```bash
git clone https://github.com/你的用戶名/kpop-watch-party.git
cd kpop-watch-party
```

2. 安裝依賴：
```bash
cd server
npm install
```

3. 啟動服務器：
```bash
npm start
```

4. 打開瀏覽器訪問：
```
http://localhost:3000
```

## 📁 項目結構

```
kpop-watch-party/
├── index.html          # 首頁
├── room.html           # 房間頁面
├── css/                # 樣式文件
├── js/                 # JavaScript 文件
├── server/             # 後端服務器
└── README.md           # 項目說明
```

## 🌍 線上演示

[在這裡查看線上演示](https://你的應用名稱.onrender.com)

## 📝 待辦事項

- [ ] 添加用戶註冊/登入
- [ ] 房間管理員功能
- [ ] 更多彈幕效果
- [ ] 移動端優化
- [ ] 視頻播放清單功能

## 🤝 貢獻

歡迎提交 Issue 和 Pull Request！

## 📄 許可證

MIT License