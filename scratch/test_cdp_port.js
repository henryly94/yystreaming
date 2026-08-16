async function checkCdp() {
  try {
    const res = await fetch('http://127.0.0.1:9000/json');
    if (res.ok) {
      const data = await res.json();
      console.log('✓ CDP Debug Port 9000 is ACTIVE! Targets:', data.length);
      data.forEach(t => console.log(`  - [${t.type}] ${t.title} (${t.webSocketDebuggerUrl})`));
    } else {
      console.log(`Port 9000 responded with status: ${res.status}`);
    }
  } catch (e) {
    console.log('Port 9000 is not active yet:', e.message);
  }
}

checkCdp();
