//! Tauri's build step: reads tauri.conf.json and generates the app context,
//! permission/capability schemas, and platform resources.

fn main() {
    tauri_build::build();
}
