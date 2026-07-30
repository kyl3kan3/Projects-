//! Desktop binary. All setup lives in the library crate (see lib.rs) so the
//! window/tray/command wiring is shared with any future mobile entrypoint.

// A release build on Windows must not also open a console window.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    shotstash_lib::run();
}
