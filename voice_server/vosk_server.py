"""
OCS Voice Sidecar v3
====================
Port 5422 — Vosk WebSocket (real-time PCM → transcript)
Port 5423 — HTTP API (aiohttp):
    GET  /health        → { ok, ollama: { running, model } }
    POST /chat          → { prompt, system?, model? } → { response, latency }
    POST /speak         → { text, voice? } → WAV audio bytes  (Piper TTS)
"""

import asyncio
import json
import os
import sys
import logging
import time
import subprocess
import shutil
import tempfile
import urllib.request
import urllib.error

logging.getLogger('websockets').setLevel(logging.ERROR)

# ── Vosk ───────────────────────────────────────────────────────────────────────
try:
    from vosk import Model, KaldiRecognizer
except ImportError:
    print("[Vosk] vosk not installed. Run: pip install vosk")
    sys.exit(1)

try:
    import websockets
except ImportError:
    print("[Vosk] websockets not installed. Run: pip install websockets")
    sys.exit(1)

# ── aiohttp HTTP server (optional — graceful if missing) ──────────────────────
try:
    import aiohttp
    from aiohttp import web as aiohttp_web
    AIOHTTP_AVAILABLE = True
except ImportError:
    AIOHTTP_AVAILABLE = False
    print("[HTTP] aiohttp not installed — Ollama/TTS API unavailable.")
    print("       Run: pip install aiohttp")

import platform

SCRIPT_DIR   = os.path.dirname(os.path.abspath(__file__))
OLLAMA_HOST  = "http://127.0.0.1:11434"
IS_WINDOWS   = platform.system() == 'Windows'

# Piper binary: piper.exe on Windows, piper on Mac/Linux
PIPER_EXE    = 'piper.exe' if IS_WINDOWS else 'piper'
PIPER_BIN    = shutil.which(PIPER_EXE) or os.path.join(SCRIPT_DIR, 'piper', PIPER_EXE)
PIPER_VOICES = os.path.join(SCRIPT_DIR, 'piper_voices')
DEFAULT_VOICE = 'en_US-amy-medium'

# ── Model selection ────────────────────────────────────────────────────────────
LARGE_MODEL = os.path.join(SCRIPT_DIR, "models", "vosk-model-en-us-0.22")
SMALL_MODEL = os.path.join(SCRIPT_DIR, "models", "vosk-model-small-en-us-0.15")

if os.path.exists(LARGE_MODEL):
    MODEL_PATH = LARGE_MODEL
    print("[Vosk] Using large model (vosk-model-en-us-0.22) — best accuracy")
elif os.path.exists(SMALL_MODEL):
    MODEL_PATH = SMALL_MODEL
    print("[Vosk] Using small model (vosk-model-small-en-us-0.15) — limited accuracy")
    print("[Vosk] TIP: Download https://alphacephei.com/vosk/models/vosk-model-en-us-0.22.zip")
else:
    print("[Vosk] Error: No model found in voice_server/models/")
    sys.exit(1)

model = Model(MODEL_PATH)
print(f"[Vosk] Loaded: {os.path.basename(MODEL_PATH)}")

# ── Ollama helpers ─────────────────────────────────────────────────────────────
async def ollama_running():
    if AIOHTTP_AVAILABLE:
        try:
            timeout = aiohttp.ClientTimeout(total=2)
            async with aiohttp.ClientSession(timeout=timeout) as session:
                async with session.get(f"{OLLAMA_HOST}/api/tags") as response:
                    if response.status != 200:
                        return False, []
                    data = await response.json()
                    models = [m["name"] for m in data.get("models", [])]
                    return True, models
        except Exception:
            return False, []

    def check_sync():
        req = urllib.request.Request(f"{OLLAMA_HOST}/api/tags", method="GET")
        with urllib.request.urlopen(req, timeout=2) as r:
            data = json.loads(r.read())
            models = [m["name"] for m in data.get("models", [])]
            return True, models

    try:
        return await asyncio.to_thread(check_sync)
    except Exception:
        return False, []

async def ollama_chat(prompt: str, system: str, model_name: str) -> dict:
    payload = json.dumps({
        "model": model_name,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user",   "content": prompt}
        ],
        "stream": False,
        "options": { "temperature": 0.4, "num_predict": 300 }
    }).encode()

    start = time.time()
    if AIOHTTP_AVAILABLE:
        try:
            timeout = aiohttp.ClientTimeout(total=60)
            async with aiohttp.ClientSession(timeout=timeout) as session:
                async with session.post(
                    f"{OLLAMA_HOST}/api/chat",
                    data=payload,
                    headers={"Content-Type": "application/json"}
                ) as response:
                    response.raise_for_status()
                    data = await response.json()
                    text = data.get("message", {}).get("content", "").strip()
                    return { "response": text, "latency": round(time.time() - start, 2) }
        except Exception as e:
            raise RuntimeError(f"Ollama chat failed: {e}")

    def chat_sync():
        req = urllib.request.Request(
            f"{OLLAMA_HOST}/api/chat",
            data=payload,
            headers={"Content-Type": "application/json"},
            method="POST"
        )
        with urllib.request.urlopen(req, timeout=60) as r:
            data = json.loads(r.read())
        text = data.get("message", {}).get("content", "").strip()
        return { "response": text, "latency": round(time.time() - start, 2) }

    return await asyncio.to_thread(chat_sync)

# ── Piper TTS helper ───────────────────────────────────────────────────────────
async def piper_speak(text: str, voice: str) -> bytes:
    """Run Piper CLI and return raw WAV bytes. Works on Mac, Linux, Windows."""
    if not os.path.exists(PIPER_BIN):
        raise FileNotFoundError(f"Piper binary not found at {PIPER_BIN}")

    onnx_path   = os.path.join(PIPER_VOICES, f"{voice}.onnx")
    config_path = os.path.join(PIPER_VOICES, f"{voice}.onnx.json")

    if not os.path.exists(onnx_path):
        raise FileNotFoundError(f"Piper voice model not found: {onnx_path}")

    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
        out_path = tmp.name

    # Piper bundles its own dylibs/so files next to the binary — point the OS to them
    piper_dir = os.path.dirname(PIPER_BIN)
    env = os.environ.copy()
    if platform.system() == 'Darwin':
        env['DYLD_LIBRARY_PATH'] = piper_dir + ':' + env.get('DYLD_LIBRARY_PATH', '')
    elif platform.system() == 'Linux':
        env['LD_LIBRARY_PATH'] = piper_dir + ':' + env.get('LD_LIBRARY_PATH', '')
    # Windows: DLLs are found automatically if in the same directory

    try:
        await asyncio.to_thread(
            subprocess.run,
            [PIPER_BIN, "--model", onnx_path, "--config", config_path,
             "--output_file", out_path],
            input=text.encode(),
            capture_output=True,
            timeout=30,
            check=True,
            env=env
        )
        def read_wav(path):
            with open(path, "rb") as f:
                return f.read()
        return await asyncio.to_thread(read_wav, out_path)
    finally:
        if os.path.exists(out_path):
            os.unlink(out_path)


# ── HTTP API ───────────────────────────────────────────────────────────────────
if AIOHTTP_AVAILABLE:
    async def handle_health(request):
        running, models = await ollama_running()
        best = models[0] if models else None
        return aiohttp_web.json_response({
            "ok": True,
            "vosk": os.path.basename(MODEL_PATH),
            "piper": os.path.exists(PIPER_BIN),
            "ollama": { "running": running, "models": models, "model": best }
        })

    async def handle_chat(request):
        try:
            body = await request.json()
        except Exception:
            return aiohttp_web.json_response({"error": "Invalid JSON"}, status=400)

        prompt = body.get("prompt", "").strip()
        if not prompt:
            return aiohttp_web.json_response({"error": "prompt required"}, status=400)

        system = body.get("system",
            "You are an AI assistant for OCS (Organised Church Service). "
            "Help with Bible questions, sermon notes, scripture explanations, "
            "and service planning. Be concise, warm, and accurate."
        )
        running, models = await ollama_running()
        if not running:
            return aiohttp_web.json_response({"error": "Ollama not running"}, status=503)

        # Use requested model or pick best available
        requested = body.get("model")
        model_name = requested if requested and requested in models else (models[0] if models else "llama3.2")

        try:
            result = await ollama_chat(prompt, system, model_name)
            result["model"] = model_name
            return aiohttp_web.json_response(result)
        except Exception as e:
            return aiohttp_web.json_response({"error": str(e)}, status=500)

    async def handle_speak(request):
        try:
            body = await request.json()
        except Exception:
            return aiohttp_web.json_response({"error": "Invalid JSON"}, status=400)

        text  = body.get("text", "").strip()
        voice = body.get("voice", DEFAULT_VOICE)
        if not text:
            return aiohttp_web.json_response({"error": "text required"}, status=400)

        try:
            wav_bytes = await piper_speak(text, voice)
            return aiohttp_web.Response(
                body=wav_bytes,
                content_type="audio/wav",
                headers={"Content-Disposition": "inline; filename=speech.wav"}
            )
        except FileNotFoundError as e:
            return aiohttp_web.json_response({"error": str(e), "piper_installed": False}, status=503)
        except Exception as e:
            return aiohttp_web.json_response({"error": str(e)}, status=500)

    def make_http_app():
        app = aiohttp_web.Application()
        app.router.add_get("/health", handle_health)
        app.router.add_post("/chat",   handle_chat)
        app.router.add_post("/speak",  handle_speak)
        return app

# ── Vosk WebSocket handler ─────────────────────────────────────────────────────
async def recognize(websocket):
    print("[Vosk] Client connected")
    rec = KaldiRecognizer(model, 16000)
    rec.SetWords(True)
    try:
        async for message in websocket:
            if isinstance(message, bytes):
                if rec.AcceptWaveform(message):
                    res = json.loads(rec.Result())
                    if res.get("text"):
                        await websocket.send(json.dumps({"text": res["text"], "isFinal": True}))
                else:
                    res = json.loads(rec.PartialResult())
                    if res.get("partial"):
                        await websocket.send(json.dumps({"text": res["partial"], "isFinal": False}))
    except websockets.exceptions.ConnectionClosed:
        print("[Vosk] Client disconnected")

# ── Entry point ────────────────────────────────────────────────────────────────
async def main():
    print("[Vosk] WebSocket on ws://127.0.0.1:5422")

    ws_server = websockets.serve(recognize, "127.0.0.1", 5422)

    if AIOHTTP_AVAILABLE:
        print("[HTTP] API on http://127.0.0.1:5423 (/health, /chat, /speak)")
        runner = aiohttp_web.AppRunner(make_http_app())
        await runner.setup()
        site = aiohttp_web.TCPSite(runner, "127.0.0.1", 5423)
        await site.start()

    async with ws_server:
        await asyncio.Future()  # run forever

if __name__ == "__main__":
    asyncio.run(main())
