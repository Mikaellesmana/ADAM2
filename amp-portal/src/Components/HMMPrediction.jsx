import ModelPredictionPage from "./ModelPredictionPage";

const CONFIG = {
  eyebrow: "HMM · Profile-based Scoring",
  title: <>AMP profile<br /><em>log-odds scoring</em></>,
  subtitle: "Scores a peptide against a position-frequency profile built from curated AMP sequences, using a log-odds comparison against the background amino acid distribution.",
  badge: "Profile-based · Log-odds score",
  iconLabel: "HMM",
  endpoint: "hmm",
  valueHeader: "Log-odds Score",
  valueKind: "score",
  runLabel: "Run HMM Prediction",
  csvName: "hmm_results.csv",
  exampleFasta: `>Peptide_1_Magainin2_AMP
GIGKFLHSAKKFGKAFVGEIMNS
>Peptide_2_InsulinB_NonAMP
FVNQHLCGSHLVEALYLVCGERGFFYTPKT`,
  aboutTitle: "About HMM Prediction",
  aboutBody: (
    <>
      A position-frequency profile is built from curated AMP sequences. The log-odds score compares a query sequence against this profile relative to the background amino acid distribution — a positive score indicates AMP-like composition, higher is stronger. For a fast binary classifier, use the <a href="/prediction/svm">SVM model</a>. Like any single model, HMM can be wrong on borderline or unusual sequences — for a more reliable read, cross-check with the <a href="/prediction/ensemble">Ensemble prediction</a>, which weighs all three models together.
    </>
  ),
};

export default function HMMPrediction() {
  return <ModelPredictionPage config={CONFIG} />;
}
