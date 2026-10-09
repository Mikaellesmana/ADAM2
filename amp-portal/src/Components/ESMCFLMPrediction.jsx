import ModelPredictionPage from "./ModelPredictionPage";

const CONFIG = {
  eyebrow: "ESMC FLM · Fine-tuned ESM Cambrian",
  title: <>Binary AMP / non-AMP<br /><em>classification</em></>,
  subtitle: "Classifies peptide sequences with a fine-tuned protein language model — the transformer itself is trained on the AMP data, not just a classifier head bolted onto frozen embeddings. Submit one or more sequences in FASTA format.",
  badge: "Fine-tuned language model",
  iconLabel: "ESMC",
  // Interim: the ESMC fine-tune is still training, so this currently routes to
  // the fine-tuned ESM-2 model, which is the fine-tuned language model we have
  // today. Change to the ESMC endpoint once that run finishes and is verified.
  endpoint: "flm",
  valueHeader: "Confidence",
  valueKind: "probability",
  runLabel: "Run ESMC FLM Prediction",
  csvName: "esmc_flm_results.csv",
  exampleFasta: `>Peptide_1_LL37_AMP
LLGDFFRKSKEKIGKEFKRIVQRIKDFLRNLVPRTES
>Peptide_2_InsulinB_NonAMP
FVNQHLCGSHLVEALYLVCGERGFFYTPKT`,
  aboutTitle: "About ESMC FLM Prediction",
  aboutBody: (
    <>
      FLM stands for Fine-tuned Language Model: the protein language model is trained end-to-end on curated AMP sequences rather than being used only as a frozen feature extractor, which lets it adapt its own internal representations to this task. Confidence is the model's estimated probability of AMP activity (0–1). Like any single model, it can be wrong on borderline or unusual sequences — for a more reliable read, cross-check with the <a href="/prediction/ensemble">Ensemble prediction</a>, which weighs all three models together.{" "}
      <em>Note: fine-tuning on ESM Cambrian is currently in training; predictions are presently served by the fine-tuned ESM-2 model.</em>
    </>
  ),
};

export default function ESMCFLMPrediction() {
  return <ModelPredictionPage config={CONFIG} />;
}
