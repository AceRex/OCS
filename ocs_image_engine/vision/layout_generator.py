"""
vision/layout_generator.py
==========================
Generates editable wave.io Design Studio layer trees from reviewed event information.
Produces:
1. Editable portrait layout reconstruction (layers for text, shapes, clean artwork, speakers)
2. 16:9 Screen-sized landscape event design (reflowed two-column broadcast composition)
All structural containers strictly enforce the universal 12px border radius mandate.
"""

from __future__ import annotations

import time
from typing import Dict, List, Any, Optional

def _make_id(prefix: str = "layer") -> str:
    return f"{prefix}_{int(time.time() * 1000)}_{abs(hash(str(time.time()))) % 10000}"

def _rgb_to_hex(c) -> str:
    if not c:
        return "#FFFFFF"
    if isinstance(c, str):
        return c if c.startswith("#") else f"#{c}"
    try:
        return f"#{int(c[0]):02x}{int(c[1]):02x}{int(c[2]):02x}"
    except Exception:
        return "#FFFFFF"

def generate_editable_portrait_layout(
    reviewed: Dict[str, Any],
    clean_bg_path: str,
    speaker_paths: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """
    Reconstructs the portrait flyer visual composition into editable Design Studio layers.
    Distinguishes editable layers from the underlying clean raster artwork.
    """
    layers: List[Dict[str, Any]] = []
    z = 10

    # 1. Base clean background (raster artwork with text removed)
    layers.append({
        "id": _make_id("bg_art"),
        "name": "Clean Flyer Artwork",
        "type": "image",
        "url": clean_bg_path,
        "content": clean_bg_path,
        "x": 50,
        "y": 50,
        "width": 100,
        "height": 100,
        "opacity": 1.0,
        "zIndex": z,
        "visible": True,
        "locked": False,
        "aspectRatio": 0.6667,
    })
    z += 10

    # Colors & Roles
    p_roles = reviewed.get("palette_roles") or {}
    heading_color = _rgb_to_hex(p_roles.get("heading") or reviewed.get("heading_color") or reviewed.get("primary_color") or (255, 255, 255))
    accent_color = _rgb_to_hex(p_roles.get("accent") or reviewed.get("accent_color") or (0, 168, 255))
    body_color = _rgb_to_hex(p_roles.get("body") or reviewed.get("body_color") or (220, 225, 235))
    card_bg = "rgba(13, 11, 20, 0.85)"

    font_family = reviewed.get("font_family") or reviewed.get("font_match") or "Inter, sans-serif"

    # 2. Speaker photo if detected
    if speaker_paths and len(speaker_paths) > 0:
        layers.append({
            "id": _make_id("speaker_photo"),
            "name": "Speaker Portrait",
            "type": "image",
            "url": speaker_paths[0],
            "content": speaker_paths[0],
            "x": 50,
            "y": 32,
            "width": 38,
            "height": 26,
            "borderRadius": 12,
            "opacity": 1.0,
            "stroke": accent_color,
            "strokeWidth": 2,
            "zIndex": z,
            "visible": True,
        })
        z += 10

    # 3. Event Title / Headline
    event_name = reviewed.get("event_name") or "SPECIAL WORSHIP SERVICE"
    layers.append({
        "id": _make_id("title_text"),
        "name": "Event Title",
        "type": "text",
        "text": event_name.upper(),
        "fieldBinding": "title",
        "fontFamily": font_family,
        "fontSize": 32,
        "fontWeight": "900",
        "color": heading_color,
        "textAlign": "center",
        "verticalAlign": "middle",
        "wrap": True,
        "x": 50,
        "y": 52,
        "width": 86,
        "height": 12,
        "zIndex": z,
        "visible": True,
        "shadowEnabled": True,
        "shadowColor": "#000000",
        "shadowBlur": 12,
        "shadowOffsetY": 4,
    })
    z += 10

    # 4. Theme / Subtitle
    theme = reviewed.get("theme_subtitle") or reviewed.get("subtitle") or ""
    if theme:
        layers.append({
            "id": _make_id("theme_text"),
            "name": "Theme & Subtitle",
            "type": "text",
            "text": theme,
            "fieldBinding": "subtitle",
            "fontFamily": font_family,
            "fontSize": 18,
            "fontWeight": "600",
            "color": accent_color,
            "textAlign": "center",
            "verticalAlign": "middle",
            "wrap": True,
            "x": 50,
            "y": 64,
            "width": 84,
            "height": 8,
            "zIndex": z,
            "visible": True,
        })
        z += 10

    # 5. Date & Time Badge Container (strictly 12px border radius)
    dates = reviewed.get("dates") or []
    times = reviewed.get("times") or []
    date_str = ", ".join(dates) if dates else "SUNDAY SERVICE"
    time_str = ", ".join(times) if times else "9:00 AM"
    datetime_label = f"{date_str} • {time_str}"

    layers.append({
        "id": _make_id("datetime_card"),
        "name": "Date & Time Container",
        "type": "shape",
        "shape": "rounded-rect",
        "x": 50,
        "y": 74,
        "width": 78,
        "height": 8,
        "borderRadius": 12,
        "fill": card_bg,
        "stroke": accent_color,
        "strokeWidth": 1.5,
        "opacity": 0.95,
        "zIndex": z,
        "visible": True,
    })
    z += 5

    layers.append({
        "id": _make_id("datetime_text"),
        "name": "Date & Time Text",
        "type": "text",
        "text": datetime_label,
        "fontFamily": font_family,
        "fontSize": 15,
        "fontWeight": "bold",
        "color": "#FFFFFF",
        "textAlign": "center",
        "verticalAlign": "middle",
        "x": 50,
        "y": 74,
        "width": 76,
        "height": 6,
        "zIndex": z,
        "visible": True,
    })
    z += 10

    # 6. Venue / Location & Contact Info
    venue = reviewed.get("venue") or ""
    contact = reviewed.get("contact") or reviewed.get("website") or ""
    venue_text = f"📍 {venue}" if venue else ""
    if contact:
        venue_text = f"{venue_text}  |  🌐 {contact}".strip(" | ")

    if venue_text:
        layers.append({
            "id": _make_id("venue_text"),
            "name": "Venue & Contact",
            "type": "text",
            "text": venue_text,
            "fieldBinding": "location",
            "fontFamily": font_family,
            "fontSize": 13,
            "fontWeight": "normal",
            "color": body_color,
            "textAlign": "center",
            "verticalAlign": "middle",
            "wrap": True,
            "x": 50,
            "y": 86,
            "width": 84,
            "height": 7,
            "zIndex": z,
            "visible": True,
        })
        z += 10

    return {
        "canvasWidth": 1200,
        "canvasHeight": 1800,
        "aspectRatio": "portrait",
        "layers": layers,
    }


def generate_screen_sized_landscape_design(
    reviewed: Dict[str, Any],
    clean_bg_screen_path: str,
    speaker_paths: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """
    Adapts the event flyer into an editable 1920x1080 (16:9) landscape broadcast presentation.
    Uses a clean 2-column layout: Visual artwork/portrait on the left, typography hierarchy on the right.
    """
    layers: List[Dict[str, Any]] = []
    z = 10

    # Colors & Roles
    p_roles = reviewed.get("palette_roles") or {}
    heading_color = _rgb_to_hex(p_roles.get("heading") or reviewed.get("heading_color") or (255, 255, 255))
    accent_color = _rgb_to_hex(p_roles.get("accent") or reviewed.get("accent_color") or (245, 158, 11))
    body_color = _rgb_to_hex(p_roles.get("body") or reviewed.get("body_color") or (203, 213, 225))
    card_bg = "rgba(15, 13, 27, 0.75)"
    font_family = reviewed.get("font_family") or reviewed.get("font_match") or "Inter, sans-serif"

    # 1. Screen-sized 16:9 Clean Background
    layers.append({
        "id": _make_id("screen_bg"),
        "name": "16:9 Screen Background",
        "type": "image",
        "url": clean_bg_screen_path,
        "content": clean_bg_screen_path,
        "x": 50,
        "y": 50,
        "width": 100,
        "height": 100,
        "opacity": 1.0,
        "zIndex": z,
        "visible": True,
        "aspectRatio": 1.777778,
    })
    z += 10

    # 2. Left Column Visual Card: Speaker or Artwork Showcase
    if speaker_paths and len(speaker_paths) > 0:
        layers.append({
            "id": _make_id("ls_speaker_card"),
            "name": "Speaker Portrait Frame",
            "type": "image",
            "url": speaker_paths[0],
            "content": speaker_paths[0],
            "x": 26,
            "y": 50,
            "width": 34,
            "height": 68,
            "borderRadius": 12,
            "stroke": accent_color,
            "strokeWidth": 3,
            "opacity": 1.0,
            "zIndex": z,
            "visible": True,
        })
        z += 10
    else:
        # Subtle glass accent card behind text
        layers.append({
            "id": _make_id("ls_accent_panel"),
            "name": "Glass Backdrop Card",
            "type": "shape",
            "shape": "rounded-rect",
            "x": 68,
            "y": 50,
            "width": 54,
            "height": 84,
            "borderRadius": 12,
            "fill": card_bg,
            "stroke": "rgba(255, 255, 255, 0.12)",
            "strokeWidth": 1.5,
            "zIndex": z,
            "visible": True,
        })
        z += 5

    # Right Column: Reflowed Typography Stack
    text_x = 68 if (speaker_paths and len(speaker_paths) > 0) else 68
    text_w = 52

    # Category / Series Pill
    org = reviewed.get("organizer") or "WAVE LIVE PRESENTATION"
    layers.append({
        "id": _make_id("ls_org_pill"),
        "name": "Series Category Pill",
        "type": "text",
        "text": org.upper(),
        "fontFamily": font_family,
        "fontSize": 14,
        "fontWeight": "bold",
        "color": accent_color,
        "textAlign": "left",
        "verticalAlign": "middle",
        "x": text_x,
        "y": 24,
        "width": text_w,
        "height": 5,
        "zIndex": z,
        "visible": True,
    })
    z += 10

    # Event Headline (reflowed for 16:9 readability)
    event_name = reviewed.get("event_name") or "SPECIAL WORSHIP SERVICE"
    layers.append({
        "id": _make_id("ls_title_text"),
        "name": "Landscape Event Headline",
        "type": "text",
        "text": event_name,
        "fieldBinding": "title",
        "fontFamily": font_family,
        "fontSize": 38,
        "fontWeight": "900",
        "color": heading_color,
        "textAlign": "left",
        "verticalAlign": "top",
        "wrap": True,
        "x": text_x,
        "y": 38,
        "width": text_w,
        "height": 18,
        "zIndex": z,
        "visible": True,
        "shadowEnabled": True,
        "shadowColor": "#000000",
        "shadowBlur": 10,
        "shadowOffsetY": 3,
    })
    z += 10

    # Theme / Subtitle
    theme = reviewed.get("theme_subtitle") or reviewed.get("subtitle") or ""
    if theme:
        layers.append({
            "id": _make_id("ls_theme_text"),
            "name": "Landscape Subtitle",
            "type": "text",
            "text": theme,
            "fieldBinding": "subtitle",
            "fontFamily": font_family,
            "fontSize": 20,
            "fontWeight": "600",
            "color": accent_color,
            "textAlign": "left",
            "verticalAlign": "middle",
            "wrap": True,
            "x": text_x,
            "y": 56,
            "width": text_w,
            "height": 8,
            "zIndex": z,
            "visible": True,
        })
        z += 10

    # Date / Time / Venue Container Card
    dates = reviewed.get("dates") or []
    times = reviewed.get("times") or []
    venue = reviewed.get("venue") or ""
    date_str = ", ".join(dates) if dates else "Upcoming Service"
    time_str = ", ".join(times) if times else "Doors Open Early"

    layers.append({
        "id": _make_id("ls_info_card"),
        "name": "Schedule Info Card",
        "type": "shape",
        "shape": "rounded-rect",
        "x": text_x,
        "y": 74,
        "width": text_w,
        "height": 16,
        "borderRadius": 12,
        "fill": card_bg,
        "stroke": "rgba(255, 255, 255, 0.15)",
        "strokeWidth": 1.5,
        "zIndex": z,
        "visible": True,
    })
    z += 5

    layers.append({
        "id": _make_id("ls_datetime_text"),
        "name": "Schedule Text",
        "type": "text",
        "text": f"📅 {date_str}   ⏰ {time_str}\n📍 {venue or 'Main Sanctuary'}",
        "fontFamily": font_family,
        "fontSize": 15,
        "fontWeight": "bold",
        "color": "#FFFFFF",
        "textAlign": "left",
        "verticalAlign": "middle",
        "lineSpacing": 1.35,
        "x": text_x,
        "y": 74,
        "width": text_w - 4,
        "height": 14,
        "zIndex": z,
        "visible": True,
    })
    z += 10

    return {
        "canvasWidth": 1920,
        "canvasHeight": 1080,
        "aspectRatio": "16:9",
        "layers": layers,
    }
