/* take-recorder.js: records the camera itself, for filming JT's demo
 * (jt-demo-film branch only; tools/demo-video/jt-film.mjs turns the take into
 * the film). Off unless the address has ?record=1.
 *
 *   ?record=1           pick a camera from a list, record it at up to 1920x1080
 *   ?record=1&cam=iph   skip the list: the first camera whose name contains "iph"
 *
 * The take is the camera picture itself (never the screen), unmirrored, saved
 * to Downloads as handful-take-<time>.mp4 (Safari) or .webm (Chrome) when the
 * session ends, or at once with the red button in the top right corner. */

const params = new URLSearchParams(location.search);
export const RECORD_MODE = params.get("record") === "1";
// ?mirror=0: no mirror image on screen (css/style.css html.no-mirror)
if (params.get("mirror") === "0") document.documentElement.classList.add("no-mirror");
// ?srcmirror=1: the camera itself sends a mirror image (js/core/tracker.js)
if (params.get("srcmirror") === "1") document.documentElement.classList.add("src-mirror");
const CAM_KEY = "jt-demo-camera";

let recorder = null, chunks = [], startedAt = 0, saved = false, badge = null, tick = null;

/* The getUserMedia constraints for record mode: the camera the person picked,
 * at up to 1080p, so the take is sharp. */
export async function recordConstraints() {
  // Labels are blank until the page has camera permission once.
  const probe = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
  probe.getTracks().forEach((t) => t.stop());
  const cams = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === "videoinput");
  const want = params.get("cam")?.toLowerCase();
  let pick = want ? cams.find((c) => c.label.toLowerCase().includes(want)) : null;
  if (!pick && cams.length > 1) pick = await askCamera(cams);
  pick ??= cams[0];
  return {
    audio: false,
    video: { deviceId: pick ? { exact: pick.deviceId } : undefined, width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30 } },
  };
}

function askCamera(cams) {
  return new Promise((resolve) => {
    const last = (() => { try { return localStorage.getItem(CAM_KEY); } catch { return null; } })();
    const box = document.createElement("div");
    box.style.cssText = "position:fixed;inset:0;z-index:99999;background:rgba(20,20,20,.55);display:grid;place-items:center;font:16px system-ui,sans-serif";
    box.innerHTML = `<div style="background:#fff;border-radius:14px;padding:24px 26px;min-width:340px;box-shadow:0 10px 40px rgba(0,0,0,.3)">
      <div style="font-weight:700;font-size:18px;margin-bottom:6px">Which camera should film you?</div>
      <div style="color:#666;margin-bottom:14px">This camera is recorded for the demo film and used for the task.</div>
      <select style="width:100%;font-size:16px;padding:8px;border-radius:8px;margin-bottom:16px">${cams.map((c, i) =>
        `<option value="${i}" ${c.deviceId === last ? "selected" : ""}>${(c.label || `Camera ${i + 1}`).replace(/</g, "&lt;")}</option>`).join("")}</select>
      <button style="width:100%;font-size:16px;padding:10px;border:0;border-radius:10px;background:#1e3529;color:#fff;cursor:pointer">Use this camera</button></div>`;
    document.body.appendChild(box);
    box.querySelector("button").onclick = () => {
      const c = cams[+box.querySelector("select").value];
      try { localStorage.setItem(CAM_KEY, c.deviceId); } catch { /* private mode */ }
      box.remove();
      resolve(c);
    };
  });
}

/* Start recording the camera stream the task is using. */
export function startTake(stream) {
  if (recorder || !window.MediaRecorder) return;
  const types = ["video/mp4;codecs=avc1", "video/mp4", "video/webm;codecs=vp9", "video/webm"];
  const mimeType = types.find((t) => MediaRecorder.isTypeSupported(t)) || "";
  recorder = new MediaRecorder(stream, { ...(mimeType ? { mimeType } : {}), videoBitsPerSecond: 12_000_000 });
  chunks = [];
  recorder.ondataavailable = (e) => { if (e.data?.size) chunks.push(e.data); };
  recorder.start(1000);
  startedAt = Date.now();
  showBadge();
}

/* Stop and download the take (once). Safe to call more than once. */
export function saveTake() {
  if (!recorder || saved) return Promise.resolve();
  saved = true;
  return new Promise((resolve) => {
    recorder.onstop = () => {
      const type = recorder.mimeType || chunks[0]?.type || "video/webm";
      const blob = new Blob(chunks, { type });
      const ext = type.includes("mp4") ? "mp4" : "webm";
      const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `handful-take-${stamp}.${ext}`;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 60_000);
      if (badge) {
        clearInterval(tick);
        badge.textContent = `Saved ${a.download} to Downloads`;
        badge.style.background = "#1e3529";
      }
      resolve();
    };
    if (recorder.state !== "inactive") recorder.stop(); else recorder.onstop();
  });
}

function showBadge() {
  badge = document.createElement("button");
  badge.style.cssText = "position:fixed;top:10px;right:10px;z-index:99998;border:0;border-radius:20px;padding:7px 14px;background:#c0392b;color:#fff;font:600 13px system-ui,sans-serif;cursor:pointer;opacity:.9";
  const label = () => {
    const s = Math.round((Date.now() - startedAt) / 1000);
    badge.textContent = `● REC ${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}  ·  Stop & save`;
  };
  label();
  tick = setInterval(label, 1000);
  badge.tabIndex = -1;                       // the space bar must keep driving the task
  badge.onkeydown = (e) => e.preventDefault();
  badge.onclick = () => saveTake();
  document.body.appendChild(badge);
}
