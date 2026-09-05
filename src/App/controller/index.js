import React from "react";
import ReactDOM from "react-dom/client";
import "../../index.css";

// Ensure globalThis.electron is available for legacy components referencing bare `electron`
if (typeof window !== "undefined" && window.electron && typeof globalThis.electron === "undefined") {
  try {
    globalThis.electron = window.electron;
  } catch (_) {}
}

import App from "./view.js";
import { Provider } from "react-redux";
import store from "../../Redux/slice.tsx";

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <Provider store={store}>
      <App />
    </Provider>
  </React.StrictMode>
);
