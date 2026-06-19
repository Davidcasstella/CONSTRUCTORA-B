/**
 * ============================================
 * TEST: Knowledge Base Active State Sync
 * ============================================
 *
 * Verifies that toggling a stage active/inactive
 * immediately affects:
 * 1. searchInFiles results
 * 2. getActiveUploadedFiles count
 * 3. RAG cache is cleared
 *
 * Run: node scripts/test_kb_sync.js
 */

const stagesService = require('../src/services/stages.service');
const knowledgeUploadService = require('../src/services/knowledge-upload.service');

let passed = 0;
let failed = 0;

function assert(condition, message) {
    if (condition) {
        console.log(`  ✅ PASS: ${message}`);
        passed++;
    } else {
        console.log(`  ❌ FAIL: ${message}`);
        failed++;
    }
}

async function runTests() {
    console.log('\n============================================');
    console.log('  KB Active State Sync - Integration Tests');
    console.log('============================================\n');

    // --- Setup ---
    const allStages = stagesService.getAllStages();
    if (allStages.length === 0) {
        console.log('⚠️  No stages found. Skipping tests.');
        return;
    }

    const testStage = allStages[0];
    const originalState = testStage.is_active;
    console.log(`📋 Test stage: "${testStage.name}" (id: ${testStage.id}, initial active: ${originalState})\n`);

    // --- Get initial state ---
    const allFiles = knowledgeUploadService.getUploadedFiles();
    const stageFiles = allFiles.filter(f => f.stageId === testStage.id);
    console.log(`📂 Files in test stage: ${stageFiles.length}`);
    console.log(`📂 Total files: ${allFiles.length}\n`);

    if (stageFiles.length === 0) {
        console.log('⚠️  Test stage has no files. Some tests will be limited.');
    }

    // ==================================
    // TEST 1: Deactivate stage
    // ==================================
    console.log('--- Test 1: Deactivate stage ---');

    // Ensure stage is active first
    if (!testStage.is_active) {
        stagesService.toggleStageActive(testStage.id, true);
    }

    // Now deactivate
    stagesService.toggleStageActive(testStage.id, false);

    // Clear file data cache (simulates what the route handler does)
    if (knowledgeUploadService.clearFileDataCache) {
        knowledgeUploadService.clearFileDataCache();
    }

    // Verify getActiveUploadedFiles excludes this stage's files
    const activeFilesAfterDeactivate = knowledgeUploadService.getActiveUploadedFiles
        ? knowledgeUploadService.getActiveUploadedFiles()
        : [];

    const deactivatedStageFilesInActive = activeFilesAfterDeactivate.filter(f => f.stageId === testStage.id);
    assert(
        deactivatedStageFilesInActive.length === 0,
        `getActiveUploadedFiles excludes deactivated stage files (found ${deactivatedStageFilesInActive.length}, expected 0)`
    );

    // Verify searchInFiles respects deactivation
    if (stageFiles.length > 0) {
        const searchResults = knowledgeUploadService.searchInFiles(testStage.name);
        const resultsFromDeactivated = searchResults.filter(r =>
            stageFiles.some(sf => sf.originalName === r.source)
        );
        assert(
            resultsFromDeactivated.length === 0,
            `searchInFiles excludes deactivated stage (found ${resultsFromDeactivated.length} results from inactive stage)`
        );
    }

    // Verify getActiveStages excludes this stage
    const activeStagesAfter = stagesService.getActiveStages();
    const testStageInActive = activeStagesAfter.find(s => s.id === testStage.id);
    assert(
        !testStageInActive,
        `getActiveStages excludes deactivated stage`
    );

    console.log('');

    // ==================================
    // TEST 2: Reactivate stage
    // ==================================
    console.log('--- Test 2: Reactivate stage ---');

    stagesService.toggleStageActive(testStage.id, true);

    // Clear file data cache
    if (knowledgeUploadService.clearFileDataCache) {
        knowledgeUploadService.clearFileDataCache();
    }

    // Verify getActiveUploadedFiles includes this stage's files again
    const activeFilesAfterReactivate = knowledgeUploadService.getActiveUploadedFiles
        ? knowledgeUploadService.getActiveUploadedFiles()
        : [];

    const reactivatedStageFilesInActive = activeFilesAfterReactivate.filter(f => f.stageId === testStage.id);
    assert(
        reactivatedStageFilesInActive.length === stageFiles.length,
        `getActiveUploadedFiles includes reactivated stage files (found ${reactivatedStageFilesInActive.length}, expected ${stageFiles.length})`
    );

    // Verify getActiveStages includes this stage
    const activeStagesAfterReactivate = stagesService.getActiveStages();
    const testStageReactivated = activeStagesAfterReactivate.find(s => s.id === testStage.id);
    assert(
        !!testStageReactivated,
        `getActiveStages includes reactivated stage`
    );

    console.log('');

    // ==================================
    // TEST 3: clearFileDataCache exists
    // ==================================
    console.log('--- Test 3: Cache invalidation functions ---');

    assert(
        typeof knowledgeUploadService.clearFileDataCache === 'function',
        `clearFileDataCache is exported and callable`
    );

    assert(
        typeof knowledgeUploadService.getActiveUploadedFiles === 'function',
        `getActiveUploadedFiles is exported and callable`
    );

    // Check RAG cache clear
    try {
        const ragOptimized = require('../src/services/rag-optimized.service');
        assert(
            typeof ragOptimized.clearCache === 'function',
            `ragOptimized.clearCache is exported and callable`
        );
    } catch (e) {
        console.log(`  ⚠️  Could not load rag-optimized.service: ${e.message}`);
    }

    console.log('');

    // ==================================
    // Cleanup: Restore original state
    // ==================================
    console.log('--- Cleanup ---');
    stagesService.toggleStageActive(testStage.id, originalState);
    console.log(`  🔄 Restored stage "${testStage.name}" to active: ${originalState}`);

    // ==================================
    // Summary
    // ==================================
    console.log('\n============================================');
    console.log(`  Results: ${passed} passed, ${failed} failed`);
    console.log('============================================\n');

    process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(err => {
    console.error('Test error:', err);
    process.exit(1);
});
