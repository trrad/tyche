import React from 'react';
import ReactDOM from 'react-dom/client';
import BayesianAnalysisDemo from './combined-demo';
import './index.css'; // Make sure you have Tailwind CSS set up

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BayesianAnalysisDemo />
  </React.StrictMode>
);