/**
 * Frontend entry for the Tauri window.
 *
 * TODO:
 * - [ ] mount the real shell: rail + library grid + inspector
 * - [ ] wire the quick-search popover window (separate Tauri window/label)
 * - [ ] subscribe to capture/index events emitted from Rust
 * - [ ] restore last window state and selected filter from local settings
 */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import SearchView from "./components/SearchView";
import "./styles.css";

const host = document.getElementById("root");
if (!host) throw new Error("#root missing from index.html");

createRoot(host).render(
  <StrictMode>
    <SearchView />
  </StrictMode>,
);
