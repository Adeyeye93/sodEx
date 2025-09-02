// src/popup/index.js

import React from "react";
import { createRoot } from "react-dom/client";
import Popup from "./popup.jsx";

const container = document.getElementById("root");
const root = createRoot(container);
root.render(<Popup />);
