//! Screen capture behind a per-platform trait.
//!
//! TODO:
//! - [ ] trait Capturer { region/window/fullscreen -> PNG bytes + metadata }
//! - [ ] macOS: ScreenCaptureKit; Windows: Graphics Capture; Linux: xdg portal
//! - [ ] frontmost app + window title metadata where the OS permits
//! - [ ] permission prompts + graceful degradation
