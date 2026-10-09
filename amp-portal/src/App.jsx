import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Layout from "./Layout";
import HomePage from "./Components/HomePage";

// Only the landing page is bundled eagerly. Every other route is split into
// its own chunk so a first visit doesn't download the search, clustering and
// prediction pages (plus their dependencies) before rendering anything.
const Search          = lazy(() => import("./Components/Search"));
const ClusterList     = lazy(() => import("./Components/ClusterList"));
const Result          = lazy(() => import("./Components/Result"));
const Prediction      = lazy(() => import("./Components/PredictionSystem"));
const SVM             = lazy(() => import("./Components/SVMPrediction"));
const HMM             = lazy(() => import("./Components/HMMPrediction"));
const ESMCFLM         = lazy(() => import("./Components/ESMCFLMPrediction"));
const Ensemble        = lazy(() => import("./Components/EnsemblePrediction"));
const Guide           = lazy(() => import("./Components/Guide"));
const StructureSearch = lazy(() => import("./Components/StructureSearch"));
const SequenceSearch  = lazy(() => import("./Components/SequenceSearch"));

// Matches the page background so a chunk load reads as a brief pause rather
// than a white flash between the header and footer.
function RouteFallback() {
  return <div style={{ minHeight: "60vh", background: "#F3F3F1" }} />;
}

function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<HomePage />} />
            <Route path="search" element={<Search />} />
            <Route path="result/:id" element={<Result />} />
            <Route path="cluster" element={<ClusterList />} />
            <Route path="cluster/:id" element={<Result />} />
            <Route path="guide" element={<Guide />} />
            <Route path="prediction" element={<Prediction />} />
            <Route path="prediction/svm" element={<SVM />} />
            <Route path="prediction/hmm" element={<HMM />} />
            <Route path="prediction/esmc-flm" element={<ESMCFLM />} />
            {/* Old split-model URLs kept so existing links and bookmarks still resolve. */}
            <Route path="prediction/esmc" element={<ESMCFLM />} />
            <Route path="prediction/flm" element={<ESMCFLM />} />
i            <Route path="prediction/ensemble" element={<Ensemble />} />
            <Route path="search/structure" element={<StructureSearch />} />
            <Route path="search/sequence" element={<SequenceSearch />} />
          </Route>
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}

export default App;
