import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { RadarWindow } from "./RadarWindow";
import "./styles.css";

const isRadar = window.location.hash.replace(/^#/, "").startsWith("radar");

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>{isRadar ? <RadarWindow /> : <App />}</React.StrictMode>,
);
