import ModelPredictionPage from "./ModelPredictionPage";

const CONFIG = {
  eyebrow: "SVM · Support Vector Machine",
  title: <>Binary AMP / non-AMP<br /><em>classification</em></>,
  subtitle: "Classifies peptide sequences using a trained SVM on amino-acid composition and physicochemical features. Submit one or more sequences in FASTA format.",
  badge: "Recommended · High precision",
  iconLabel: "SVM",
  endpoint: "svm",
  valueHeader: "Score",
  valueKind: "score",
  runLabel: "Run SVM Prediction",
  csvName: "svm_results.csv",
  exampleFasta: `>Peptide_1_LL37_AMP
LLGDFFRKSKEKIGKEFKRIVQRIKDFLRNLVPRTES
>Peptide_2_InsulinB_NonAMP
FVNQHLCGSHLVEALYLVCGERGFFYTPKT`,
  aboutTitle: "About SVM Prediction",
  aboutBody: (
    <>
      The SVM model is trained on amino acid composition and physicochemical features from curated AMP sequences. A positive score indicates AMP activity; a negative score indicates Non-AMP. For a deep-learning alternative, use the <a href="/prediction/esmc-flm">ESMC FLM model</a>. Like any single model, SVM can be wrong on borderline or unusual sequences — for a more reliable read, cross-check with the <a href="/prediction/ensemble">Ensemble prediction</a>, which weighs all three models together.
    </>
  ),
};

export default function SVMPrediction() {
  return <ModelPredictionPage config={CONFIG} />;
}
