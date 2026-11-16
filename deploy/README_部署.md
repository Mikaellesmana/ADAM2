# ADAM2 上線部署（實驗室 Windows 伺服器）

目標：把 ADAM2 架在實驗室伺服器（Windows 10，內網 `192.168.0.101`），
讓外部用 **http://140.121.197.183** 就能開啟網站。

```
訪客 ──► 140.121.197.183（實驗室路由器）──轉送 80 ──► 192.168.0.101:5000（伺服器上的 ADAM2）
```

伺服器上只需要開一個連接埠 **5000**：後端同時提供網頁與 API。

---

## 一、在開發電腦（已完成）

`deploy\make_bundle.ps1` 已產生 `ADAM2_server_bundle` 資料夾（約 1.3 GB），
內含 GitHub 沒有的檔案：

| 檔案 | 內容 |
|---|---|
| `esmc_flm_model_bal\model_state.pt` | 訓練好的 ESMC FLM 權重 |
| `search_tools.tar.gz` | MMseqs2、Foldseek 與比對資料庫 |

用 AnyDesk 的檔案傳輸（或隨身碟）把整個資料夾複製到伺服器的
`C:\ADAM2_server_bundle`。

## 二、在伺服器上

### 1. 下載專案
開啟「命令提示字元」：
```
git clone https://github.com/Mikaellesmana/ADAM2.git C:\ADAM2
```

### 2. 安裝 PostgreSQL 並匯入資料庫
1. 從 https://www.postgresql.org/download/windows/ 下載 PostgreSQL 17 安裝檔並安裝：
   連接埠保留 **5432**、保留 **Command Line Tools**，為 `postgres` 設定一組密碼並記住。
2. 雙擊 `C:\ADAM2\ADAM2_v10\import_v10.bat`，輸入 `Y`，再輸入密碼。
   最後的筆數應為 56621 / 57481 / 85398 / 21573 / 33541 / 7080。

### 3. 執行安裝腳本
右鍵「開始」→ **Windows PowerShell（系統管理員）**：
```
cd C:\ADAM2
powershell -ExecutionPolicy Bypass -File deploy\setup_server.ps1 -Bundle C:\ADAM2_server_bundle
```
腳本會自動安裝 Node.js、Python 與套件、建置網站、放入模型、安裝比對工具、
開放防火牆 5000 埠，並設定開機登入後自動啟動（當機會自動重啟）。

腳本若停下來顯示 **ACTION NEEDED**，照指示做完後**再執行同一行指令**即可：
- **WSL**：第一次會安裝 WSL，需**重新開機**；開機後 Ubuntu 視窗會要求設定
  Ubuntu 的使用者名稱與密碼（自訂即可）。
- **.env 密碼**：用記事本開啟 `C:\ADAM2\amp-portal\src\server\.env`，
  在 `PGPASSWORD=` 後面輸入 PostgreSQL 密碼並存檔。
  若要 AI 助理，再加上 `AI_PROVIDER=groq` 與 `GROQ_API_KEY=...`。

完成時會顯示：
```
ADAM2 is running.
  Entries loaded : 57481
  On this PC     : http://localhost:5000
  In the lab     : http://192.168.0.101:5000
```

### 4. 讓伺服器一直開著
- **設定 → 系統 → 電源與睡眠**：「睡眠」改為**永不**。
- 網站在使用者 `anna` 登入後啟動。若伺服器會重開機，請設定自動登入，
  或重開機後用 AnyDesk 登入一次。

## 三、路由器與學校網路（需要實驗室管理者）

1. 瀏覽器開 **http://192.168.0.1**，用路由器管理密碼登入。
2. **固定 IP**（DHCP 保留 / 靜態租約）：把 `192.168.0.101` 綁定給這台伺服器。
3. **連接埠轉送**（虛擬伺服器 / Port Forwarding）：
   外部埠 **80** → 內部 IP **192.168.0.101**、內部埠 **5000**，協定 TCP。
4. **測試**：用手機**關掉 Wi-Fi、用行動網路**開 http://140.121.197.183 。
   - 打得開：完成。
   - 打不開但實驗室內 http://192.168.0.101:5000 可以：學校防火牆擋住了外部連線，
     請系上或計網中心為 `140.121.197.183` 開放 TCP 80
     （也可順便申請網域名稱，例如 `adam2.cs.ntou.edu.tw`）。

## 四、之後更新網站

```
cd C:\ADAM2
git pull
powershell -ExecutionPolicy Bypass -File deploy\setup_server.ps1 -Bundle C:\ADAM2_server_bundle
```
資料庫更新時：重新執行 `ADAM2_v10\import_v10.bat`，再重新啟動：
```
powershell -ExecutionPolicy Bypass -File C:\ADAM2\portal-service.ps1 -Mode stop
powershell -ExecutionPolicy Bypass -File C:\ADAM2\portal-service.ps1 -Mode install
```

## 常用指令

| 目的 | 指令（在 `C:\ADAM2`） |
|---|---|
| 查看狀態 | `powershell -ExecutionPolicy Bypass -File portal-service.ps1 -Mode status` |
| 停止 | `powershell -ExecutionPolicy Bypass -File portal-service.ps1 -Mode stop` |
| 記錄檔 | `logs\portal\node.log`、`python.err` |
