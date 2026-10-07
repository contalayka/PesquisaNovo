const fs = require('fs');
const html = fs.readFileSync('/tmp/g_translate.html', 'utf8');

const idx = html.indexOf('clip-player');
if (idx !== -1) {
  console.log('--- AROUND clip-player ---');
  console.log(html.substring(Math.max(0, idx - 500), Math.min(html.length, idx + 2500)));
}

const idxClip = html.indexOf('kg6JlM');
if (idxClip !== -1) {
  console.log('--- AROUND kg6JlM ---');
  console.log(html.substring(Math.max(0, idxClip - 500), Math.min(html.length, idxClip + 2000)));
}
