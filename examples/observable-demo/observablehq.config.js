export default {
  title: "Tyche Demo",
  port: 3001, // Use different port from Vite (3000)
  pages: [
    {name: "Overview", path: "/"},
    {name: "Experiment Comparison", path: "/experiment-view"},
    {name: "Condition Analysis", path: "/condition-view"}
  ],
  root: "src",
  toc: true,
  // Enable D3 and other dependencies
  head: `
    <style>
      .card {
        background: rgba(255, 255, 255, 0.05);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 8px;
        padding: 1.5rem;
        margin-bottom: 1rem;
      }
      .grid {
        display: grid;
        gap: 1rem;
      }
      .grid-cols-2 { grid-template-columns: repeat(2, 1fr); }
      .grid-cols-3 { grid-template-columns: repeat(3, 1fr); }
      .grid-cols-4 { grid-template-columns: repeat(4, 1fr); }
      .metric {
        font-size: 2rem;
        font-weight: bold;
        color: #f8fafc;
      }
      .metric-label {
        font-size: 0.875rem;
        color: #94a3b8;
        text-transform: uppercase;
        letter-spacing: 0.05em;
      }
      h4 {
        color: #e2e8f0;
      }
    </style>
  `
};
