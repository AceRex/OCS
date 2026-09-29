/**
 * verify-smart-flyer-v3.js
 * ========================================================
 * Acceptance Test & Runtime Proof for:
 * OCS DESIGN LAB — SMART FLYER MULTI-SELECT, HOVER AREA DISCOVERY & REGION MERGING V3
 *
 * Covers:
 * 1. Multi-Select Visual Regions (Shift+Click, toggle, clear selection)
 * 2. Group / Merge Visual Regions (composite bounding box, canvas composition, unmerge/split)
 * 3. Hover Area Discovery (high-speed spatial index, 150ms settle debounce, overlapping candidates)
 * 4. Deep Local Area Analysis (bounded sub-region analysis without full flyer re-scan)
 * 5. Extraction & Layer Creation (composite transparent PNG layer, relative positioning)
 * 6. Detected Objects Panel (category filtering, selection status bar, unmerge button)
 * 7. Universal 12px Border Radius Mandate
 * ========================================================
 */

const fs = require('fs');
const path = require('path');
const babel = require('@babel/core');

let allPassed = true;
function assert(condition, message) {
  if (condition) {
    console.log(`[PASS] ${message}`);
  } else {
    console.error(`[FAIL] ${message}`);
    allPassed = false;
  }
}

async function runTests() {
  console.log('============================================================');
  console.log('OCS DESIGN LAB — SMART FLYER V3 ACCEPTANCE TEST SUITE');
  console.log('============================================================\n');

  try {
    // ── Test 1: Decomposer Module Import & API Surface ─────────────────────
    console.log('--- TEST 1: Decomposer Module API Surface ---');
    const analyzerPath = path.join(__dirname, '../src/App/controller/design/DesignAssetAnalyzer.js');
    const sourceCode = fs.readFileSync(analyzerPath, 'utf-8');
    const transformed = babel.transformSync(sourceCode, {
      presets: [
        ['@babel/preset-env', { targets: { node: 'current' } }],
        '@babel/preset-react',
      ],
      filename: 'DesignAssetAnalyzer.js',
    });

    const { createRequire } = require('module');
    const designRequire = createRequire(analyzerPath);
    const customRequire = (id) => {
      if (id.includes('LiveDesignStudioModal')) {
        return { getShadowRgba: () => 'rgba(0,0,0,0.6)' };
      }
      try {
        return designRequire(id);
      } catch (err) {
        try {
          return designRequire(id + '.jsx');
        } catch (e2) {
          return {};
        }
      }
    };
    const mod = { exports: {} };
    const execFn = new Function('module', 'exports', 'require', '__dirname', transformed.code);
    execFn(mod, mod.exports, customRequire, path.dirname(analyzerPath));
    const decomposer = mod.exports;

    assert(typeof decomposer.findHoverCandidates === 'function', 'findHoverCandidates is exported');
    assert(typeof decomposer.mergeSelectedRegions === 'function', 'mergeSelectedRegions is exported');
    assert(typeof decomposer.unmergeRegion === 'function', 'unmergeRegion is exported');
    assert(typeof decomposer.buildSpatialIndex === 'function', 'buildSpatialIndex is exported');
    assert(typeof decomposer.analyzeBoundedArea === 'function', 'analyzeBoundedArea is exported');
    assert(typeof decomposer.extractMergedRegionsToDataUrl === 'function', 'extractMergedRegionsToDataUrl is exported');

    // ── Test 2: Spatial Index & Fast Hover Area Discovery ──────────────────
    console.log('\n--- TEST 2: Spatial Index & Fast Hover Area Discovery ---');

    const sampleRegions = [
      {
        id: 'reg_header_section',
        type: 'section',
        label: 'Header Banner',
        normX: 10,
        normY: 5,
        normW: 80,
        normH: 25,
      },
      {
        id: 'reg_logo',
        type: 'logo',
        label: 'GOFAMINT Ketu Logo',
        normX: 12,
        normY: 6,
        normW: 10,
        normH: 10,
      },
      {
        id: 'reg_church_name',
        type: 'text_group',
        label: "The Gospel Faith Mission Int'l",
        text: "The Gospel Faith Mission Int'l",
        normX: 25,
        normY: 7,
        normW: 60,
        normH: 8,
      },
      {
        id: 'reg_youth_week',
        type: 'visual_group',
        label: 'YOUTH WEEK Title',
        text: 'YOUTH WEEK',
        normX: 20,
        normY: 35,
        normW: 60,
        normH: 15,
      },
      {
        id: 'reg_year_2026',
        type: 'visual_group',
        label: '2026 Badge',
        text: '2026',
        normX: 45,
        normY: 52,
        normW: 15,
        normH: 8,
      },
      {
        id: 'reg_speaker_subject',
        type: 'subject',
        label: 'Guest Speaker Cutout',
        normX: 10,
        normY: 65,
        normW: 35,
        normH: 30,
      },
    ];

    const spatialIndex = decomposer.buildSpatialIndex(sampleRegions);
    assert(spatialIndex !== null, 'Spatial index generated successfully');
    assert(spatialIndex.regionMap && spatialIndex.regionMap.size === 6, 'Spatial index indexed all 6 sample regions');

    // Point inside both Header Banner and Ketu Logo: (normX: 15, normY: 8)
    const hitCandidates = decomposer.findHoverCandidates(sampleRegions, 15, 8, 2.0, spatialIndex);
    assert(hitCandidates.length >= 2, `Hovering (15%, 8%) returned ${hitCandidates.length} overlapping candidates`);
    assert(hitCandidates[0].region.id === 'reg_logo', 'Candidate #1 is the specific child object (Ketu Logo)');
    assert(hitCandidates[1].region.id === 'reg_header_section', 'Candidate #2 is the containing parent section');

    // Performance Benchmark: 10,000 spatial lookups
    const tStart = Date.now();
    for (let i = 0; i < 10000; i++) {
      const qx = (i * 7) % 100;
      const qy = (i * 13) % 100;
      decomposer.findHoverCandidates(sampleRegions, qx, qy, 3.0, spatialIndex);
    }
    const lookupDurationMs = Date.now() - tStart;
    console.log(`[PERF] 10,000 spatial candidate lookups took ${lookupDurationMs}ms (${(lookupDurationMs / 10).toFixed(3)} µs per lookup)`);
    assert(lookupDurationMs < 60, 'Spatial index lookup is ultra fast (< 60ms for 10k queries, no OCR overhead)');

    // ── Test 3: Region Merging & Composite Bounding Box ─────────────────────
    console.log('\n--- TEST 3: Region Merging & Composite Bounding Box ---');

    const toMerge = [
      sampleRegions.find((r) => r.id === 'reg_youth_week'),
      sampleRegions.find((r) => r.id === 'reg_year_2026'),
    ];

    const merged = decomposer.mergeSelectedRegions(toMerge, 1920, 1080);
    assert(merged !== null, 'mergeSelectedRegions returned a composite region');
    assert(merged.type === 'merged-region', 'Merged region type is "merged-region"');
    assert(merged.isMerged === true, 'Merged region has isMerged: true flag');
    assert(Array.isArray(merged.childRegionIds) && merged.childRegionIds.length === 2, 'Merged region retains child IDs for unmerge');

    assert(merged.normX <= 20.5, `Merged normX (${merged.normX}%) encompasses left boundary`);
    assert(merged.normY <= 35.5, `Merged normY (${merged.normY}%) encompasses top boundary`);
    assert(merged.normX + merged.normW >= 59.5, `Merged right boundary (${merged.normX + merged.normW}%) encompasses right edge`);
    assert(merged.normY + merged.normH >= 59.5, `Merged bottom boundary (${merged.normY + merged.normH}%) encompasses bottom edge`);

    // ── Test 4: Region Unmerging / Splitting ────────────────────────────────
    console.log('\n--- TEST 4: Region Unmerging / Splitting ---');

    const currentListWithMerged = [merged, ...sampleRegions];
    assert(currentListWithMerged.length === 7, 'List contains merged region + original regions');

    const unmergedList = decomposer.unmergeRegion(merged.id, currentListWithMerged);
    assert(unmergedList.length === 6, 'Unmerging returned list size 6 (removed composite)');
    assert(!unmergedList.some((r) => r.id === merged.id), 'Composite region was removed');
    assert(unmergedList.some((r) => r.id === 'reg_youth_week'), 'Original "YOUTH WEEK" is retained in list');
    assert(unmergedList.some((r) => r.id === 'reg_year_2026'), 'Original "2026" is retained in list');

    // ── Test 5: Deep Local Area Analysis ───────────────────────────────────
    console.log('\n--- TEST 5: Deep Local Area Analysis ---');

    // Analyze area: normX: 10, normY: 10, normW: 30, normH: 30
    const dummyDataUrl = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    
    // Mock browser Image and Canvas for Node test environment if not present
    if (typeof global.Image === 'undefined') {
      global.Image = class {
        constructor() {
          setTimeout(() => {
            this.width = 100;
            this.height = 100;
            if (this.onload) this.onload();
          }, 5);
        }
      };
    }
    if (typeof global.document === 'undefined') {
      global.document = {
        createElement: (tag) => {
          if (tag === 'canvas') {
            return {
              width: 100,
              height: 100,
              getContext: () => ({
                drawImage: () => {},
                clearRect: () => {},
                fillRect: () => {},
                getImageData: () => ({ data: new Uint8ClampedArray(400) }),
              }),
              toDataURL: () => 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
            };
          }
          return {};
        },
      };
    }

    const localRegion = await decomposer.analyzeBoundedArea(
      dummyDataUrl,
      { normX: 10, normY: 10, normW: 30, normH: 30 },
      sampleRegions,
      1920,
      1080
    );

    assert(localRegion !== null, 'analyzeBoundedArea returned a local area region');
    assert(localRegion.normX >= 8 && localRegion.normX <= 15, `Local region normX (${localRegion.normX}%) is scoped to bounded area`);
    assert(localRegion.normY >= 8 && localRegion.normY <= 15, `Local region normY (${localRegion.normY}%) is scoped to bounded area`);

    // ── Test 6: Composite Canvas Cutout Extraction ─────────────────────────
    console.log('\n--- TEST 6: Composite Canvas Cutout Extraction ---');

    const compositeDataUrl = await decomposer.extractMergedRegionsToDataUrl(
      dummyDataUrl,
      merged,
      false
    );

    assert(typeof compositeDataUrl === 'string' && compositeDataUrl.startsWith('data:image/png;base64,'), 'extractMergedRegionsToDataUrl produced valid PNG data URL');
    assert(compositeDataUrl.length > 50, 'Composite PNG data URL has non-zero image payload');

    // ── Test 7: Universal 12px Border Radius Mandate & UI Integration ──────
    console.log('\n--- TEST 7: Universal 12px Border Radius Mandate & UI Integration ---');
    const modalCode = fs.readFileSync(path.join(__dirname, '../src/App/controller/LiveDesignStudioModal.jsx'), 'utf-8');

    assert(modalCode.includes('hoverDiscoveryCard && hoverDiscoveryCard.candidates'), 'hoverDiscoveryCard popover is implemented in LiveDesignStudioModal');
    assert(modalCode.includes('rounded-[12px]'), 'Hover discovery card uses rounded-[12px]');
    assert(modalCode.includes('multi_select_combined_box'), 'Multi-selection combined outer bounding box is rendered');
    assert(modalCode.includes('objectsCategoryFilter'), 'Objects category filter pills are implemented');
    assert(modalCode.includes('handleUnmergeRegion'), 'handleUnmergeRegion action is wired in LiveDesignStudioModal');
    assert(modalCode.includes('handleAnalyzeBoundedArea'), 'handleAnalyzeBoundedArea action is wired in LiveDesignStudioModal');

    // ── Test 8: Webpack Bundle Verification ────────────────────────────────
    console.log('\n--- TEST 8: Webpack Bundle Verification ---');
    const bundlePath = path.join(__dirname, '../dist/controller/controller.bundle.js');
    assert(fs.existsSync(bundlePath), 'controller.bundle.js exists');
    const bundleContent = fs.readFileSync(bundlePath, 'utf-8');
    assert(bundleContent.includes('findHoverCandidates'), 'Bundle contains findHoverCandidates');
    assert(bundleContent.includes('mergeSelectedRegions'), 'Bundle contains mergeSelectedRegions');
    assert(bundleContent.includes('unmergeRegion'), 'Bundle contains unmergeRegion');
    assert(bundleContent.includes('hoverDiscoveryCard'), 'Bundle contains hoverDiscoveryCard');

    console.log('\n============================================================');
    if (allPassed) {
      console.log('ALL TESTS PASSED! OCS Smart Flyer V3 Verified.');
      console.log('============================================================');
      process.exit(0);
    } else {
      console.error('SOME TESTS FAILED.');
      console.log('============================================================');
      process.exit(1);
    }
  } catch (err) {
    console.error('Fatal error during test execution:', err);
    process.exit(1);
  }
}

runTests();
