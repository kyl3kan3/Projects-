import { chromium } from "playwright";
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const ctx = await browser.newContext({ permissions: ["microphone"] });
await ctx.addInitScript(() => {
  // No audio device in this container: synthesise a real MediaStream from an
  // oscillator so MediaRecorder records genuine webm chunks.
  const patch = async () => {
    const context = new AudioContext();
    const dest = context.createMediaStreamDestination();
    const osc = context.createOscillator();
    osc.frequency.value = 220;
    osc.connect(dest);
    osc.start();
    return dest.stream;
  };
  Object.defineProperty(navigator, "mediaDevices", {
    value: { getUserMedia: patch, enumerateDevices: async () => [] },
    configurable: true,
  });
});
const page = await ctx.newPage();
await page.goto("http://localhost:3031/login");
const result = await page.evaluate(async () => {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const rec = new MediaRecorder(stream, { mimeType: "audio/webm" });
  const sizes = [];
  rec.ondataavailable = (e) => sizes.push(e.data.size);
  rec.start(500);
  await new Promise((r) => setTimeout(r, 2200));
  rec.requestData();
  await new Promise((r) => setTimeout(r, 300));
  rec.stop();
  return { tracks: stream.getAudioTracks().length, sizes };
});
console.log(JSON.stringify(result));
await browser.close();
