#!/usr/bin/env python3
"""
OCS Voice Sidecar Server — v3 (Multipart Optimized)
A local-only Flask HTTP server that runs faster-whisper for offline,
low-latency speech transcription. Uses multipart/form-data for
robust binary + metadata transfer.
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

# ── Silence verbose library output ──────────────────────────────────────────
logging.basicConfig(level=logging.WARNING)
logging.getLogger("faster_whisper").setLevel(logging.WARNING)
os.environ["TOKENIZERS_PARALLELISM"] = "false"

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
    'john': 'John', 'jn': 'John', 'joh': 'John', 'jon': 'John', 'acts': 'Acts', 'act': 'Acts',
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
    # Cleanup
    t = re.sub(r'\b(the book of|book of|read|please|open|to|go to|jump to|show|ocs|media|oasis|ocean|meeting|video)\b', ' ', t)
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

# ── Config ──────────────────────────────────────────────────────────────────
SIDECAR_PORT = 5421
MODEL_SIZE = "base.en"
COMPUTE_TYPE = "int8"
CACHE_DIR = os.environ.get("OCS_MODEL_CACHE", os.path.expanduser("~/.cache/ocs_whisper"))

OCS_TRIGGER_WORDS = ["ocs", "o.c.s", "o c s", "oasis", "obvious", "osiris", "ocean", "media", "meeting", "meter", "medium", "video"]
BIBLE_PROMPT = " ".join(BIBLE_BOOK_LIST)
PROBE_PROMPT = f"OCS. Media. {BIBLE_PROMPT}"

app = Flask(__name__)
_model = None
_model_lock = threading.Lock()

def get_model():
    global _model
    if _model is not None: return _model
    with _model_lock:
        if _model is not None: return _model
        from faster_whisper import WhisperModel
        _model = WhisperModel(MODEL_SIZE, device="cpu", compute_type=COMPUTE_TYPE, download_root=CACHE_DIR)
        return _model

@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "engine": "faster-whisper"})

@app.route("/transcribe", methods=["POST"])
def transcribe():
    t_start = time.perf_counter()
    
    # Multipart handling for binary audio + metadata
    if 'audio' in request.files:
        audio_file = request.files['audio']
        audio_np = np.frombuffer(audio_file.read(), dtype=np.float32)
        custom_prompt = request.form.get('prompt', '')
    elif request.is_json:
        data = request.get_json(force=True)
        audio_np = np.array(data.get("audio", []), dtype=np.float32)
        custom_prompt = data.get("prompt", "")
    else:
        # Fallback to raw data if needed
        audio_np = np.frombuffer(request.data, dtype=np.float32)
        custom_prompt = ""

    if len(audio_np) == 0: return jsonify({"text": "", "confidence": 0})
    
    try:
        model = get_model()
        segments, info = model.transcribe(audio_np, language="en", initial_prompt=f"{custom_prompt}. {BIBLE_PROMPT}", beam_size=1, vad_filter=True)
        seg_list = list(segments)
        full_text = " ".join(s.text.strip() for s in seg_list).strip()
        
        valid_segs = [s for s in seg_list if hasattr(s, "avg_logprob")]
        avg_logprob = sum(s.avg_logprob for s in valid_segs) / len(valid_segs) if valid_segs else -0.5
        
        bible_match = parse_bible_ref(full_text)
        
        return jsonify({
            "text": full_text,
            "confidence": round(1.0 - abs(max(-1.5, min(0.0, avg_logprob))) / 1.5, 3),
            "avg_logprob": round(float(avg_logprob), 3),
            "latency_sec": round(time.perf_counter() - t_start, 3),
            "bible_match": bible_match
        })
    except Exception as e: return jsonify({"error": str(e)}), 500

@app.route("/probe", methods=["POST"])
def probe():
    if 'audio' in request.files:
        audio_file = request.files['audio']
        audio_np = np.frombuffer(audio_file.read(), dtype=np.float32)
    elif request.is_json:
        data = request.get_json(force=True)
        audio_np = np.array(data.get("audio", []), dtype=np.float32)
    else:
        audio_np = np.frombuffer(request.data, dtype=np.float32)
    
    if len(audio_np) == 0: return jsonify({"text": "", "hasKeyword": False})
    
    try:
        model = get_model()
        segments, _ = model.transcribe(audio_np, language="en", initial_prompt=PROBE_PROMPT, beam_size=1, vad_filter=True)
        text = " ".join(s.text.strip() for s in segments).strip().lower()
        has_keyword = any(kw in text for kw in OCS_TRIGGER_WORDS)
        bible_match = parse_bible_ref(text)
        return jsonify({"text": text, "hasKeyword": has_keyword, "bible_match": bible_match})
    except Exception as e: return jsonify({"error": str(e)}), 500

if __name__ == "__main__":
    app.run(host="127.0.0.1", port=SIDECAR_PORT, threaded=True)
