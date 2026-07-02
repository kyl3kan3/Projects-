/**
 * Generation worker: orchestrates Replicate fine-tune + inference.
 *
 * TODO:
 * - [ ] validate uploads (face detection, min 8 usable selfies, dedupe)
 * - [ ] LoRA training job on Replicate; poll/webhook for completion
 * - [ ] fan-out inference across style presets (backgrounds/outfits/lighting)
 * - [ ] post-process: upscale, crop variants, watermark-free finals to S3
 * - [ ] email "your headshots are ready" via Resend
 * - [ ] cost guard: cap GPU spend per order
 */
export {};
