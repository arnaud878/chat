import React from "react";
import ReactDOM from "react-dom/client";
import { Chart, registerables } from 'chart.js';
import App from "./App";
import "./index.css";

// Register Chart.js components and expose to global window for AI injected scripts
Chart.register(...registerables);
(window as any).Chart = Chart;

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
