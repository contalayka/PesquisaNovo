async function testClip() {
  const clipUrl = 'https://www.mercadolivre.com.br/shorts/clips/kg6JlM/balanca-cozinha-digital-sq-sf400-pesa-ate-10kg-branco';
  const gUrl = 'https://translate.google.com/translate?sl=auto&tl=en&u=' + encodeURIComponent(clipUrl);
  console.log('Fetching clip page via proxy...');
  const res = await fetch(gUrl, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
  });
  console.log('Clip status:', res.status);
  const text = await res.text();
  console.log('Clip len:', text.length);

  // Search for m3u8, mp4, stream, video
  const fs = require('fs');
  fs.writeFileSync('/tmp/ml_clip.html', text);

  const reVideo = /https?:\\?\/\\?\/[^\s"'<>]+\.(?:mp4|m3u8|webm)(?:\?[^\s"'<>]*)?/gi;
  let m;
  const urls = [];
  while ((m = reVideo.exec(text))) {
    urls.push(m[0].replace(/\\\//g, '/'));
  }
  console.log('Direct video URLs in clip:', [...new Set(urls)]);

  // Search for any stream or video CDN
  const reCdn = /https?:\\?\/\\?\/[^\s"'<>]*(?:stream\.mercadolibre|video\.mercadolibre|vod|clips|playback)[^\s"'<>]*/gi;
  const cdnUrls = [];
  while ((m = reCdn.exec(text))) {
    cdnUrls.push(m[0].replace(/\\\//g, '/'));
  }
  console.log('CDN URLs in clip:', [...new Set(cdnUrls)]);
}
testClip();
