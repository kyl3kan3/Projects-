//! Library crate for the ShotStash desktop shell.
//!
//! Tauri 2 keeps the application body in a library (declared as `shotstash_lib`
//! in Cargo.toml) so the same `run()` can be driven from the desktop binary in
//! `main.rs` and from a mobile entrypoint later. Everything below the window
//! layer lives in the modules re-exported here.
//!
//! TODO:
//! - [ ] register global-shortcut plugin + default hotkeys
//! - [ ] tray icon with quick-search popover window
//! - [ ] invoke_handler: capture, search, tag, import, license commands
//! - [ ] background OCR worker pool startup
//! - [ ] open the DB and run migrations in setup(), before the window shows

pub mod capture;
pub mod db;
pub mod hotkeys;
pub mod ocr;

/// Build and run the Tauri application. Blocks until the last window closes.
pub fn run() {
    // TODO: implement tauri::Builder setup
}
