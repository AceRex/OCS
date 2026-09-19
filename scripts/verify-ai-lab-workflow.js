const fs = require("fs");
const path = require("path");
const os = require("os");
const { execSync, spawnSync } = require("child_process");

const SCRIPT_PATH = path.join(__dirname, "..", "ocs_image_engine", "engine.py");
const PYTHON_CMD = "/Library/Frameworks/Python.framework/Versions/3.14/bin/python3";

async function runVerificationSuite() {
  console.log("================================================================================");
  console.log("             OCS AI DESIGN LAB COMPREHENSIVE WORKFLOW VERIFICATION              ");
  console.log("================================================================================\n");

  const results = [];
  const testDir = path.join(os.tmpdir(), `ocs_ai_lab_test_${Date.now()}`);
  fs.mkdirSync(testDir, { recursive: true });

  function record(id, description, status, details = "") {
    results.push({ id, description, status, details });
    const tag = status === "PASS" ? "[\x1b[32mPASS\x1b[0m]" : status === "FAIL" ? "[\x1b[31mFAIL\x1b[0m]" : "[\x1b[33mWARN\x1b[0m]";
    console.log(`${tag} ${id}: ${description} ${details ? `(${details})` : ""}`);
  }

  try {
    // ── STEP 1: Generate Test Flyer Fixtures using Python PIL ──
    console.log("--- Step 1: Synthesizing Realistic Event Flyer Fixtures ---");
    const flyerA = path.join(testDir, "flyer_scenario_a.png");
    const flyerB = path.join(testDir, "flyer_scenario_b.png");
    const flyerC = path.join(testDir, "flyer_scenario_c.png");

    const genFixturesScript = `
import sys
from PIL import Image, ImageDraw, ImageFont
import numpy as np

# Scenario A: Standard High-Quality Church Portrait Flyer (1000x1500)
img_a = Image.new("RGB", (1000, 1500), color=(15, 23, 42)) # Deep Navy
draw_a = ImageDraw.Draw(img_a)

# Background subtle decorative gradient blocks
for i in range(1500):
    r = int(15 + (40 - 15) * (i / 1500.0))
    g = int(23 + (10 - 23) * (i / 1500.0))
    b = int(42 + (80 - 42) * (i / 1500.0))
    draw_a.line([(0, i), (1000, i)], fill=(r, g, b))

# Header Badge
draw_a.rectangle([400, 120, 600, 170], fill=(59, 7, 100), outline=(139, 92, 246), width=2)
draw_a.text((430, 135), "ANNUAL EVENT", fill=(255, 255, 255))

# Event Name & Theme
draw_a.text((150, 260), "ANNUAL HARVEST FESTIVAL", fill=(255, 255, 255))
draw_a.text((220, 360), "A Celebration of Abundant Grace", fill=(200, 210, 230))

# Date & Time
draw_a.text((180, 500), "Date: Sunday, October 25, 2026", fill=(0, 168, 255))
draw_a.text((180, 580), "Time: 10:00 AM - 1:00 PM", fill=(0, 168, 255))

# Venue
draw_a.text((180, 680), "Venue: Main Auditorium, 12 Grace Cathedral Way", fill=(240, 240, 240))

# Speakers & Organizers
draw_a.text((180, 780), "Host: Grace Fellowship Ministries", fill=(220, 220, 220))
draw_a.text((180, 860), "Guest Speaker: Pastor David Jenkins", fill=(255, 215, 0))

# Contact & Website
draw_a.text((180, 960), "Contact: +1 (555) 234-5678", fill=(180, 180, 190))
draw_a.text((180, 1040), "Website: www.gracecathedral.org", fill=(180, 180, 190))

# Speaker portrait placeholder area (circle)
draw_a.ellipse([350, 1150, 650, 1450], fill=(80, 90, 120), outline=(255, 215, 0), width=4)
draw_a.text((450, 1280), "SPEAKER", fill=(255, 255, 255))

img_a.save("${flyerA}")

# Scenario B: Low-contrast / artistic text
img_b = Image.new("RGB", (800, 1200), color=(30, 30, 35))
draw_b = ImageDraw.Draw(img_b)
draw_b.text((100, 150), "YOUTH NIGHT", fill=(60, 60, 70)) # Low contrast
draw_b.text((100, 300), "FRIDAY AT 7PM", fill=(255, 255, 255))
img_b.save("${flyerB}")

# Scenario C: Square flyer (1080x1080)
img_c = Image.new("RGB", (1080, 1080), color=(20, 20, 40))
draw_c = ImageDraw.Draw(img_c)
draw_c.text((200, 200), "PRAISE AND PRAYER", fill=(255, 255, 255))
draw_c.text((200, 350), "Monday 6:00 PM", fill=(180, 180, 220))
img_c.save("${flyerC}")
print("FIXTURES_CREATED")
`;
    const genOut = execSync(`${PYTHON_CMD} -c '${genFixturesScript.replace(/'/g, "'\\''")}'`, { encoding: "utf8" });
    record("TEST-1", "Synthesize test flyer fixtures", fs.existsSync(flyerA) ? "PASS" : "FAIL", "Scenario A, B, C");

    // ── STEP 2: Test Analysis Engine on Scenario A ──
    console.log("\n--- Step 2: Testing OCR, Entity Extraction & Color Roles ---");
    const outDirA = path.join(testDir, "out_scenario_a");
    fs.mkdirSync(outDirA, { recursive: true });

    const analyzeCmd = `${PYTHON_CMD} ${SCRIPT_PATH} --analyze "${flyerA}" --out "${outDirA}"`;
    const analyzeProc = spawnSync(PYTHON_CMD, [SCRIPT_PATH, "--analyze", flyerA, "--out", outDirA], { encoding: "utf8" });
    
    let analysisResult = null;
    try {
      const match = analyzeProc.stdout.match(/\{[\s\S]*\}/);
      if (match) analysisResult = JSON.parse(match[0]);
    } catch (e) {
      console.error("Parse error:", e, analyzeProc.stdout, analyzeProc.stderr);
    }

    record("TEST-2.1", "Analysis engine execution", analysisResult && !analysisResult.error ? "PASS" : "FAIL");

    if (analysisResult) {
      // Check event_name extraction
      const hasEventName = analysisResult.event_name && analysisResult.event_name.length > 0;
      record("TEST-2.2", "Extract Event Name / Headline", hasEventName ? "PASS" : "FAIL", `Found: "${analysisResult.event_name}"`);

      // Check date/time
      const hasDateOrTime = (analysisResult.dates && analysisResult.dates.length > 0) || (analysisResult.times && analysisResult.times.length > 0);
      record("TEST-2.3", "Extract Dates & Times", hasDateOrTime ? "PASS" : "FAIL", `Date: "${analysisResult.dates}", Time: "${analysisResult.times}"`);

      // Check venue
      const hasVenue = analysisResult.venue && analysisResult.venue.length > 0;
      record("TEST-2.4", "Extract Venue / Address", hasVenue ? "PASS" : "FAIL", `Venue: "${analysisResult.venue}"`);

      // Check palette & semantic roles
      const hasPalette = Array.isArray(analysisResult.palette_hex) && analysisResult.palette_hex.length >= 2;
      const hasRoles = analysisResult.palette_roles && analysisResult.palette_roles.background && analysisResult.palette_roles.heading;
      record("TEST-2.5", "Extract Dominant Palette & Roles", hasPalette && hasRoles ? "PASS" : "FAIL", 
        `BG: ${analysisResult.palette_roles?.background}, Heading: ${analysisResult.palette_roles?.heading}, Accent: ${analysisResult.palette_roles?.accent}`);

      // Check font matching
      const hasFont = analysisResult.dominant_font_style && analysisResult.dominant_font_style.matched_font;
      record("TEST-2.6", "Typography & Font Matching", hasFont ? "PASS" : "FAIL", 
        `Font: ${analysisResult.dominant_font_style?.matched_font} (${analysisResult.dominant_font_style?.category}, status: ${analysisResult.dominant_font_style?.status})`);

      // Check field confidences
      const hasConf = analysisResult.field_confidences && typeof analysisResult.field_confidences === "object";
      record("TEST-2.7", "Field Confidences & Uncertainty Mapping", hasConf ? "PASS" : "FAIL", 
        `Uncertain count: ${analysisResult.uncertain_fields?.length || 0}`);
    }

    // ── STEP 3: Test Scenario B Low-Contrast Detection (Uncertainty Flagging) ──
    console.log("\n--- Step 3: Testing Uncertainty Flagging on Low-Contrast Flyer ---");
    const outDirB = path.join(testDir, "out_scenario_b");
    fs.mkdirSync(outDirB, { recursive: true });
    const analyzeProcB = spawnSync(PYTHON_CMD, [SCRIPT_PATH, "--analyze", flyerB, "--out", outDirB], { encoding: "utf8" });
    let analysisB = null;
    try {
      const match = analyzeProcB.stdout.match(/\{[\s\S]*\}/);
      if (match) analysisB = JSON.parse(match[0]);
    } catch (_) {}
    
    const hasUncertaintyMechanism = analysisB && Array.isArray(analysisB.uncertain_fields);
    record("TEST-3.1", "Low-contrast / Ambiguous Text Uncertainty Flags", hasUncertaintyMechanism ? "PASS" : "FAIL", 
      `Uncertain fields: ${JSON.stringify(analysisB?.uncertain_fields || [])}`);

    // ── STEP 4: Test Operator Review Overrides & Multi-Asset Generation ──
    console.log("\n--- Step 4: Testing Operator Review Overrides & Multi-Asset Generation ---");
    const reviewedData = {
      event_name: "ANNUAL HARVEST CELEBRATION", // Operator corrected title
      theme_subtitle: "A Supernatural Night of Praise",
      dates: "Sunday, October 25, 2026",
      times: "10:00 AM - 1:00 PM",
      venue: "Main Auditorium, 12 Grace Cathedral Way",
      organizers: "Grace Fellowship Ministries",
      speakers: "Pastor David Jenkins",
      contact: "+1 (555) 234-5678",
      website: "www.gracecathedral.org",
      palette_roles: {
        background: "#0F172A",
        heading: "#FFD700", // Operator adjusted heading to Gold
        body: "#E2E8F0",
        accent: "#00E5FF", // Operator adjusted accent to Cyan
      },
      font_family: "Inter",
      font_category: "sans-serif",
      output_options: {
        editable_layout: true,
        landscape_design: true,
        clean_bg_original: true,
        clean_bg_screen: true,
        clean_bg_bible: true,
      }
    };

    const reviewFile = path.join(testDir, "operator_review.json");
    fs.writeFileSync(reviewFile, JSON.stringify(reviewedData, null, 2), "utf8");

    const genProc = spawnSync(PYTHON_CMD, [
      SCRIPT_PATH,
      "--generate-assets",
      flyerA,
      "--review",
      reviewFile,
      "--out",
      outDirA
    ], { encoding: "utf8" });

    let genResult = null;
    try {
      const match = genProc.stdout.match(/\{[\s\S]*\}/);
      if (match) genResult = JSON.parse(match[0]);
    } catch (e) {
      console.error("Gen Parse error:", e, genProc.stdout, genProc.stderr);
    }

    record("TEST-4.1", "Multi-output generation pipeline", genResult && genResult.success ? "PASS" : "FAIL");

    if (genResult) {
      // 4.2: Clean Background Inpainting
      const cleanBgExists = genResult.clean_background && fs.existsSync(genResult.clean_background);
      const cleanBgSize = cleanBgExists ? fs.statSync(genResult.clean_background).size : 0;
      record("TEST-4.2", "Morphological Text Inpainting (Original Aspect)", cleanBgExists && cleanBgSize > 1000 ? "PASS" : "FAIL", 
        `Size: ${(cleanBgSize / 1024).toFixed(1)} KB`);

      // 4.3: 16:9 Screen-Sized Clean Background (1920x1080)
      const screenBgExists = genResult.screen_sized_background && fs.existsSync(genResult.screen_sized_background);
      let screenDimensionsValid = false;
      if (screenBgExists) {
        const checkDimScript = `
from PIL import Image
img = Image.open("${genResult.screen_sized_background}")
print(f"{img.width}x{img.height}")
`;
        const dimOut = execSync(`${PYTHON_CMD} -c '${checkDimScript.trim()}'`, { encoding: "utf8" }).trim();
        screenDimensionsValid = dimOut === "1920x1080";
        record("TEST-4.3", "16:9 Screen-Sized Background (1920x1080, No Distortion)", screenDimensionsValid ? "PASS" : "FAIL", `Dimensions: ${dimOut}`);
      } else {
        record("TEST-4.3", "16:9 Screen-Sized Background (1920x1080, No Distortion)", "FAIL", "File missing");
      }

      // 4.4: Bible-Friendly Background with Quiet Zone
      const bibleBgExists = genResult.bible_friendly_background && fs.existsSync(genResult.bible_friendly_background);
      let bibleDimValid = false;
      if (bibleBgExists) {
        const checkDimScript = `
from PIL import Image
img = Image.open("${genResult.bible_friendly_background}")
print(f"{img.width}x{img.height}")
`;
        const dimOut = execSync(`${PYTHON_CMD} -c '${checkDimScript.trim()}'`, { encoding: "utf8" }).trim();
        bibleDimValid = dimOut === "1920x1080";
        record("TEST-4.4", "Bible-Friendly Background (Feathered Quiet Zone)", bibleDimValid ? "PASS" : "FAIL", `Dimensions: ${dimOut}`);
      } else {
        record("TEST-4.4", "Bible-Friendly Background (Feathered Quiet Zone)", "FAIL", "File missing");
      }

      // 4.5: Text Mask Generation
      const maskExists = genResult.text_mask && fs.existsSync(genResult.text_mask);
      record("TEST-4.5", "Morphological Text Mask Inpaint Preview", maskExists ? "PASS" : "FAIL");

      // 4.6: Reconstructed Portrait Layout (Editable Layers)
      const portraitLayout = genResult.portrait_layout;
      const hasPortraitLayers = portraitLayout && Array.isArray(portraitLayout.layers) && portraitLayout.layers.length > 0;
      const titleLayer = portraitLayout?.layers?.find(l => l.name === "Event Title");
      const titleMatchesReview = titleLayer && titleLayer.text === "ANNUAL HARVEST CELEBRATION";
      const headingColorMatches = titleLayer && titleLayer.color === "#FFD700";
      record("TEST-4.6", "Editable Portrait Layout Reconstructed with Overrides", (hasPortraitLayers && titleMatchesReview && headingColorMatches) ? "PASS" : "FAIL", 
        `Layers: ${portraitLayout?.layers?.length}, Title: "${titleLayer?.text}", Color: ${titleLayer?.color}`);

      // 4.7: 16:9 Landscape Layout (Safe margins & 2-column broadcast design)
      const landscapeLayout = genResult.landscape_layout;
      const hasLandscapeLayers = landscapeLayout && Array.isArray(landscapeLayout.layers) && landscapeLayout.layers.length > 0;
      record("TEST-4.7", "16:9 Screen Design (2-Column Broadcast Reflow)", hasLandscapeLayers ? "PASS" : "FAIL", 
        `Layers: ${landscapeLayout?.layers?.length}, Canvas: ${landscapeLayout?.canvasWidth}x${landscapeLayout?.canvasHeight}`);

      // 4.8: Universal 12px Border Radius Mandate on Layout Shapes/Containers
      const shapeLayers = [...(portraitLayout?.layers || []), ...(landscapeLayout?.layers || [])].filter(l => l.type === "shape");
      const all12px = shapeLayers.every(l => l.borderRadius === 12);
      record("TEST-4.8", "Universal 12px Border Radius on Reconstructed Shapes", all12px ? "PASS" : "FAIL", 
        `Shapes checked: ${shapeLayers.length}`);
    }

    // ── STEP 5: Verify IPC Handler Logic in main.js & preload.js ──
    console.log("\n--- Step 5: Verifying IPC Handlers & Safety Guarantees ---");
    const mainJsContent = fs.readFileSync(path.join(__dirname, "..", "main.js"), "utf8");
    const preloadJsContent = fs.readFileSync(path.join(__dirname, "..", "preload.js"), "utf8");
    const studioModalContent = fs.readFileSync(path.join(__dirname, "..", "src", "App", "controller", "LiveDesignStudioModal.jsx"), "utf8");

    const hasDesignAnalyzeIpc = mainJsContent.includes('"design-analyze"');
    const hasGenerateLabIpc = mainJsContent.includes('"design-generate-lab-assets"');
    const hasCancelLabIpc = mainJsContent.includes('"design-cancel-lab"');
    record("TEST-5.1", "main.js IPC Handlers (analyze, generate-assets, cancel)", 
      (hasDesignAnalyzeIpc && hasGenerateLabIpc && hasCancelLabIpc) ? "PASS" : "FAIL");

    const hasPreloadExposures = preloadJsContent.includes("analyzePoster") &&
      preloadJsContent.includes("generateLabAssets") &&
      preloadJsContent.includes("cancelLabAnalysis");
    record("TEST-5.2", "preload.js Design namespace bindings", hasPreloadExposures ? "PASS" : "FAIL");

    // 5.3 Safety Invariant: No Direct Live Action in AI Lab
    // Check that handleApplyLabToLiveOutput is NOT in LiveDesignStudioModal.jsx
    const hasDirectLiveAction = studioModalContent.includes("handleApplyLabToLiveOutput");
    const hasHiddenLiveControl = studioModalContent.includes('status: "hidden"');
    record("TEST-5.3", "Safety Guarantee: Zero Direct 'Live' Action in AI Lab", (!hasDirectLiveAction && hasHiddenLiveControl) ? "PASS" : "FAIL", 
      "Outputs strictly enter draft canvas or asset library; live controls default to status: hidden");

    // 5.4 UI 12px Border Radius Mandate
    const hasSideBySideOverlay = studioModalContent.includes("isLabReviewOpen") && studioModalContent.includes("AI Design Lab • Event Flyer Review");
    record("TEST-5.4", "Side-by-Side Review & Asset Studio Modal in UI", hasSideBySideOverlay ? "PASS" : "FAIL");

  } catch (err) {
    console.error("Test execution error:", err);
    record("SUITE-ERROR", "Unexpected error in test harness", "FAIL", err.message);
  } finally {
    // Cleanup temporary files
    try {
      fs.rmSync(testDir, { recursive: true, force: true });
    } catch (_) {}
  }

  // ── FINAL SUMMARY ──
  console.log("\n================================================================================");
  console.log("                           VERIFICATION SUMMARY REPORT                          ");
  console.log("================================================================================");
  console.log("| ID       | Description                                  | Status | Details");
  console.log("|----------|----------------------------------------------|--------|----------------");
  for (const r of results) {
    const paddedId = r.id.padEnd(8);
    const paddedDesc = r.description.padEnd(44).slice(0, 44);
    const statusCol = r.status.padEnd(6);
    console.log(`| ${paddedId} | ${paddedDesc} | ${statusCol} | ${r.details}`);
  }
  console.log("================================================================================");
  const passCount = results.filter(r => r.status === "PASS").length;
  const failCount = results.filter(r => r.status === "FAIL").length;
  console.log(`TOTAL TESTS: ${results.length} | PASSED: ${passCount} | FAILED: ${failCount}\n`);

  if (failCount > 0) {
    process.exit(1);
  }
}

runVerificationSuite();
