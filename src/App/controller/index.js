import React from "react";
import ReactDOM from "react-dom/client";
import "../../output.css";
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
