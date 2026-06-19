/**
 * Test getHistory method from repository
 */

require('dotenv').config();
const conversationRepository = require('./src/repositories/conversation.repository');
const logger = require('./src/utils/logger');

async function testGetHistory() {
    const userId = '573028599105@s.whatsapp.net';

    console.log(`\n🔍 Testing getHistory for: ${userId}\n`);
    console.log('='.repeat(60));

    try {
        const messages = await conversationRepository.getHistory(userId, { limit: 50 });

        console.log(`\n✅ Messages retrieved: ${messages.length}\n`);

        if (messages.length === 0) {
            console.log('⚠️  NO MESSAGES FOUND!');
            console.log('\nPossible reasons:');
            console.log('1. GSI index "participantId-timestamp-index" does not exist');
            console.log('2. participantId format mismatch');
            console.log('3. Messages not properly indexed');
        } else {
            console.log('Recent messages:\n');
            messages.slice(0, 10).forEach((msg, index) => {
                const msgObj = msg.toObject ? msg.toObject() : msg;
                console.log(`${index + 1}. ${msgObj.direction}: "${msgObj.content?.text?.substring(0, 50) || '[No text]'}"`);
                console.log(`   ID: ${msgObj.id}`);
                console.log(`   Timestamp: ${new Date(msgObj.createdAt).toLocaleString()}`);
                console.log();
            });
        }

    } catch (error) {
        console.error('\n❌ ERROR:', error.message);
        console.error('Error name:', error.name);
        if (error.$metadata) {
            console.error('HTTP Status:', error.$metadata.httpStatusCode);
        }
        console.error('\nFull error:', error);
    }
}

testGetHistory();
