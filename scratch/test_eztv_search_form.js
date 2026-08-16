async function testEztvSearch() {
  const url = 'https://eztv.re/search/breaking-bad';
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
    }
  });
  console.log('Status:', res.status);
  const text = await res.text();
  console.log('HTML length:', text.length);
  console.log('Snippet:', text.slice(0, 500));

  // Check if Cloudflare or table exists
  const hasTable = text.includes('forum_header_border');
  console.log('Has table:', hasTable);
  const rows = text.split('<tr');
  console.log('Total <tr> count:', rows.length);
  rows.slice(1, 10).forEach((r, idx) => {
    if (r.includes('epinfo') || r.includes('magnet:?')) {
      const titleMatch = r.match(/class="epinfo"[^>]*>([^<]+)<\/a>/i);
      console.log(`Row #${idx}: ${titleMatch ? titleMatch[1] : 'found magnet'}`);
    }
  });
}

testEztvSearch();
