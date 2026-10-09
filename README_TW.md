# ADAM — 抗菌肽資料庫入口網站

一個用於瀏覽、搜尋與預測抗菌肽（AMP）活性的精選網路入口。基於國立臺灣海洋大學原始 ADAM 資料庫建置，搭配現代化介面與整合預測工具。

---

## 🌐 系統概述

ADAM 是一個綜合性的抗菌肽資料庫，收錄 **26,788 筆肽段條目**，並附有完整的結構、生物與文獻標註資訊。本入口提供：

- 跨 29 個肽段屬性的進階多欄位搜尋
- 基於 SVM 與 HMM 機率輪廓的 AMP / 非 AMP 二元分類（即時、輕量）
- 基於 ESMC 的 AMP / 非 AMP 二元分類（凍結的 ESM Cambrian 嵌入 — EvolutionaryScale 最新的蛋白質語言模型）
- 基於 FLM 的分類（在 AMP 資料庫上端對端微調的 ESM-2）
- 結構相似性搜尋（Foldseek）
- 序列相似性搜尋（MMseqs2）
- 群集列表與肽段詳細頁面

---

## ⚙️ 系統需求

### 作業系統
- Windows 10 / 11（64 位元）
- WSL2（Windows Linux 子系統）— 用於 MMseqs2 和 Foldseek
- 至少 8 GB 記憶體
- 至少 10 GB 可用磁碟空間

### 後端
| 工具 | 版本 | 用途 |
|---|---|---|
| Node.js | v18+ | 後端伺服器 |
| npm | v9+ | 套件管理器 |
| Python | 3.12+ | SVM / HMM / ESMC / FLM 預測流程 |
| PyTorch | 2.x | 模型推論／微調 |
| Transformers | 最新版 | ESMC（`Synthyra/ESMplusplus_small`）與 ESM-2（`facebook/esm2_t6_8M_UR50D`，FLM 的基底）檢查點 |
| einops | 最新版 | ESMC 遠端模型程式碼所需 |
| Flask | 最新版 | `python/serve.py` — 常駐推論伺服器（4 個模型僅載入一次，透過 HTTP 呼叫） |
| scikit-learn | 最新版 | SVM／ESMC 分類頭 |

### 前端
| 工具 | 版本 | 用途 |
|---|---|---|
| React | 18 | UI 框架 |
| Vite | 最新版 | 開發伺服器 |
| React Router | v6 | 頁面路由 |

### 搜尋（WSL2）
| 工具 | 版本 | 用途 |
|---|---|---|
| WSL2 Ubuntu | 2 | 執行 Foldseek/MMseqs2 — Windows 無法原生執行 Linux 執行檔 |
| Foldseek | 最新版 | 結構相似性搜尋，由 `server.js` 透過 `wsl.exe` 呼叫 |
| MMseqs2 | 最新版 | 序列相似性搜尋，由 `server.js` 透過 `wsl.exe` 呼叫 |

---

## 📁 資料夾結構

```
Final Project/
├── start-all.ps1              # 單一啟動入口 — 自動訓練缺少的模型並啟動所有服務
├── start-all.bat              # start-all.ps1 的雙擊執行包裝
└── amp-portal/
    ├── src/
    │   ├── Components/           # React 頁面元件
    │   │   ├── HomePage.jsx
    │   │   ├── Search.jsx
    │   │   ├── Result.jsx
    │   │   ├── PredictionSystem.jsx
    │   │   ├── SVMPrediction.jsx
    │   │   ├── HMMPrediction.jsx
    │   │   ├── ESMCPrediction.jsx
    │   │   ├── FLMPrediction.jsx
    │   │   ├── StructureSearch.jsx
    │   │   ├── SequenceSearch.jsx
    │   │   ├── ClusterList.jsx
    │   │   └── Guide.jsx
    │   ├── Layout.jsx            # 導覽列與頁尾
    │   ├── App.jsx               # 路由定義
    │   ├── api.js                # API 基礎網址
    │   └── index.css
    └── server/
        ├── server.js             # Express 後端 — 將 /api/predict/* 轉發至 serve.py
        ├── ADAMV2(2).xlsx        # 肽段資料庫（26,788 筆）
        ├── feedback.json         # 使用者回饋儲存
        └── python/               # 預測流程
            ├── common.py         # 共用的 FASTA 解析、資料集載入、特徵萃取
            ├── serve.py          # 常駐推論伺服器 — 4 個模型僅載入一次（Flask，5100 埠）
            ├── train_svm.py      # 訓練 SVM 組成特徵分類器
            ├── train_hmm.py      # 建立 AMP 位置頻率輪廓
            ├── train_esmc.py     # 訓練凍結 ESMC 嵌入的分類頭
            ├── train_flm.py      # 端對端微調 ESM-2
            ├── svm_model.pkl     # 訓練好的 SVM（產生檔案）
            ├── hmm_model.pkl     # 訓練好的 HMM 輪廓（產生檔案）
            ├── esmc_head.pkl     # 訓練好的 ESMC 分類頭（產生檔案）
            └── flm_model/        # 微調後的 FLM 模型權重（產生檔案）
```

Foldseek/MMseqs2 的執行檔與搜尋資料庫存放在 WSL2 內（不在上方的 Windows 資料夾樹中），預設位於 WSL 使用者家目錄下的 `~/foldseek/`、`~/mmseqs/` 與 `~/adam_db/`（`seq_db`、`struct_db`、`tmp`）。`server.js` 透過檔案開頭的硬編碼路徑（`FOLDSEEK_BIN`、`MMSEQS_BIN`、`STRUCT_DB`、`SEQ_DB`）與其串接 — 若你的 WSL 使用者名稱或安裝位置不同，請自行修改。詳見下方「搜尋資料庫設定（WSL2）」。

---

## 🚀 執行方式

### 一次性設定

```powershell
cd "D:\Final Project\amp-portal"
npm install

cd "D:\Final Project\amp-portal\src\server"
npm install

cd "D:\Final Project\amp-portal\src\server\python"
pip install -r requirements.txt
```

### 之後每次 — 一個指令搞定

雙擊 **`start-all.bat`**（或在專案根目錄執行 `powershell -ExecutionPolicy Bypass -File start-all.ps1`）。它會：
1. 自動訓練尚未訓練的預測模型（已訓練好的會跳過 — 只有第一次執行會花較久時間，尤其是 ESMC／FLM）。
2. 開啟三個視窗：Python 推論伺服器（`serve.py`，5100 埠）、Node 後端（`server.js`，5000 埠）、Vite 開發伺服器（5173 埠）。

接著前往：
```
http://localhost:5173
```

關閉視窗即可停止對應服務。之後可隨時重新執行 `start-all.bat` — 它會沿用已訓練好的模型，只重新啟動三個伺服器。

<details>
<summary>改為手動個別啟動</summary>

```powershell
# 終端機 1 — 推論伺服器
cd "D:\Final Project\amp-portal\src\server\python"
python serve.py

# 終端機 2 — 後端
cd "D:\Final Project\amp-portal\src\server"
node server.js

# 終端機 3 — 前端
cd "D:\Final Project\amp-portal"
npm run dev
```
</details>

---

## ✨ 功能介紹

### 🔍 搜尋 AMP
透過 5 大類別的 29 個欄位篩選肽段：
- **肽段識別** — 名稱、來源、分類學、Uniprot ID、PDB ID
- **序列** — 序列、最小／最大長度
- **生物學** — 活性、家族、基因、標靶、溶血活性、細胞毒性
- **結構** — 結構、線性／環狀／分支、修飾、立體化學
- **文獻** — PubMed ID、參考文獻、作者、標題、驗證

### 🤖 SVM 預測
- 輸入：FASTA 格式肽段序列
- 輸出：AMP / 非 AMP 分類與決策分數
- 流程：胺基酸組成特徵（與原始 ADAM SVM 相同的 20 維特徵表示法與 `[-1,1]` 縮放）→ SVC
- 即時 — 每次請求不需重新載入模型（由 `serve.py` 提供服務）

### 🧬 HMM 預測
- 輸入：FASTA 格式肽段序列
- 輸出：AMP / 非 AMP 分類與對數勝算分數
- 流程：由已知 AMP 序列建立位置頻率輪廓，與背景胺基酸分布比對評分
- 即時 — 每次請求不需重新載入模型

### 🧠 ESMC 預測
- 輸入：FASTA 格式肽段序列
- 輸出：AMP / 非 AMP 分類與信心分數
- 流程：凍結的 `Synthyra/ESMplusplus_small`（ESMC-300M，EvolutionaryScale 最新模型，透過相容 `transformers` 的社群移植版）嵌入 → 邏輯迴歸分類頭
- 約 3 億參數，遠大於舊版 8M 的 ESM-2 檢查點 — 在僅有 CPU 的硬體上，因需使用 `eager` attention（無 GPU 核心可用），每序列速度明顯較慢（數秒）

### 🧬 FLM 預測
- 輸入：FASTA 格式肽段序列
- 輸出：AMP / 非 AMP 分類與信心分數
- 流程：在 AMP 資料庫上端對端微調的 `facebook/esm2_t6_8M_UR50D`
- 維持使用較小的 ESM-2 基底而非 ESMC — 在僅有 CPU 的硬體上，對 3 億參數模型進行完整反向傳播微調並不實際
- 支援多序列輸入

### 🏗️ 結構搜尋
- 輸入：PDB 結構檔案
- 輸出：結構相似的 AMP，附同一性、比對長度與 E 值
- 流程：`foldseek easy-search`（透過 WSL2）比對由本站 PDB 結構檔建立的 Foldseek 資料庫

### 🔗 序列搜尋
- 輸入：FASTA 序列
- 輸出：相似序列，附同一性、比對長度、E 值與比對到的目標序列
- 流程：`mmseqs easy-search`（透過 WSL2）比對由肽段資料庫全部 26,788 筆序列建立的 MMseqs2 資料庫

### 📋 群集列表
- 瀏覽依序列相似性組織的肽段群集

### 📖 說明
- 逐步使用指南
- 聯絡與回饋表單

---

## 🛠️ 搜尋資料庫設定（WSL2）

結構／序列搜尋需要 WSL2，並建立好 Foldseek 與 MMseqs2 資料庫。這是一次性設定 — `server.js` 會在請求時透過 `wsl.exe` 呼叫這些執行檔與資料庫。

### 安裝 WSL2
```powershell
wsl --install
```
重新啟動電腦後，從開始功能表開啟 Ubuntu。

### 安裝 MMseqs2 與 Foldseek
```bash
wget https://mmseqs.com/latest/mmseqs-linux-avx2.tar.gz
tar xvzf mmseqs-linux-avx2.tar.gz

wget https://mmseqs.com/foldseek/foldseek-linux-avx2.tar.gz
tar xvzf foldseek-linux-avx2.tar.gz
```

### 建立搜尋資料庫
在 WSL 中，從肽段資料庫建立 MMseqs2 序列資料庫，並從本站 PDB 檔案建立 Foldseek 結構資料庫：
```bash
mkdir -p ~/adam_db/tmp

# 先將 ADAMV2(2).xlsx 的序列匯出成 FASTA（見 amp-portal/src/server，一次性 Node 腳本），然後：
~/mmseqs/bin/mmseqs createdb /mnt/d/.../all_sequences.fasta ~/adam_db/seq_db

~/foldseek/bin/foldseek createdb "/mnt/d/Final Project/amp-portal/public/pdb" ~/adam_db/struct_db
```
請依實際路徑／使用者名稱調整 `server.js` 檔案開頭的 `FOLDSEEK_BIN`、`MMSEQS_BIN`、`STRUCT_DB`、`SEQ_DB`。

---

## 📄 授權

© 2025 國立臺灣海洋大學。保留所有權利。
原始 ADAM 資料庫：國立臺灣海洋大學生物資訊實驗室。
