const fs = require("fs");
const path = require("path");
const os = require("os");
const crypto = require("crypto");
const { DesignStudioService } = require("../src/main/design/designStudioService");

// Minimal 1x1 transparent PNG binary
const TRANSPARENT_PNG_BUFFER = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64"
);

// Minimal 1x1 JPEG binary
const MINIMAL_JPEG_BUFFER = Buffer.from(
  "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=",
  "base64"
);

async function runTests() {
  console.log("=== OCS Design Studio Automated Verification Suite ===");
  const testDir = path.join(os.tmpdir(), `ocs_design_test_${Date.now()}`);
  fs.mkdirSync(testDir, { recursive: true });

  const fixturesDir = path.join(testDir, "fixtures");
  fs.mkdirSync(fixturesDir, { recursive: true });

  const transparentPngPath = path.join(fixturesDir, "overlay_logo.png");
  fs.writeFileSync(transparentPngPath, TRANSPARENT_PNG_BUFFER);

  const normalJpgPath = path.join(fixturesDir, "speaker_photo.jpg");
  fs.writeFileSync(normalJpgPath, MINIMAL_JPEG_BUFFER);

  const invalidFilePath = path.join(fixturesDir, "invalid.txt");
  fs.writeFileSync(invalidFilePath, "This is not an image file.");

  const corruptPngPath = path.join(fixturesDir, "corrupt.png");
  fs.writeFileSync(corruptPngPath, Buffer.from("CORRUPTDATA123456789"));

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  [PASS] ${message}`);
      passed++;
    } else {
      console.error(`  [FAIL] ${message}`);
      failed++;
    }
  }

  try {
    // ── Test 1: Service Initialization ────────────────────────────────────────
    console.log("\n1. Testing Service Initialization & Storage Paths...");
    const service = new DesignStudioService();
    service.initialize(testDir);

    assert(fs.existsSync(service.designAssetsPath), "design_assets directory created");
    assert(service.designs.length === 0, "Initial designs list is empty");

    // ── Test 2: Asset Import (PNG & JPEG) ──────────────────────────────────────
    console.log("\n2. Testing Local Image Import (PNG transparency & JPEG)...");
    const pngAsset = service.importImageFile(transparentPngPath);
    assert(pngAsset.format === "png", `PNG imported: format=${pngAsset.format}`);
    assert(pngAsset.assetId && pngAsset.assetId.length === 64, "SHA-256 assetId generated");
    assert(fs.existsSync(pngAsset.filePath), "Asset copied to managed storage");

    const jpgAsset = service.importImageFile(normalJpgPath);
    assert(jpgAsset.format === "jpg", `JPEG imported: format=${jpgAsset.format}`);
    assert(fs.existsSync(jpgAsset.filePath), "JPEG copied to managed storage");

    // ── Test 3: Deduplication ─────────────────────────────────────────────────
    console.log("\n3. Testing Asset Deduplication...");
    const dupAsset = service.importImageFile(transparentPngPath);
    assert(dupAsset.assetId === pngAsset.assetId, "Identical content yields identical assetId");
    assert(dupAsset.filePath === pngAsset.filePath, "Identical asset reuses same stored file (no duplicate file)");

    // ── Test 4: Unsupported and Corrupt File Handling ──────────────────────────
    console.log("\n4. Testing Unsupported and Corrupt File Rejection...");
    let rejectedUnsupported = false;
    try {
      service.importImageFile(invalidFilePath);
    } catch (err) {
      rejectedUnsupported = true;
      assert(err.message.includes("Unsupported format"), `Unsupported format caught: ${err.message}`);
    }
    assert(rejectedUnsupported, "Non-image extension correctly rejected");

    let rejectedCorrupt = false;
    try {
      service.importImageFile(corruptPngPath);
    } catch (err) {
      rejectedCorrupt = true;
      assert(err.message.includes("Failed to decode"), `Corrupt image caught: ${err.message}`);
    }
    assert(rejectedCorrupt, "Corrupt image bytes correctly rejected without crashing");

    // ── Test 5: Design Creation, Layer Composition, and Sanitization ──────────
    console.log("\n5. Testing Design Creation and Layer Properties...");
    const designData = {
      name: "Sunday Morning Lower Third",
      target: "both",
      layers: [
        {
          name: "Church Logo",
          assetId: pngAsset.assetId,
          filePath: pngAsset.filePath,
          x: 50,
          y: 85,
          width: 40,
          opacity: 0.95,
          visible: true,
          zIndex: 10,
        },
        {
          name: "Pastor Photo",
          assetId: jpgAsset.assetId,
          filePath: jpgAsset.filePath,
          x: 20,
          y: 85,
          width: 15,
          opacity: 1.0,
          visible: true,
          zIndex: 20,
        },
      ],
    };

    const saved = service.saveDesign(designData);
    assert(saved.id && saved.id.startsWith("design_"), "Design assigned persistent ID");
    assert(saved.layers.length === 2, "Both layers preserved in design");
    assert(saved.layers[0].opacity === 0.95, "Layer opacity preserved");
    assert(saved.layers[1].zIndex === 20, "Layer zIndex preserved");

    // ── Test 6: Persistence across Reboots ────────────────────────────────────
    console.log("\n6. Testing Design Persistence Across Restarts...");
    const service2 = new DesignStudioService();
    service2.initialize(testDir);

    const reloaded = service2.listDesigns();
    assert(reloaded.length === 1, "Design successfully reloaded after restart");
    assert(reloaded[0].name === "Sunday Morning Lower Third", "Design name preserved");
    assert(reloaded[0].layers.length === 2, "Layers preserved across restart");
    assert(reloaded[0].layers[0].isMissing === false, "Layer asset detected as present");

    // ── Test 7: Output Presentation & Decoupled State ─────────────────────────
    console.log("\n7. Testing Output Presentation Routing...");
    let liveStreamLayers = null;
    let liveSanctuaryLayers = null;

    const mockLiveUpdater = ({ target, layers }) => {
      if (target === "stream" || target === "both") {
        liveStreamLayers = layers;
      }
      if (target === "sanctuary" || target === "both") {
        liveSanctuaryLayers = layers;
      }
    };

    service2.presentDesign(saved, "both", mockLiveUpdater);
    assert(service2.getLiveState().isLive === true, "Live state indicates active");
    assert(service2.getLiveState().target === "both", "Target recorded as 'both'");
    assert(liveStreamLayers && liveStreamLayers.length === 2, "Stream received 2 overlay layers");
    assert(liveSanctuaryLayers && liveSanctuaryLayers.length === 2, "Sanctuary received 2 overlay layers");

    // Test Hide
    console.log("\n8. Testing Hide Overlay...");
    let clearedStream = false;
    let clearedSanctuary = false;
    service2.hideDesign(({ target, layers }) => {
      if (layers.length === 0) {
        clearedStream = true;
        clearedSanctuary = true;
      }
    });
    assert(service2.getLiveState().isLive === false, "Live state indicates offline");
    assert(clearedStream && clearedSanctuary, "Hide overlay signaled removal of all layers");

    // ── Test 9: Missing Asset Graceful Degradation ─────────────────────────────
    console.log("\n9. Testing Missing Asset Detection...");
    // Intentionally delete one of the assets from disk
    fs.unlinkSync(jpgAsset.filePath);

    const service3 = new DesignStudioService();
    service3.initialize(testDir);
    const designsWithMissing = service3.listDesigns();
    const missingLayer = designsWithMissing[0].layers.find((l) => l.assetId === jpgAsset.assetId);
    assert(missingLayer && missingLayer.isMissing === true, "Missing file accurately flagged without throwing error");

    // ── Test 10: Reference Counting on Deletion ───────────────────────────────
    console.log("\n10. Testing Asset Reference Counting & Orphan Cleanup...");
    // Create design 2 referencing pngAsset
    const design2 = service3.saveDesign({
      name: "Second Design",
      layers: [{ name: "Logo Only", assetId: pngAsset.assetId, filePath: pngAsset.filePath }],
    });

    // Delete first design
    service3.deleteDesign(saved.id);
    assert(fs.existsSync(pngAsset.filePath), "pngAsset preserved because design2 still references it");

    // Delete second design
    service3.deleteDesign(design2.id);
    assert(!fs.existsSync(pngAsset.filePath), "pngAsset cleaned up as orphan once no design references it");

    console.log(`\n======================================================`);
    console.log(`Test Results: ${passed} passed, ${failed} failed`);
    console.log(`======================================================\n`);

    if (failed > 0) {
      process.exit(1);
    }
  } finally {
    // Cleanup temporary test directory
    try {
      fs.rmSync(testDir, { recursive: true, force: true });
    } catch (_) {}
  }
}

runTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
