#!/usr/bin/env python3
"""
OCS Voice Sidecar Server — v4 (Full Local AI via Ollama)
─────────────────────────────────────────────────────────
• Voice-to-Text  : faster-whisper  (local, offline)
• AI Refinement  : Ollama LLM      (local, offline — replaces Gemini)
• Image Analysis : Ollama Vision   (llava / llama3.2-vision — replaces Gemini Vision)

Endpoints
─────────
GET  /health          → server + ollama status
POST /transcribe      → whisper → ollama LLM refinement → bible match
POST /probe           → fast whisper keyword probe
POST /analyze-poster  → ollama vision multimodal poster analysis
POST /generate-asset  → placeholder (future local diffusion model)
POST /chat            → raw Ollama chat endpoint (for any AI prompt)
"""

import sys
import os
import json
import logging
import time
import threading
import re
import numpy as np
from flask import Flask, request, jsonify
from PIL import Image
import io
import base64
import requests

# ── Silence verbose library output ──────────────────────────────────────────
logging.basicConfig(level=logging.WARNING)
logging.getLogger("faster_whisper").setLevel(logging.WARNING)
os.environ["TOKENIZERS_PARALLELISM"] = "false"

# ── Ollama Config ────────────────────────────────────────────────────────────
OLLAMA_BASE_URL   = os.environ.get("OLLAMA_BASE_URL", "http://localhost:11434")
OLLAMA_LLM_MODEL  = os.environ.get("OLLAMA_LLM_MODEL", "llama3.2")        # text model
OLLAMA_VIS_MODEL  = os.environ.get("OLLAMA_VIS_MODEL", "llava")           # vision model
OLLAMA_TIMEOUT    = int(os.environ.get("OLLAMA_TIMEOUT", "30"))            # seconds

# ── Bible Metadata ──────────────────────────────────────────────────────────
BOOK_ALIASES = {
    'gen': 'Genesis', 'genesis': 'Genesis', 'genisis': 'Genesis',
    'ex': 'Exodus', 'exo': 'Exodus', 'exodus': 'Exodus',
    'lev': 'Leviticus', 'leviticus': 'Leviticus',
    'num': 'Numbers', 'numbers': 'Numbers',
    'deut': 'Deuteronomy', 'deuteronomy': 'Deuteronomy', 'deutronomy': 'Deuteronomy',
    'deu': 'Deuteronomy', 'josh': 'Joshua', 'joshua': 'Joshua',
    'judg': 'Judges', 'judges': 'Judges', 'ruth': 'Ruth',
    '1sam': '1 Samuel', '1samuel': '1 Samuel', 'first samuel': '1 Samuel', '1 sam': '1 Samuel', '1st samuel': '1 Samuel',
    '2sam': '2 Samuel', '2samuel': '2 Samuel', 'second samuel': '2 Samuel', '2 sam': '2 Samuel', '2nd samuel': '2 Samuel',
    'sam': 'Samuel', '1ki': '1 Kings', '1kings': '1 Kings', 'first kings': '1 Kings', '1 kings': '1 Kings',
    '2ki': '2 Kings', '2kings': '2 Kings', 'second kings': '2 Kings', '2 kings': '2 Kings',
    'kings': 'Kings', 'king': 'Kings', '1chr': '1 Chronicles', '1chronicles': '1 Chronicles', 'first chronicles': '1 Chronicles',
    '2chr': '2 Chronicles', '2chronicles': '2 Chronicles', 'second chronicles': '2 Chronicles',
    'chronicles': 'Chronicles', 'chron': 'Chronicles', 'chronicle': 'Chronicles',
    'ezra': 'Ezra', 'neh': 'Nehemiah', 'nehemiah': 'Nehemiah', 'esth': 'Esther', 'esther': 'Esther',
    'job': 'Job', 'ps': 'Psalms', 'psa': 'Psalms', 'psalm': 'Psalms', 'psalms': 'Psalms', 'sams': 'Psalms',
    'prov': 'Proverbs', 'proverbs': 'Proverbs', 'proverb': 'Proverbs',
    'eccl': 'Ecclesiastes', 'ecclesiastes': 'Ecclesiastes', 'song': 'Song of Solomon', 'songs': 'Song of Solomon',
    'song of songs': 'Song of Solomon', 'song of solomon': 'Song of Solomon', 'sos': 'Song of Solomon',
    'isa': 'Isaiah', 'isaiah': 'Isaiah', 'jer': 'Jeremiah', 'jeremiah': 'Jeremiah',
    'lam': 'Lamentations', 'lamentations': 'Lamentations', 'ezek': 'Ezekiel', 'ezekiel': 'Ezekiel',
    'dan': 'Daniel', 'daniel': 'Daniel', 'hos': 'Hosea', 'hosea': 'Hosea', 'joel': 'Joel',
    'amos': 'Amos', 'obad': 'Obadiah', 'obadiah': 'Obadiah', 'jonah': 'Jonah', 'jon': 'Jonah',
    'mic': 'Micah', 'micah': 'Micah', 'nah': 'Nahum', 'nahum': 'Nahum', 'hab': 'Habakkuk', 'habakkuk': 'Habakkuk',
    'zeph': 'Zephaniah', 'zephaniah': 'Zephaniah', 'hag': 'Haggai', 'haggai': 'Haggai',
    'zech': 'Zechariah', 'zechariah': 'Zechariah', 'mal': 'Malachi', 'malachi': 'Malachi',
    'matt': 'Matthew', 'matthew': 'Matthew', 'mathew': 'Matthew', 'mat': 'Matthew',
    'mark': 'Mark', 'mrk': 'Mark', 'marc': 'Mark', 'mac': 'Mark', 'march': 'Mark',
    'luke': 'Luke', 'luk': 'Luke', 'luc': 'Luke', 'look': 'Luke',
    'john': 'John', 'jn': 'John', 'joh': 'John', 'acts': 'Acts', 'act': 'Acts',
    'rom': 'Romans', 'romans': 'Romans',
    '1cor': '1 Corinthians', '1corinthians': '1 Corinthians', 'first corinthians': '1 Corinthians',
    '2cor': '2 Corinthians', '2corinthians': '2 Corinthians', 'second corinthians': '2 Corinthians',
    'cor': 'Corinthians', 'corinthian': 'Corinthians', 'gal': 'Galatians', 'galatians': 'Galatians',
    'eph': 'Ephesians', 'ephesians': 'Ephesians', 'phil': 'Philippians', 'philippians': 'Philippians',
    'col': 'Colossians', 'colossians': 'Colossians', '1thess': '1 Thessalonians', '1thessalonians': '1 Thessalonians',
    '2thess': '2 Thessalonians', '2thessalonians': '2 Thessalonians', 'thess': 'Thessalonians',
    '1tim': '1 Timothy', '1timothy': '1 Timothy', 'first timothy': '1 Timothy',
    '2tim': '2 Timothy', '2timothy': '2 Timothy', 'second timothy': '2 Timothy',
    'tim': 'Timothy', 'tit': 'Titus', 'titus': 'Titus', 'philem': 'Philemon', 'philemon': 'Philemon',
    'heb': 'Hebrews', 'hebrews': 'Hebrews', 'jam': 'James', 'james': 'James', 'jas': 'James',
    '1pet': '1 Peter', '1peter': '1 Peter', 'first peter': '1 Peter',
    '2pet': '2 Peter', '2peter': '2 Peter', 'second peter': '2 Peter', 'pet': 'Peter',
    '1john': '1 John', 'first john': '1 John', '1 john': '1 John',
    '2john': '2 John', 'second john': '2 John', '2 john': '2 John',
    '3john': '3 John', 'third john': '3 John', '3 john': '3 John', 'jude': 'Jude',
    'rev': 'Revelation', 'revelation': 'Revelation', 'revelations': 'Revelation',
}

BIBLE_BOOK_LIST = [
    "Genesis", "Exodus", "Leviticus", "Numbers", "Deuteronomy", "Joshua", "Judges", "Ruth",
    "1 Samuel", "2 Samuel", "1 Kings", "2 Kings", "1 Chronicles", "2 Chronicles", "Ezra", "Nehemiah",
    "Esther", "Job", "Psalms", "Proverbs", "Ecclesiastes", "Song of Solomon", "Isaiah", "Jeremiah",
    "Lamentations", "Ezekiel", "Daniel", "Hosea", "Joel", "Amos", "Obadiah", "Jonah", "Micah",
    "Nahum", "Habakkuk", "Zephaniah", "Haggai", "Zechariah", "Malachi", "Matthew", "Mark", "Luke",
    "John", "Acts", "Romans", "1 Corinthians", "2 Corinthians", "Galatians", "Ephesians", "Philippians",
    "Colossians", "1 Thessalonians", "2 Thessalonians", "1 Timothy", "2 Timothy", "Titus", "Philemon",
    "Hebrews", "James", "1 Peter", "2 Peter", "1 John", "2 John", "3 John", "Jude", "Revelation"
]

def parse_bible_ref(text: str):
    if not text: return None
    t = text.lower().strip()
    t = re.sub(r'\b(the book of|book of|read|please|open|to|go to|jump to|show|ocs|media|oasis|ocean|video)\b', ' ', t)
    t = re.sub(r'\b(chapter|verse|verses|vs|v)\b', ' ', t)
    t = re.sub(r'\s+', ' ', t).strip()

    matched_book = None
    remaining = t
    sorted_aliases = sorted(BOOK_ALIASES.keys(), key=len, reverse=True)
    for alias in sorted_aliases:
        m = re.search(fr'\b{alias}(?=[^a-z]|$)', t)
        if m:
            matched_book = BOOK_ALIASES[alias]
            remaining = t[m.end():].strip()
            break

    if not matched_book: return None

    nums = re.findall(r'\d+', remaining)
    book_idx = BIBLE_BOOK_LIST.index(matched_book) if matched_book in BIBLE_BOOK_LIST else -1
    if book_idx == -1: return None

    if not nums: return {"bookIndex": book_idx, "chapter": 1, "startVerse": 1, "endVerse": 1, "matchType": "alias"}

    chapter = int(nums[0])
    verse = int(nums[1]) if len(nums) > 1 else 1
    return {
        "bookIndex": book_idx,
        "chapter": chapter,
        "startVerse": verse,
        "endVerse": verse,
        "bookName": matched_book,
        "matchType": "alias"
    }

# ── Sidecar Config ───────────────────────────────────────────────────────────
SIDECAR_PORT  = 5421
MODEL_SIZE    = "base.en"
COMPUTE_TYPE  = "int8"
CACHE_DIR     = os.environ.get("OCS_MODEL_CACHE", os.path.expanduser("~/.cache/ocs_whisper"))

OCS_TRIGGER_WORDS = ["ocs", "o.c.s", "o c s", "oh see", "media"]
BIBLE_PROMPT  = "Media, John 3:16. OCS, next verse. Media, black screen. Genesis 1:1. " + " ".join(BIBLE_BOOK_LIST)
PROBE_PROMPT  = f"OCS. Media. {BIBLE_PROMPT}"

app = Flask(__name__)
_whisper_model = None
_model_lock    = threading.Lock()

# ── Ollama Helpers ────────────────────────────────────────────────────────────

def ollama_is_healthy() -> bool:
    """Quick check that Ollama daemon is running."""
    try:
        r = requests.get(f"{OLLAMA_BASE_URL}/api/tags", timeout=3)
        return r.ok
    except Exception:
        return False

def ollama_list_models() -> list:
    """Return list of locally pulled model names."""
    try:
        r = requests.get(f"{OLLAMA_BASE_URL}/api/tags", timeout=5)
        if r.ok:
            return [m["name"] for m in r.json().get("models", [])]
    except Exception:
        pass
    return []

def ollama_chat(prompt: str, model: str = None, system: str = None) -> str:
    """
    Send a single-turn chat message to Ollama and return the assistant reply.
    Falls back to empty string on any error so callers can degrade gracefully.
    """
    model = model or OLLAMA_LLM_MODEL
    messages = []
    if system:
        messages.append({"role": "system", "content": system})
    messages.append({"role": "user", "content": prompt})

    try:
        r = requests.post(
            f"{OLLAMA_BASE_URL}/api/chat",
            json={"model": model, "messages": messages, "stream": False},
            timeout=OLLAMA_TIMEOUT
        )
        if r.ok:
            return r.json().get("message", {}).get("content", "").strip()
    except Exception as e:
        logging.warning(f"[OLLAMA] chat error: {e}")
    return ""

def ollama_vision(prompt: str, image_b64: str, model: str = None) -> str:
    """
    Send an image + prompt to a vision-capable Ollama model (llava / llama3.2-vision).
    image_b64: raw base64 string (no data-URI prefix).
    """
    model = model or OLLAMA_VIS_MODEL
    try:
        r = requests.post(
            f"{OLLAMA_BASE_URL}/api/generate",
            json={
                "model": model,
                "prompt": prompt,
                "images": [image_b64],
                "stream": False
            },
            timeout=OLLAMA_TIMEOUT
        )
        if r.ok:
            return r.json().get("response", "").strip()
    except Exception as e:
        logging.warning(f"[OLLAMA] vision error: {e}")
    return ""

# ── Whisper Model Singleton ──────────────────────────────────────────────────

def get_whisper():
    global _whisper_model
    if _whisper_model is not None:
        return _whisper_model
    with _model_lock:
        if _whisper_model is not None:
            return _whisper_model
        from faster_whisper import WhisperModel
        _whisper_model = WhisperModel(MODEL_SIZE, device="cpu", compute_type=COMPUTE_TYPE, download_root=CACHE_DIR)
        return _whisper_model

# ── Routes ────────────────────────────────────────────────────────────────────

@app.route("/health", methods=["GET"])
def health():
    ollama_ok   = ollama_is_healthy()
    ollama_mods = ollama_list_models() if ollama_ok else []
    return jsonify({
        "status": "ok",
        "engine": "faster-whisper",
        "ollama": {
            "running": ollama_ok,
            "models": ollama_mods,
            "llm_model": OLLAMA_LLM_MODEL,
            "vision_model": OLLAMA_VIS_MODEL,
        }
    })


@app.route("/transcribe", methods=["POST"])
def transcribe():
    t_start = time.perf_counter()

    # ── Read audio ────────────────────────────────────────────────────────────
    if 'audio' in request.files:
        audio_np      = np.frombuffer(request.files['audio'].read(), dtype=np.float32)
        custom_prompt = request.form.get('prompt', '')
    elif request.is_json:
        data          = request.get_json(force=True)
        audio_np      = np.array(data.get("audio", []), dtype=np.float32)
        custom_prompt = data.get("prompt", "")
    else:
        audio_np      = np.frombuffer(request.data, dtype=np.float32)
        custom_prompt = ""

    if len(audio_np) == 0:
        return jsonify({"text": "", "confidence": 0})

    try:
        # ── Pass 1: faster-whisper ────────────────────────────────────────────
        model = get_whisper()
        with _model_lock:
            segments, _ = model.transcribe(
                audio_np,
                language            = "en",
                initial_prompt      = f"{custom_prompt}. {BIBLE_PROMPT}",
                beam_size           = 1,    # greedy — fastest
                vad_filter          = True,
                vad_parameters      = {"threshold": 0.5, "min_silence_duration_ms": 300},
                no_speech_threshold = 0.6,
                condition_on_previous_text = False
            )
            seg_list  = list(segments)
        full_text = " ".join(s.text.strip() for s in seg_list).strip()

        valid_segs  = [s for s in seg_list if hasattr(s, "avg_logprob")]
        avg_logprob = sum(s.avg_logprob for s in valid_segs) / len(valid_segs) if valid_segs else -0.5
        confidence  = round(1.0 - abs(max(-1.5, min(0.0, avg_logprob))) / 1.5, 3)

        bible_match = parse_bible_ref(full_text) if full_text else None
        t_ms = round((time.perf_counter() - t_start) * 1000)
        print(f'[VOICE] "{full_text}" (conf={confidence:.2f}, {t_ms}ms)')

        return jsonify({
            "text":        full_text,
            "raw_whisper": full_text,
            "confidence":  confidence,
            "avg_logprob": round(float(avg_logprob), 3),
            "latency_sec": round(t_ms / 1000, 3),
            "bible_match": bible_match,
            "engine":      "whisper"
        })

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/probe", methods=["POST"])
def probe():
    if 'audio' in request.files:
        audio_np = np.frombuffer(request.files['audio'].read(), dtype=np.float32)
    elif request.is_json:
        data     = request.get_json(force=True)
        audio_np = np.array(data.get("audio", []), dtype=np.float32)
    else:
        audio_np = np.frombuffer(request.data, dtype=np.float32)

    if len(audio_np) == 0:
        return jsonify({"text": "", "hasKeyword": False})

    try:
        model       = get_whisper()
        # Probes must be ultra-fast; no VAD, greedy decoding
        with _model_lock:
            segments, _ = model.transcribe(audio_np, language="en", initial_prompt=PROBE_PROMPT, beam_size=1, condition_on_previous_text=False)
            text        = " ".join(s.text.strip() for s in segments).strip().lower()
        has_keyword = any(kw in text for kw in OCS_TRIGGER_WORDS)
        bible_match = parse_bible_ref(text)
        return jsonify({"text": text, "hasKeyword": has_keyword, "bible_match": bible_match})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ── General Ollama Chat endpoint (for any AI prompt from the UI) ─────────────

@app.route("/chat", methods=["POST"])
def chat():
    """
    Generic local Ollama chat endpoint.
    Body: { "prompt": "...", "system": "...", "model": "llama3.2" }
    """
    data   = request.get_json(force=True) or {}
    prompt = data.get("prompt", "").strip()
    system = data.get("system", "")
    model  = data.get("model", OLLAMA_LLM_MODEL)

    if not prompt:
        return jsonify({"error": "No prompt provided"}), 400

    if not ollama_is_healthy():
        return jsonify({"error": "Ollama is not running. Start it with: ollama serve"}), 503

    t_start = time.perf_counter()
    reply   = ollama_chat(prompt, model=model, system=system or None)
    return jsonify({
        "response":    reply,
        "model":       model,
        "latency_sec": round(time.perf_counter() - t_start, 3)
    })


# ── AI Design Lab: Poster Analysis (Ollama Vision) ───────────────────────────

@app.route("/analyze-poster", methods=["POST"])
def analyze_poster():
    if 'image' not in request.files:
        return jsonify({"error": "No image uploaded"}), 400

    if not ollama_is_healthy():
        return jsonify({"error": "Ollama is not running. Start it with: ollama serve"}), 503

    try:
        img_file = request.files['image']
        img      = Image.open(img_file).convert("RGB")

        # Resize to keep payload manageable
        img.thumbnail((1024, 1024))
        buffer = io.BytesIO()
        img.save(buffer, format="JPEG", quality=85)
        img_b64 = base64.b64encode(buffer.getvalue()).decode("utf-8")

        vision_prompt = (
            "Analyze this church event poster and return a JSON object with these exact keys:\n"
            "1. event_details: { title, date, time, location }\n"
            "2. visual_theme: { primary_colors (list of hex codes), style (e.g. modern/traditional), mood }\n"
            "3. key_imagery: list of main subjects in the poster\n"
            "4. suggestions: list of 6 objects each with: type ('background' or 'lower_third'), "
            "label (short name), description (why it fits), generation_prompt (detailed image-gen prompt).\n"
            "Return ONLY valid JSON. No markdown code fences."
        )

        raw = ollama_vision(vision_prompt, img_b64)

        # Extract JSON from response
        json_match = re.search(r'\{.*\}', raw, re.DOTALL)
        if json_match:
            analysis = json.loads(json_match.group(0))
            return jsonify(analysis)
        else:
            return jsonify({"error": "Could not parse vision response as JSON", "raw": raw}), 500

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/generate-asset", methods=["POST"])
def generate_asset():
    """
    Future: local diffusion model integration.
    Currently returns metadata so the UI can call an external tool.
    """
    data   = request.get_json() or {}
    prompt = data.get("prompt", "")
    if not prompt:
        return jsonify({"error": "No prompt provided"}), 400

    return jsonify({
        "status":     "pending",
        "message":    "Local image generation not yet integrated. Consider adding ComfyUI or Stable Diffusion locally.",
        "prompt_used": prompt
    })


if __name__ == "__main__":
    print(f"[OCS] Voice Sidecar v4 — Ollama-powered local AI")
    print(f"[OCS] Whisper model  : {MODEL_SIZE} ({COMPUTE_TYPE})")
    print(f"[OCS] Ollama endpoint: {OLLAMA_BASE_URL}")
    print(f"[OCS] LLM model      : {OLLAMA_LLM_MODEL}")
    print(f"[OCS] Vision model   : {OLLAMA_VIS_MODEL}")
    print(f"[OCS] Listening on   : http://127.0.0.1:{SIDECAR_PORT}")
    app.run(host="127.0.0.1", port=SIDECAR_PORT, threaded=True)
