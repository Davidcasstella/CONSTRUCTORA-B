
const embeddingsService = require('../src/services/embeddings.service');
const logger = require('../src/utils/logger');

// Mock logger to avoid clutter
logger.info = (msg) => console.log(`[INFO] ${msg}`);
logger.warn = (msg) => console.log(`[WARN] ${msg}`);
logger.error = (msg) => console.error(`[ERROR] ${msg}`);
logger.debug = (msg) => { }; // Silence debug

async function verifyRaceCondition() {
    console.log('--- STARTING RACE CONDITION TEST ---');

    console.log('1. Triggering reloadChunks()...');
    const p1 = embeddingsService.reloadChunks();

    console.log('2. Immediately triggering loadAllChunks() (simulating concurrent search)...');
    const p2 = embeddingsService.loadAllChunks();

    console.log('3. Waiting for both promises...');

    const [res1, res2] = await Promise.all([p1, p2]);

    console.log('\n--- RESULTS ---');
    console.log(`Result 1 Length: ${res1 ? res1.length : 'null'}`);
    console.log(`Result 2 Length: ${res2 ? res2.length : 'null'}`);

    if (res1 === res2) {
        console.log('✅ PASS: Both promises returned the SAME reference (Singleton Promise working).');
    } else {
        console.error('❌ FAIL: Promises returned DIFFERENT references.');
    }

    if (res1.length > 0) {
        console.log('✅ PASS: Chunks were loaded successfully.');
    } else {
        console.error('❌ FAIL: No chunks loaded.');
    }

    // Test 3: Rapid sequential reloads
    console.log('\n4. Testing rapid sequential reloads...');
    const rp1 = embeddingsService.reloadChunks();
    const rp2 = embeddingsService.reloadChunks();
    const rp3 = embeddingsService.reloadChunks();

    const results = await Promise.all([rp1, rp2, rp3]);
    console.log(`Rapid Reload Results: ${results.map(r => r.length).join(', ')}`);

    if (results[0] === results[1] && results[1] === results[2]) {
        console.log('✅ PASS: Rapid reloads handled correctly.');
    } else {
        console.log('⚠️ NOTE: Rapid reloads returned different references (acceptable if new loads started, but check lengths).');
    }
}

verifyRaceCondition().catch(err => console.error(err));
