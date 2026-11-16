#!/usr/bin/env python3
"""ADAM2 v9 -> v9.1 資料清洗。用法: python3 clean_adam2.py <v9 CSV 資料夾> <輸出資料夾>
原則:不改原檔;每筆修改都寫進 change_log;無法確定的標記而不亂猜。"""
import sys, os, re, csv
import pandas as pd, numpy as np

SRC, DST = sys.argv[1], sys.argv[2]
os.makedirs(DST, exist_ok=True)
rd = lambda n: pd.read_csv(os.path.join(SRC, n + ".csv"), dtype=str, keep_default_na=False, na_values=[""])
peptides, molecules, act = rd("peptides"), rd("molecules"), rd("activity_measurements")
literature, pp, clog = rd("literature"), rd("peptide_pmid"), rd("change_log")
log = []  # (adam_id, field, old, new, reason)

# ---------- 1. activity_measurements:修復測試對象 ----------
act["condition"] = None
act["target_flag"] = None
pep_by_id = peptides.set_index("adam_id")
LEAK = r"(?:low-salt|high-salt|at concentration of [\d.]+%|\d+% serum|\d+ mM\)?)"
RE_LEAK_ONLY = re.compile(rf"^{LEAK}$")
RE_LEAK_COMMA = re.compile(rf"^({LEAK})\s*[,;]\s*(.+)$")
RE_MH_ONLY = re.compile(r"^Mueller.?Hinton Broth cation adjusted MHB2 medium$")
RE_MH_ORG = re.compile(r"^(.+?)\s+Mueller.?Hinton Broth MHB medium$")
RE_SENT = re.compile(r"^(?:It |The peptide)")
RE_CELL = re.compile(r"(?:against|on|to|in)\s+((?:[A-Za-z0-9\-]+\s+){0,3}?(?:erythrocytes|red blood cells|RBCs?|blood cells|[A-Za-z0-9\-]+ cells?(?: lines?)?|cell lines?))")
OPP = {"low-salt": "high-salt", "high-salt": "low-salt"}

def setv(i, col, val, flag, reason):
    old = act.at[i, col]
    if old != val:
        log.append((act.at[i, "adam_id"], f"activity_measurements.{act.at[i,'measurement_id']}.{col}", old, val, reason))
        act.at[i, col] = val
    if flag and col == "target":
        act.at[i, "target_flag"] = flag

last = {"adam": None, "target": None, "idx": None}
for i in act.index:
    aid, t = act.at[i, "adam_id"], act.at[i, "target"]
    if last["adam"] != aid:
        last = {"adam": aid, "target": None, "idx": None}
    if isinstance(t, str):
        m = RE_LEAK_COMMA.match(t)
        if m:                                   # "high-salt , Micrococcus luteus"
            leak, org = m.group(1), m.group(2).strip()
            if leak in OPP:
                if last["idx"] is not None and pd.isna(act.at[last["idx"], "condition"]):
                    setv(last["idx"], "condition", leak, None, "拆出培養條件(原本被併進下一列的測試對象)")
                setv(i, "condition", OPP[leak], None, "拆出培養條件")
            setv(i, "target", org, "repaired_leading_text", "測試對象前混入上一筆的條件文字,已移除")
        elif RE_LEAK_ONLY.match(t):             # 整個 target 只有條件文字 → 沿用上一列的菌名
            if last["target"] is not None:
                if t in OPP:
                    if last["idx"] is not None and pd.isna(act.at[last["idx"], "condition"]):
                        setv(last["idx"], "condition", t, None, "拆出培養條件")
                    setv(i, "condition", OPP[t], None, "拆出培養條件")
                setv(i, "target", last["target"], "inherited_previous", "測試對象被誤解析成條件文字,沿用同一記錄上一筆的菌名")
            else:
                setv(i, "target", None, "unparsed", "測試對象被誤解析成條件文字,且無法推得菌名")
        elif RE_MH_ONLY.match(t):
            if last["target"] is not None:
                setv(i, "condition", "Mueller-Hinton Broth cation adjusted (MHB2)", None, "拆出培養基")
                setv(i, "target", last["target"], "inherited_previous", "測試對象被誤解析成培養基名稱,沿用上一筆的菌名")
            else:
                setv(i, "target", None, "unparsed", "測試對象被誤解析成培養基名稱")
        elif RE_MH_ORG.match(t):
            org = RE_MH_ORG.match(t).group(1)
            setv(i, "condition", "Mueller-Hinton Broth (MHB)", None, "拆出培養基")
            setv(i, "target", org, "repaired_leading_text", "測試對象後面混入培養基名稱,已移除")
        elif RE_SENT.match(t):                  # "It has" / "It shows" …
            txt = pep_by_id.at[aid, act.at[i, "source_field"]] if act.at[i, "source_field"] in pep_by_id.columns else None
            found = {x.strip() for x in RE_CELL.findall(str(txt))} if isinstance(txt, str) else set()
            if len(found) == 1:
                setv(i, "target", found.pop(), "repaired_from_source", "測試對象被誤解析成句子片段,由原文重新抽出")
            else:
                setv(i, "target", None, "unparsed", "測試對象被誤解析成句子片段,原文無法唯一判定,已清空待人工確認")
    cur = act.at[i, "target"]
    if isinstance(cur, str):
        last["target"], last["idx"] = cur, i

# 是否納入分子層 MIC 摘要(嚴格定義:MIC、運算符 = < <= ~、有 µM 值、無異常旗標)
v = pd.to_numeric(act["value_um"], errors="coerce")
act["in_mic_summary"] = ((act.measure == "MIC") & v.notna() & act.operator.isin(["=", "<", "<=", "~"]) & act.value_flag.isna()).map({True: "True", False: "False"})

# ---------- 2. molecules:MIC 摘要改為嚴格 MIC ----------
act["_v"] = v
act = act.join(peptides.set_index("adam_id").molecule_id.rename("_mol"), on="adam_id")
good = act[act.in_mic_summary == "True"]
fmt = lambda x: f"{round(float(x),4):.4f}".rstrip("0").rstrip(".")
def agg(sub):
    return sub.groupby("_mol")._v.min()
is_ec = good.target.str.contains(r"^(?:Escherichia coli|E\.? ?coli)", case=False, na=False)
is_sa = good.target.str.contains(r"^(?:Staphylococcus aureus|S\.? ?aureus)", case=False, na=False)
new = pd.DataFrame({"min_mic_um": agg(good), "mic_ecoli_um": agg(good[is_ec]), "mic_saureus_um": agg(good[is_sa])})
first = good.sort_values(["_v", "measurement_id"]).groupby("_mol").first()
new["min_mic_target"] = first.target
molecules = molecules.set_index("molecule_id")
changed = {}
for col in ["min_mic_um", "mic_ecoli_um", "mic_saureus_um", "min_mic_target"]:
    newcol = new[col].reindex(molecules.index)
    newstr = newcol.map(lambda x: None if pd.isna(x) else (x if isinstance(x, str) else fmt(x)))
    old = molecules[col]
    if col == "min_mic_target":      # 目標名稱只在有數值時才有意義
        diff = (old.fillna("") != newstr.fillna(""))
    else:
        o = pd.to_numeric(old); n = pd.to_numeric(newstr)
        diff = ~((o.isna() & n.isna()) | np.isclose(o.fillna(-1), n.fillna(-1), atol=2e-4))
    changed[col] = int(diff.sum())
    if col != "min_mic_target":
        for mid in molecules.index[diff]:
            log.append((mid, f"molecules.{col}", old[mid], newstr[mid],
                        "MIC 摘要改為嚴格定義(只用 MIC;排除 MBC/MEC/MIC50/MIC90/MFC 與異常單位旗標)"))
    molecules[col] = newstr
molecules = molecules.reset_index()

# ---------- 3. peptides:合併/刪除重複欄 ----------
def merge_ids(a, b):
    toks = []
    for s in (a, b):
        if isinstance(s, str):
            for x in re.split(r"\s*;\s*", s.strip()):
                if x and x not in toks:
                    toks.append(x)
    return "; ".join(toks) if toks else None
newu = [merge_ids(a, b) for a, b in zip(peptides.uniprot_id, peptides.swiss_prot_entry)]
for aid, o, n in zip(peptides.adam_id, peptides.uniprot_id, newu):
    if (o if isinstance(o, str) else None) != n:
        log.append((aid, "peptides.uniprot_id", o, n, "合併 swiss_prot_entry 進 uniprot_id(兩欄 98.5% 相同)"))
peptides["uniprot_reviewed"] = np.where(peptides.swiss_prot_entry.notna(), "True", None)
peptides["uniprot_id"] = newu
peptides = peptides.drop(columns=["swiss_prot_entry", "adam_identity", "adam_taxon_group"])
cols = list(peptides.columns); cols.remove("uniprot_reviewed"); cols.insert(cols.index("uniprot_id") + 1, "uniprot_reviewed")
peptides = peptides[cols]

# ---------- 4. change_log 追加 ----------
n0 = int(clog.change_id.str[1:].astype(int).max())
rows = [{"change_id": f"C{n0+k+1:06d}", "adam_id": a, "field": f, "old_value": o, "new_value": n, "reason": r}
        for k, (a, f, o, n, r) in enumerate(log)]
clog = pd.concat([clog, pd.DataFrame(rows)], ignore_index=True)

# ---------- 5. 輸出 ----------
act = act.drop(columns=["_v", "_mol"])
def out(df, name):
    df.to_csv(os.path.join(DST, name + ".csv"), index=False, na_rep="", quoting=csv.QUOTE_MINIMAL)
out(peptides, "peptides"); out(molecules, "molecules"); out(act, "activity_measurements")
out(literature, "literature"); out(pp, "peptide_pmid"); out(clog, "change_log")

print("log rows added:", len(rows))
print("target_flag:", act.target_flag.value_counts(dropna=False).to_dict())
print("condition filled:", int(act.condition.notna().sum()))
print("in_mic_summary True:", int((act.in_mic_summary == "True").sum()))
print("molecule summary changed rows:", changed)
for c in ["min_mic_um", "mic_ecoli_um", "mic_saureus_um"]:
    print(c, "non-null now:", int(molecules[c].notna().sum()))
