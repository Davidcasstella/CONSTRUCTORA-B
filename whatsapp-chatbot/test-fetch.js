const fetch = require('node-fetch'); // wait, fetch is built-in in Node 18+

async function run() {
  try {
    // 1. Login
    const loginRes = await fetch('http://localhost:3001/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'norboy2026' }) 
    });
    
    const loginData = await loginRes.json();
    if (!loginData.token) {
      console.log('Login failed:', loginData);
      return;
    }
    
    console.log('Login success!');
    
    // 2. Fetch events
    const token = loginData.token;
    const eventsRes = await fetch('http://localhost:3001/api/calendar/events?start=2026-07-01T00:00:00.000Z&end=2026-08-01T00:00:00.000Z', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    console.log(`Status: ${eventsRes.status}`);
    const eventsData = await eventsRes.json();
    console.log(eventsData);
    
  } catch (err) {
    console.error(err);
  }
}

run();
