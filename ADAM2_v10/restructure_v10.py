#!/usr/bin/env python3
"""v9.1 -> v10(重構版)。用法: python3 restructure_v10.py <v9.1 CSV 資料夾> <輸出資料夾>
原則:不丟資訊——被移除的欄位若有獨有資訊,先搬到適當的表。"""
import sys, os, csv, re
import pandas as pd, numpy as np
SRC, DST = sys.argv[1], sys.argv[2]; os.makedirs(DST, exist_ok=True)
rd = lambda n: pd.read_csv(os.path.join(SRC, n + ".csv"), dtype=str, keep_default_na=False, na_values=[""])
P, M, A, LIT, PP, CL = (rd(n) for n in ["peptides", "molecules", "activity_measurements", "literature", "peptide_pmid", "change_log"])
out = lambda df, n: df.to_csv(os.path.join(DST, n + ".csv"), index=False, na_rep="", quoting=csv.QUOTE_MINIMAL)

os.makedirs(os.path.join(DST, "archive"), exist_ok=True)
# ---- peptides:身分欄只留在 molecules;立體構型的「細節文字」搬到 stereo_note ----
Mi = M.set_index("molecule_id")
cat = P.molecule_id.map(Mi.stereo)
detail = P.stereochemistry.where(P.stereochemistry.fillna("∅") != cat.fillna("∅"))
P["stereo_note"] = detail
# 驗證:其餘身分欄與 molecules 完全一致,才能安全移除
for a, b in [("sequence","sequence"),("length","length"),("n_terminus","n_terminus"),("c_terminus","c_terminus"),("linear_cyclic_branched","linear_cyclic")]:
    j = P[a].fillna("∅") == P.molecule_id.map(Mi[b]).fillna("∅")
    assert j.all(), f"{a} 與 molecules 不一致 {int((~j).sum())} 筆"
assert ((P.patent_id.notna()) == (P.record_type == "patent")).all()
assert (P.web_visible.map({"True": True, "False": False}) == P.length.astype(int).between(5, 100)).all()

# ---- 舊 ADAM 註解併入 peptides(不再獨立成表)----
adamcols = ["adam_classic_id","adam_other_db","adam_pdb_chain_ids","adam_camp_id","adam_description"]
P.loc[P[adamcols].notna().any(axis=1), ["adam_id"] + adamcols].to_csv(os.path.join(DST, "archive", "peptide_adam_original.csv"), index=False)
def joinu(*vals):
    out = []
    for v in vals:
        if isinstance(v, str):
            for t in v.split(";"):
                t = t.strip()
                if t and t not in out: out.append(t)
    return "; ".join(out) if out else np.nan
# PDB:鏈編號(2JQ0A)去掉最後的鏈字母,與 pdb_id 合併
chain4 = P.adam_pdb_chain_ids.map(lambda v: "; ".join(t.strip()[:4] for t in v.split(";")) if isinstance(v, str) else np.nan)
P["pdb_id"] = [joinu(a, b) for a, b in zip(P.pdb_id, chain4)]
# 外部編號:舊 ADAM 編號 + CAMP 編號
P["external_ids"] = [joinu(a, b) for a, b in zip(P.adam_classic_id, P.adam_camp_id)]
# 也收錄於:修正被截斷的資料庫名稱(D/DA→DADP、Y/YADAM→YADAMP)
FIX = {"D": "DADP", "DA": "DADP", "Y": "YADAMP", "YADAM": "YADAMP"}
P["other_databases"] = P.adam_other_db.map(lambda v: joinu("; ".join(FIX.get(t.strip(), t.strip()) for t in v.split(";"))) if isinstance(v, str) else np.nan)
# 也收錄的資料庫併入 source_databases(去除重複)
P["source_databases"] = [joinu(x, y) for x, y in zip(P.source_databases, P.other_databases)]
# ADAM 描述(蛋白質名稱與別名)併入 comments
# (舊 ADAM 描述不併入 comments,保留在 archive/peptide_adam_original.csv)

P[["adam_id","adam_best_evalue"]].dropna().to_csv(os.path.join(DST, "archive", "peptide_adam_best_evalue.csv"), index=False)
P[["adam_id","adam_cluster","adam_domain","adam_hmm_id"]].dropna(subset=["adam_cluster","adam_domain","adam_hmm_id"],how="all").to_csv(os.path.join(DST, "archive", "peptide_adam_dropped_columns.csv"), index=False)
P[["adam_id","quality_flags"]].dropna().to_csv(os.path.join(DST, "archive", "peptides_quality_flags.csv"), index=False)
P[["adam_id","taxonomy","source_category"]].dropna(subset=["taxonomy","source_category"],how="all").to_csv(os.path.join(DST, "archive", "peptides_taxonomy_original.csv"), index=False)
# ---- record_references:文獻原文獨立成表(不丟資訊)----
refs = ["reference_title", "author", "reference"]
RR = P.loc[P[refs].notna().any(axis=1), ["adam_id"] + refs]
RR.to_csv(os.path.join(DST, "archive", "record_references_original.csv"), index=False)
# 文獻正規化:一格多篇(標題、作者、出處段數一致)時拆開;相同文獻只存一次
def split_refs(row):
    t, a, r = row.reference_title, row.author, row.reference
    rs = re.split(r";\s*(?=[A-Z])", r) if isinstance(r, str) else [r]
    ts = t.split("; ") if isinstance(t, str) else [t]
    au = a.split("; ") if isinstance(a, str) else [a]
    if len(rs) > 1 and len(ts) == len(rs) == len(au):
        return list(zip(ts, au, rs))
    return [(t, a, r)]
rows = [(x.adam_id,) + tr for x in RR.itertuples() for tr in split_refs(x)]
L = pd.DataFrame(rows, columns=["adam_id", "title", "author", "reference"])
for c in ["title", "author", "reference"]: L[c] = L[c].map(lambda v: v.strip() if isinstance(v, str) else v)
key = L[["title", "author", "reference"]].fillna("\u2205").agg("\u241f".join, axis=1)
uniq = pd.Index(pd.unique(key))
L["publication_id"] = ["P%06d" % (uniq.get_loc(k) + 1) for k in key]
PUB = L.drop_duplicates("publication_id")[["publication_id", "title", "author", "reference"]]
PPUB = L[["adam_id", "publication_id"]].drop_duplicates()

# ---- molecules:只留身分欄 + display_name ----
first = P.sort_values("adam_id").dropna(subset=["peptide_name"]).groupby("molecule_id").peptide_name.first()
pn = M.set_index("molecule_id").primary_name
unnamed = "Unnamed peptide " + pn.index.to_series()
exp_default = first.reindex(pn.index).fillna(unnamed)          # 視圖的預設規則
disp = pn.where(pn != exp_default)                              # 只有「與預設規則不同」的才需要存
disp = pd.Series(disp.values, index=pn.index)
MOL = M[["molecule_id", "sequence", "length", "n_terminus", "c_terminus", "stereo", "linear_cyclic", "mw"]].copy()
pd.DataFrame({"molecule_id": disp.dropna().index, "display_name": disp.dropna().values}).to_csv(os.path.join(DST, "archive", "molecule_display_names.csv"), index=False)

# ---- peptides 最終欄位 ----
STRUCT = ["synthesis_type","complexity","structure","structure_description","specific_type"]
TEXTS = ["activity","target_organism","target_group","target_object","binding_target","assay_information","hemolytic_activity","cytotoxicity","half_life"]
# 結構欄位描述分子本身:同一分子的各記錄沒有衝突(已驗證),搬到 molecules
st = P.groupby("molecule_id")[STRUCT].agg(lambda x: x.dropna().iloc[0] if x.notna().any() else np.nan)
assert (P.groupby("molecule_id")[STRUCT].nunique() <= 1).all().all(), "結構欄位同一分子有衝突"
MOL = MOL.merge(st.reset_index(), on="molecule_id", how="left")
# 實驗原文搬到 source_texts(一筆記錄一列,只收有值的)
# 從相同序列抄來的活性標籤不是原文:另存 archive 後清空;activity_source 不再需要
P[["adam_id","activity","activity_source"]].dropna(subset=["activity_source"]).to_csv(os.path.join(DST, "archive", "activity_source.csv"), index=False)
P.loc[P.activity_source == "same_sequence_record", "activity"] = np.nan
# 依相同序列補上的論文連結不是原文:另存 archive 後移除;link_source 不再需要
PP[PP.link_source != "original"].to_csv(os.path.join(DST, "archive", "peptide_pmid_same_sequence.csv"), index=False)
PP = PP[PP.link_source == "original"][["adam_id", "pmid"]]
def explode(df, col, name):
    x = df[["adam_id", col]].dropna().copy()
    x[col] = x[col].str.split(";"); x = x.explode(col); x[col] = x[col].str.strip()
    return x[x[col] != ""].drop_duplicates().rename(columns={col: name})
PSRC = explode(P, "source_databases", "source_db")
PACT = explode(P, "activity", "activity")
TEXTS = [c for c in TEXTS if c != "activity"]
SRCT = P.loc[P[TEXTS].notna().any(axis=1), ["adam_id"] + TEXTS]
PEP = P[["adam_id","molecule_id","peptide_name","validation","source_organism","taxon",
         "other_modifications","stereo_note",
         "protein_family","gene","protein_existence","comments","patent_id"]]
# ---- activity:in_mic_summary 可由規則推得,移除(規則改放檢視表 mic_measurements)----
# ---- activity_measurements 精簡:條件併入 target 文字;可推得或重複的欄位移到 archive ----
c = A.condition.str.replace(" (", " ", regex=False).str.replace(")", "", regex=False)
A["target"] = np.where(A.condition.notna() & A.target.notna(), A.target + " (" + c + ")", A.target)
DROP = ["condition", "target_flag", "mw_note", "at_conc_um", "value_max_um", "in_mic_summary", "value_um", "conversion"]
A[["measurement_id"] + DROP].dropna(subset=DROP, how="all").to_csv(os.path.join(DST, "archive", "activity_dropped_columns.csv"), index=False, na_rep="")
ACT = A.drop(columns=DROP).rename(columns={"measurement_id":"bioactivity_id","measure":"assay_metric","measure_type":"activity_type"})
P[["adam_id","uniprot_reviewed"]].dropna().to_csv(os.path.join(DST, "archive", "peptides_uniprot_reviewed.csv"), index=False)
# ---- literature:pubmed_url 可由 pmid 組成,移除 ----
LIT.to_csv(os.path.join(DST, "archive", "literature_status.csv"), index=False, na_rep="")

assert (MOL.length.astype(int) == MOL.sequence.str.len()).all()
# 外部連結合併成一張表:收錄資料庫、文獻、PubMed、UniProt、PDB
PUNI = explode(P, "uniprot_id", "link_value"); PPDB = explode(P, "pdb_id", "link_value")
LINK = pd.concat([
    PSRC.rename(columns={"source_db": "link_value"}).assign(link_type="database"),
    PPUB.rename(columns={"publication_id": "link_value"}).assign(link_type="publication"),
    PP.rename(columns={"pmid": "link_value"}).assign(link_type="pubmed"),
    PUNI.assign(link_type="uniprot"), PPDB.assign(link_type="pdb"),
    PACT.rename(columns={"activity": "link_value"}).assign(link_type="activity")])[["adam_id", "link_type", "link_value"]].drop_duplicates()
LINK = LINK.rename(columns={"link_type": "attr_type", "link_value": "attr_value"})
# ---- 編號改為整數:前綴(ADAM2_、M、P)只是顯示用,由程式產生 ----
def num(col, pat):
    assert col.str.fullmatch(pat).all(), pat
    return col.str.extract(r"(\d+)$")[0].astype(int)
mol_map = pd.Series(range(1, len(MOL) + 1), index=sorted(MOL.molecule_id))      # molecule_id 自己從 1 編號
pd.DataFrame({"old_molecule_id": mol_map.index, "molecule_id": mol_map.values}).to_csv(os.path.join(DST, "archive", "molecule_id_map.csv"), index=False)
MOL["molecule_id"] = MOL.molecule_id.map(mol_map); MOL = MOL.sort_values("molecule_id")
PEP = PEP.copy(); PEP["molecule_id"] = PEP.molecule_id.map(mol_map)
for df in (PEP, SRCT, ACT, LINK): df["adam_id"] = num(df.adam_id, r"ADAM2_\d{6}")
ACT["bioactivity_id"] = num(ACT.bioactivity_id, r"M\d{6}")
PUB = PUB.copy(); PUB["publication_id"] = num(PUB.publication_id, r"P\d{6}")
m = LINK.attr_type == "publication"; LINK.loc[m, "attr_value"] = num(LINK.loc[m, "attr_value"], r"P\d{6}").astype(str)
# ---- 多值屬性放回 peptides(分號分隔)----
def agg(t):
    v = LINK[LINK.attr_type == t].groupby("adam_id", sort=False).attr_value.agg(lambda x: "; ".join(x))
    return PEP.adam_id.map(v)
PEP["source_db"] = agg("database"); PEP["activity"] = agg("activity"); PEP["uniprot_id"] = agg("uniprot"); PEP["pdb_id"] = agg("pdb")
# ---- pmid 併入 publications ----
# 原始資料的文獻文字與 PMID 分開記錄;只在「一筆記錄恰好 1 段文獻 + 1 個 PMID」且在全部資料中一對一一致時配對
RP = LINK[LINK.attr_type == "publication"][["adam_id", "attr_value"]].rename(columns={"attr_value": "publication_id"}); RP["publication_id"] = RP.publication_id.astype(int)
RM = LINK[LINK.attr_type == "pubmed"][["adam_id", "attr_value"]].rename(columns={"attr_value": "pmid"}); RM["pmid"] = RM.pmid.astype("int64")
n1 = RP.groupby("adam_id").size(); n2 = RM.groupby("adam_id").size()
one = n1[n1 == 1].index.intersection(n2[n2 == 1].index)
pairs = RP[RP.adam_id.isin(one)].merge(RM[RM.adam_id.isin(one)], on="adam_id")[["publication_id", "pmid"]]
c1 = pairs.groupby("publication_id").pmid.nunique(); c2 = pairs.groupby("pmid").publication_id.nunique()
good = pairs.drop_duplicates(); good = good[good.publication_id.map(c1).eq(1)]
# 同一個 PMID 對到多段文獻文字 = 同一篇論文的不同寫法:合併成一列(保留編號最小的那段,其餘寫法存 archive)
canon = good.groupby("pmid").publication_id.min()
remap = dict(zip(good.publication_id, good.pmid.map(canon)))
PUB[PUB.publication_id.isin([p for p, c in remap.items() if p != c])].assign(merged_into=lambda d: d.publication_id.map(remap)).to_csv(os.path.join(DST, "archive", "publications_merged_variants.csv"), index=False)
PUB = PUB[~PUB.publication_id.isin([p for p, c in remap.items() if p != c])].copy()
RP["publication_id"] = RP.publication_id.map(lambda p: remap.get(p, p))
pm2pub = canon.to_dict()
PUB["pmid"] = PUB.publication_id.map({v: k for k, v in pm2pub.items()})
extra = sorted(set(RM.pmid) - set(pm2pub))                     # 只有 PMID、沒有文獻文字的論文
start = int(PUB.publication_id.max()) + 1
NEW = pd.DataFrame({"publication_id": range(start, start + len(extra)), "pmid": extra})
pm2pub.update(dict(zip(NEW.pmid, NEW.publication_id)))
PUB = pd.concat([PUB, NEW], ignore_index=True)[["publication_id", "pmid", "title", "author", "reference"]]
PUB["pmid"] = PUB.pmid.astype("Int64")
# 記錄 ↔ 論文(多對多,只留兩個外鍵)
BR = pd.concat([RP, pd.DataFrame({"adam_id": RM.adam_id.values, "publication_id": RM.pmid.map(pm2pub).values})]).drop_duplicates().sort_values(["adam_id", "publication_id"])
assert BR.publication_id.notna().all()
print("pmid paired with text:", len(canon), " merged variants:", sum(p != c for p, c in remap.items()), " pmid-only papers:", len(NEW))
# ---- 最後整理:資料修正 + 欄位命名 ----
# patent_id:只留真正的專利號(原欄位混入肽名或名稱碎片),原值存 archive
PATRE = r"^(US|CN|WO|EP|JP|KR|CA|AU|DE|GB|FR|RU|TW|IN|BR|MX|ES|IL|NZ|ZA|SG|HK|DK|AT|SE|NO|FI|CH|IT|PL)\s?[0-9A-Z]"
def clean_pat(v):
    if not isinstance(v, str): return np.nan
    t = [x.strip() for x in v.split(";") if re.match(PATRE, x.strip())]
    return "; ".join(t) if t else np.nan
bad = PEP.patent_id.notna() & (PEP.patent_id != PEP.patent_id.map(clean_pat))
PEP.loc[bad, ["adam_id", "patent_id"]].to_csv(os.path.join(DST, "archive", "patent_id_original.csv"), index=False)
PEP["patent_id"] = PEP.patent_id.map(clean_pat)
print("patent_id cleaned:", int(bad.sum()))
# target_category:混入病毒名、培養基、NOTE 等非類別值,刪除並存 archive
ACT[["bioactivity_id", "target_category"]].dropna().to_csv(os.path.join(DST, "archive", "target_category.csv"), index=False)
ACT = ACT.drop(columns=["target_category"])
MOL = MOL.rename(columns={"mw": "molecular_weight", "complexity": "assembly_type", "specific_type": "special_type"})
PEP = PEP.rename(columns={"validation": "evidence_level", "source_db": "source_dbs", "activity": "activities", "uniprot_id": "uniprot_ids", "pdb_id": "pdb_ids"})
ACT = ACT.rename(columns={"sd": "value_error", "at_conc": "test_conc", "at_conc_unit": "test_conc_unit"})
PUB = PUB.rename(columns={"author": "authors"})
out(MOL.drop(columns=["length"]),"molecules"); out(PEP,"peptide_records"); out(PUB,"publications")
out(SRCT,"source_texts"); out(ACT,"bioactivities"); out(BR,"record_publications")
CL.to_csv(os.path.join(DST, "archive", "change_log.csv"), index=False, na_rep="")
print({n:(len(d),len(d.columns)) for n,d in [("molecules",MOL),("peptide_records",PEP),("publications",PUB),("source_texts",SRCT),("bioactivities",ACT),("record_publications",BR)]})
print("stereo_note filled:", int(PEP.stereo_note.notna().sum()))
