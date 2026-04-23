import { BrowserRouter, Routes, Route } from "react-router-dom";
import Layout from "./Layout";
import HomePage from "./Components/HomePage";
import Search from "./Components/Search";
import ClusterList from "./Components/ClusterList";
import Result from "./Components/Result";
import Prediction from "./Components/PredictionSystem";
import SVM from "./Components/SVMPrediction";
import HMM from "./Components/HMMPrediction";
import Guide from "./Components/Guide";

function App() {
  return (
    <BrowserRouter>
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
</Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;