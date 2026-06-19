const k = require('../src/services/knowledge-upload.service');
const s = require('../src/services/stages.service');

console.log('\n=== STAGES ===');
const stages = s.getAllStages();
stages.forEach(st => console.log(`  ${st.id}: "${st.name}" active=${st.is_active}`));

console.log('\n=== FILES ===');
const allFiles = k.getUploadedFiles();
allFiles.forEach(f => console.log(`  ${f.originalName} -> stage: ${f.stageId}`));

console.log('\n=== ACTIVE FILES ===');
const activeFiles = k.getActiveUploadedFiles ? k.getActiveUploadedFiles() : [];
console.log(`  Active files: ${activeFiles.length} / ${allFiles.length}`);

console.log('\n=== SEARCH: "base de datos asociados" ===');
const results = k.searchInFiles('base de datos asociados');
console.log(`  Total results: ${results.length}`);
results.slice(0, 5).forEach((r, i) => {
    console.log(`  [${i}] source=${r.source}, score=${r.score}`);
    const idx = r.text ? r.text.indexOf('base de datos') : -1;
    if (idx >= 0) {
        console.log(`    >>> MATCH: "...${r.text.substring(Math.max(0, idx - 30), idx + 80)}..."`);
    } else {
        console.log(`    text preview: ${(r.text || '').substring(0, 120)}`);
    }
});

console.log('\n=== DONE ===');
