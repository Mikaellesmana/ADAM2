# ADAM — Antimicrobial Peptide Database

**ADAM** (Antimicrobial Database and Model) is a full-stack web application for browsing, searching, and predicting antimicrobial peptides (AMPs). It combines a curated peptide database with machine learning prediction tools trained directly from the database.

---

## Project Structure

```
FINAL PROJECT/
└── amp-portal/
    ├── node_modules/
    ├── public/
    │   ├── icons/
    │   │   ├── database.png
    │   │   ├── download.png
    │   │   ├── guide.png
    │   │   ├── prediction.png
    │   │   └── search.png
    │   ├── adam-logo.png
    │   ├── apd.png
    │   ├── camp.png
    │   ├── cluster-structure.png
    │   ├── dbaasp.png
    │   ├── dbamp.png
    │   ├── dramp.png
    │   ├── network-example.png
    │   ├── protein.png
    │   └── vite.svg
    ├── src/
    │   ├── assets/
    │   ├── Components/
    │   │   ├── ClusterList.jsx
    │   │   ├── Guide.jsx
    │   │   ├── HMMPrediction.jsx
    │   │   ├── HomePage.jsx
    │   │   ├── PredictionSystem.jsx
    │   │   ├── Result.jsx
    │   │   ├── Search.jsx
    │   │   └── SVMPrediction.jsx
    │   ├── data/
    │   │   ├── loadExcel.js
    │   │   └── peptides.json
    │   ├── server/
    │   │   ├── node_modules/
    │   │   ├── python/
    │   │   │   ├── __pycache__/
    │   │   │   ├── features.py
    │   │   │   ├── hmm_model.pkl        # generated after training
    │   │   │   ├── predict_hmm.py
    │   │   │   ├── predict_svm.py
    │   │   │   ├── svm_model.pkl        # generated after training
    │   │   │   ├── train_hmm.py
    │   │   │   └── train_svm.py
    │   │   ├── routes/
    │   │   ├── DBMERGED.xlsx            # peptide database
    │   │   ├── feedback.json
    │   │   ├── package-lock.json
    │   │   ├── package.json
    │   │   └── server.js
    │   ├── api.js
    │   ├── App.css
    │   ├── App.jsx
    │   └── index.css
    ├── .gitignore
    ├── eslint.config.js
    ├── index.html
    ├── package-lock.json
    ├── package.json
    ├── postcss.config.js
    ├── README.md
    ├── tailwind.config.js
    └── vite.config.js
```

---

## Features

- **Home Page** — introduction to the ADAM database with navigation to all features
- **Search AMP** — advanced multi-field filter across 29 peptide attributes with pagination, sorting, and download
- **Result Detail** — full 29-field record view for any individual peptide
- **Prediction System** — submit FASTA sequences and classify them as AMP or Non-AMP using:
  - SVM (Support Vector Machine)
  - HMM (Hidden Markov Model profile)
- **Clustering List** — browse peptide clusters
- **Guide** — user guide and methodology documentation
- **Download** — export selected search results or prediction results as JSON/CSV

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React, React Router, Tailwind CSS, Vite |
| Backend | Node.js, Express |
| Database | Excel (DBMERGED.xlsx) loaded into memory via XLSX |
| ML Models | Python, scikit-learn (SVM), NumPy, joblib |
| Styling | Tailwind CSS + custom CSS-in-JS |
| Build Tool | Vite |

---

## API Endpoints

All endpoints are served from `http://localhost:5000`

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/peptides` | Paginated list. Supports `?page=`, `?limit=`, `?search=` |
| GET | `/api/peptides/count` | Total number of peptides in database |
| GET | `/api/peptide/:id` | Full 29-field record for one peptide by index |
| POST | `/api/search` | Advanced filter — returns 6 summary fields |
| POST | `/api/predict/svm` | SVM prediction from FASTA input |
| POST | `/api/predict/hmm` | HMM prediction from FASTA input |
| POST | `/api/feedback` | Save user feedback to feedback.json |

---

## Getting Started

### Prerequisites

- Node.js v18+
- Python 3.8+
- npm

---

### 1. Install frontend dependencies

```bash
cd amp-portal
npm install
```

### 2. Install backend dependencies

```bash
cd amp-portal/src/server
npm install
```

### 3. Install Python dependencies

```bash
pip install scikit-learn numpy pandas joblib openpyxl
```

---

### 4. Train the ML models

Run these **once** from the `src/server/` directory. Both scripts read `DBMERGED.xlsx` and save `.pkl` model files into the `python/` folder.

```bash
cd amp-portal/src/server

python python/train_svm.py
python python/train_hmm.py
```

Expected output for `train_svm.py`:
```
Loading database...
Using columns: sequence='Sequence', activity='Activity'
Total samples after filtering: 24577
  AMP (label=1):     13411
  Non-AMP (label=0): 11166
Extracting features...
Running 5-fold cross-validation...
CV accuracy: 0.XXXX ± 0.XXXX
Training final model...
Model saved to: .../python/svm_model.pkl
```

Expected output for `train_hmm.py`:
```
Loading database...
AMP sequences for training: 13411
Score threshold (20th percentile of AMPs): -1.3801
Mean AMP score: 13.3750
HMM profile model saved to: .../python/hmm_model.pkl
```

---

### 5. Start the backend server

```bash
cd amp-portal/src/server
node server.js
```

Backend runs on `http://localhost:5000`

You should see:
```
Python scripts directory: .../src/server/python
Loading peptide database...
Loaded 25129 peptides.
Server running on http://localhost:5000
```

### 6. Start the frontend

```bash
cd amp-portal
npm run dev
```

Frontend runs on `http://localhost:5173`

---

## Prediction System

### Input Format (FASTA)

Paste one or more sequences in FASTA format:

```
>Peptide_1
LLGDFFRKSKEKIGKEFKRIVQRIKDFLRNLVPRTES
>Peptide_2
MLTALGQVNNIQKEFTIKKTKQADHNLVARIDEIQYVQGTINL
```

Each entry must start with `>Header` on its own line followed by the amino acid sequence. Multiple sequences are accepted.

### Feature Extraction

Each sequence is converted into a **26-dimensional numeric vector**:

| Features | Description |
|---|---|
| 20 features | Amino acid composition — fraction of each of the 20 standard amino acids |
| 6 features | Physicochemical properties — hydrophobicity, net charge, molecular weight, normalised length, fraction positive residues (K/R), fraction hydrophobic residues |

### Models

**SVM** — Support Vector Machine with RBF kernel. Returns a decision function score. Positive score = AMP, negative score = Non-AMP.

**HMM** — Position frequency matrix profile built from all AMP sequences in the database. Scores a query using log-odds against a background model. Sequences scoring above the trained threshold are classified as AMP.

### Result Table Columns

| Column | Description |
|---|---|
| Name | Peptide name from FASTA header |
| Sequence | Amino acid sequence |
| Target | Target organism if available |
| SVM Score / E-value | Raw model score |
| Label | `Antimicrobial Peptide` or `NON-Antimicrobial Peptide` |

---

## Database

`DBMERGED.xlsx` contains **25,129 peptides** with 29 fields:

| Field | Description |
|---|---|
| Peptide_Name | Name of the peptide |
| Source | Source organism |
| Tax | Taxonomy classification |
| Sequence | Amino acid sequence |
| Sequence_Length | Length in residues |
| Activity | Biological activity (e.g. Antimicrobial) |
| Structure | 3D structure type |
| Uniprot | UniProt accession ID |
| PDB | Protein Data Bank ID |
| Targets | Target organisms |
| Family | Peptide family |
| Gene | Gene name |
| Hemolytic_activity | Hemolytic activity data |
| Cytotoxicity | Cytotoxicity data |
| Binding_Target | Binding target |
| Linear_Cyclic_Branched | Topology |
| N_terminal_Modification | N-terminal modification |
| C_terminal_Modification | C-terminal modification |
| Other_Modifications | Other chemical modifications |
| Stereochemistry | Stereochemistry |
| Pubmed_ID | PubMed reference ID |
| Reference | Journal reference |
| Author | Author(s) |
| Title | Paper title |
| Comments | Additional comments |
| Validation | Experimentally validated / Predicted |

---

## Sample Sequences for Testing

**AMP — should classify as Antimicrobial Peptide:**
```
>LL37
LLGDFFRKSKEKIGKEFKRIVQRIKDFLRNLVPRTES
```

**Non-AMP — should classify as NON-Antimicrobial Peptide:**
```
>NonAMP_Sample
MLTALGQVNNIQKEFTIKKTKQADHNLVARIDEIQYVQGTINL
```

---

## Notes

- `svm_model.pkl` and `hmm_model.pkl` are generated locally and not included in version control — you must run the training scripts before predictions work
- The server uses `__dirname` for all file paths so it works correctly regardless of where `node server.js` is run from
- Python scripts are spawned as child processes by Node.js — make sure `python` is accessible in your system PATH
- The search API returns only 6 summary fields for performance — full data is fetched individually via `/api/peptide/:id`

---

## Authors

Developed as a Final Year Project — Antimicrobial Peptide Database and Prediction System (ADAM).
