
const stagesService = require('../src/services/stages.service');
const knowledgeUploadService = require('../src/services/knowledge-upload.service');

console.log('--- DEBUGGING KNOWLEDGE STATE ---');

// 1. Check Active Stages
console.log('\n1. Active Stages from stagesService:');
const activeStages = stagesService.getActiveStages();
const activeStageIds = activeStages.map(s => s.id);
console.log('Active IDs:', activeStageIds);
activeStages.forEach(s => {
    console.log(` - [${s.id}] ${s.name} (Active: ${s.is_active})`);
});

// 2. Check All Files
console.log('\n2. All Files in Knowledge Index:');
const files = knowledgeUploadService.getUploadedFiles(); // Access the array directly
console.log(`Total Files: ${files.length}`);

// Find the specific file usually
const targetFile = files.find(f => f.originalName.includes('responsabilidades'));
if (targetFile) {
    console.log('\n🎯 Target File Found:', targetFile.originalName);
    console.log('   ID:', targetFile.id);
    console.log('   Stage ID:', targetFile.stageId);
    console.log('   Relative Path:', targetFile.relativePath);

    // Check coverage
    const isStageActive = !targetFile.stageId || activeStageIds.includes(targetFile.stageId);
    console.log(`   👉 Is Stage Active? ${isStageActive ? 'YES ✅' : 'NO ❌'}`);

    if (!isStageActive) {
        console.log('   ⚠️ File is HIDDEN because its stage is inactive.');
        // Verify stage state in ALL stages
        const allStages = stagesService.getAllStages();
        const parentStage = allStages.find(s => s.id === targetFile.stageId);
        console.log('   Parent Stage State:', parentStage);
    }
} else {
    console.log('⚠️ Target file "responsabilidades" not found in index.');
    // List all files briefly
    files.forEach(f => console.log(` - ${f.originalName} (Stage: ${f.stageId})`));
}

// 3. Test Search
console.log('\n3. Testing Search');
const query = "responsabilidades";
const results = knowledgeUploadService.searchInFiles(query);
console.log(`Query: "${query}" - Results: ${results.length}`);
results.forEach(r => console.log(` - ${r.source} (Score: ${r.score})`));
