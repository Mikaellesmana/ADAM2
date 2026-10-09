# ADAM — Antimicrobial Peptide Database Portal

A curated web portal for browsing, searching, and predicting antimicrobial peptide (AMP) activity. Built on the original ADAM database from National Taiwan Ocean University, with an updated modern interface and integrated prediction tools.

---

## 🌐 Overview

ADAM is a comprehensive antimicrobial peptide database containing **26,788 peptide entries** with full structural, biological, and literature annotations. The portal provides:

- Advanced multi-field search across 29 peptide properties
- SVM-based and HMM profile-based binary AMP / Non-AMP classification (instant, lightweight)
- ESMC-based binary AMP / Non-AMP classification (frozen ESM Cambrian embeddings — EvolutionaryScale's newest protein language model)
- FLM-based classification (ESM-2 fine-tuned end-to-end on the AMP database)
- Structure similarity search (Foldseek)
- Sequence similarity search (MMseqs2)
- Clustering list and peptide detail pages

---

## ⚙️ Requirements

### System
- Windows 10 / 11 (64-bit)
- WSL2 (Windows Subsystem for Linux) — for MMseqs2 and Foldseek
- At least 8 GB RAM
- At least 10 GB free disk space

### Backend
| Tool | Version | Purpose |
|---|---|---|
| Node.js | v18+ | Backend server |
| npm | v9+ | Package manager |
| Python | 3.12+ | SVM / HMM / ESMC / FLM prediction pipeline |
| PyTorch | 2.x | Model inference / fine-tuning |
| Transformers | latest | ESMC (`Synthyra/ESMplusplus_small`) and ESM-2 (`facebook/esm2_t6_8M_UR50D`, FLM's base) checkpoints |
| einops | latest | Required by ESMC's remote model code |
| Flask | latest | `python/serve.py` — persistent inference server (all 4 models loaded once, called over HTTP) |
| scikit-learn | latest | SVM / ESMC classifier heads |

### Frontend
| Tool | Version | Purpose |
|---|---|---|
| React | 18 | UI framework |
| Vite | Latest | Development server |
| React Router | v6 | Page routing |

### Search (WSL2)
| Tool | Version | Purpose |
|---|---|---|
| WSL2 Ubuntu | 2 | Runs Foldseek/MMseqs2 — Windows can't execute Linux binaries natively |
| Foldseek | latest | Structure similarity search, spawned by `server.js` via `wsl.exe` |
| MMseqs2 | latest | Sequence similarity search, spawned by `server.js` via `wsl.exe` |

---

## 📁 Folder Structure

```
Final Project/
├── start-all.ps1              # Single entry point — trains missing models, starts everything
├── start-all.bat              # Double-click wrapper for start-all.ps1
└── amp-portal/
    ├── src/
    │   ├── Components/           # React page components
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
    │   ├── Layout.jsx            # Navigation and footer
    │   ├── App.jsx               # Route definitions
    │   ├── api.js                # API base URL
    │   └── index.css
    └── server/
        ├── server.js             # Express backend — proxies /api/predict/* to serve.py
        ├── ADAMV2(2).xlsx        # Peptide database (26,788 entries)
        ├── feedback.json         # User feedback storage
        └── python/               # Prediction pipeline
            ├── common.py         # shared FASTA parsing, dataset loading, feature extraction
            ├── serve.py          # persistent inference server — loads all 4 models once (Flask, port 5100)
            ├── train_svm.py      # trains the SVM composition-feature classifier
            ├── train_hmm.py      # builds the AMP position-frequency profile
            ├── train_esmc.py     # trains the frozen-ESMC-embedding classifier head
            ├── train_flm.py      # fine-tunes ESM-2 end-to-end
            ├── svm_model.pkl     # trained SVM (generated)
            ├── hmm_model.pkl     # trained HMM profile (generated)
            ├── esmc_head.pkl     # trained ESMC classifier head (generated)
            └── flm_model/        # fine-tuned FLM model weights (generated)
```

Foldseek/MMseqs2 binaries and search databases live inside WSL2 (not the Windows folder tree above), by default under `~/foldseek/`, `~/mmseqs/`, and `~/adam_db/` (`seq_db`, `struct_db`, `tmp`) in the WSL user's home directory. `server.js` bridges to them via hardcoded paths at the top of the file (`FOLDSEEK_BIN`, `MMSEQS_BIN`, `STRUCT_DB`, `SEQ_DB`) — update those if your WSL username or install location differs. See "Search Database Setup (WSL2)" below.

---

## 🚀 How to Run

### One-time setup

```powershell
cd "D:\Final Project\amp-portal"
npm install

cd "D:\Final Project\amp-portal\src\server"
npm install

cd "D:\Final Project\amp-portal\src\server\python"
pip install -r requirements.txt
```

### Every time — one command

Double-click **`start-all.bat`** (or run `powershell -ExecutionPolicy Bypass -File start-all.ps1` from the project root). It:
1. Trains any prediction model that isn't trained yet (skips ones that already exist — only the very first run takes a while, ESMC/FLM in particular).
2. Opens three windows: the Python inference server (`serve.py`, port 5100), the Node backend (`server.js`, port 5000), and the Vite dev server (port 5173).

Then open:
```
http://localhost:5173
```

Close a window to stop that service. Re-run `start-all.bat` any time — it reuses already-trained models and just restarts the three servers.

<details>
<summary>Running each piece manually instead</summary>

```powershell
# Terminal 1 — inference server
cd "D:\Final Project\amp-portal\src\server\python"
python serve.py

# Terminal 2 — backend
cd "D:\Final Project\amp-portal\src\server"
node server.js

# Terminal 3 — frontend
cd "D:\Final Project\amp-portal"
npm run dev
```
</details>

---

## ✨ Features

### 🔍 Search AMP
Filter peptides by 29 fields across 5 categories:
- **Peptide Identification** — Name, Source, Taxonomy, Uniprot ID, PDB ID
- **Sequence** — Sequence, Min/Max Length
- **Biological** — Activity, Family, Gene, Targets, Hemolytic Activity, Cytotoxicity
- **Structural** — Structure, Linear/Cyclic/Branched, Modifications, Stereochemistry
- **Literature** — PubMed ID, Reference, Author, Title, Validation

### 🤖 SVM Prediction
- Input: FASTA format peptide sequence(s)
- Output: AMP / Non-AMP classification with a decision score
- Pipeline: amino-acid composition features (same 20-feature representation and `[-1,1]` scaling as the original ADAM SVM) → SVC
- Instant — no model loading per request (served by `serve.py`)

### 🧬 HMM Prediction
- Input: FASTA format peptide sequence(s)
- Output: AMP / Non-AMP classification with a log-odds score
- Pipeline: position-frequency profile built from curated AMP sequences, scored against the background amino-acid distribution
- Instant — no model loading per request

### 🧠 ESMC Prediction
- Input: FASTA format peptide sequence(s)
- Output: AMP / Non-AMP classification with confidence score
- Pipeline: frozen `Synthyra/ESMplusplus_small` (ESMC-300M, EvolutionaryScale's newest model, via a `transformers`-compatible community port) embeddings → logistic regression head
- ~300M params vs. the old 8M ESM-2 checkpoint — noticeably slower per sequence (a few seconds) on CPU-only hardware, since it needs `eager` attention (no GPU kernels available)

### 🧬 FLM Prediction
- Input: FASTA format peptide sequence(s)
- Output: AMP / Non-AMP classification with confidence score
- Pipeline: `facebook/esm2_t6_8M_UR50D` fine-tuned end-to-end on the AMP database
- Kept on the smaller ESM-2 base rather than ESMC — full backprop fine-tuning of a 300M-param model isn't practical on CPU-only hardware
- Multiple sequences supported

### 🏗️ Structure Search
- Input: PDB structure file
- Output: Structurally similar AMPs with identity, alignment length, and E-value
- Pipeline: `foldseek easy-search` (via WSL2) against a Foldseek DB built from the site's PDB structure files

### 🔗 Sequence Search
- Input: FASTA sequence
- Output: Similar sequences with identity, alignment length, E-value, and matched target sequence
- Pipeline: `mmseqs easy-search` (via WSL2) against an MMseqs2 DB built from all 26,788 sequences in the peptide database

### 📋 Clustering List
- Browse peptide clusters organized by sequence similarity

### 📖 Help
- Step-by-step usage guide
- Contact and feedback form

---

## 🛠️ Search Database Setup (WSL2)

Structure/sequence search need WSL2 plus a built Foldseek and MMseqs2 database. This is a one-time setup — `server.js` calls the binaries and databases at request time via `wsl.exe`.

### Install WSL2
```powershell
wsl --install
```
Restart your computer, then open Ubuntu from the Start menu.

### Install MMseqs2 and Foldseek
```bash
wget https://mmseqs.com/latest/mmseqs-linux-avx2.tar.gz
tar xvzf mmseqs-linux-avx2.tar.gz

wget https://mmseqs.com/foldseek/foldseek-linux-avx2.tar.gz
tar xvzf foldseek-linux-avx2.tar.gz
```

### Build the search databases
From WSL, build an MMseqs2 sequence DB from the peptide database and a Foldseek structure DB from the site's PDB files:
```bash
mkdir -p ~/adam_db/tmp

# Export ADAMV2(2).xlsx sequences to FASTA first (see amp-portal/src/server, one-time Node script),
# then:
~/mmseqs/bin/mmseqs createdb /mnt/d/.../all_sequences.fasta ~/adam_db/seq_db

~/foldseek/bin/foldseek createdb "/mnt/d/Final Project/amp-portal/public/pdb" ~/adam_db/struct_db
```
Update `FOLDSEEK_BIN`, `MMSEQS_BIN`, `STRUCT_DB`, `SEQ_DB` at the top of `server.js` to match your paths/username.

---

## 📄 License

© 2025 National Taiwan Ocean University. All rights reserved.
Original ADAM database: Bioinformatics Lab, NTOU.
