const fs = require('fs');
const html = fs.readFileSync('/tmp/g_translate.html', 'utf8');

console.log('HTML length:', html.length);

const reJson = /"(?:videoUrl|video_url|video|stream|playUrl|m3u8Url|videoId|video_id)"\s*:\s*"([^"\\]+)"/gi;
let m;
const jsonMatches = [];
while ((m = reJson.exec(html))) {
  jsonMatches.push(m[0]);
}
console.log('JSON matches found:', jsonMatches.length, jsonMatches);

const vids = html.match(/<(?:video|source|iframe)\b[^>]*>/gi);
console.log('HTML video tags:', vids ? vids.length : 0, vids);

const streams = [];
const reStream = /https?:\\?\/\\?\/[^\s"'<>]*(?:stream\.mercadolibre|video\.mercadolibre|vod|clips|http2\.mlstatic\.com\/[^"'<>\s]*video)[^\s"'<>]*/gi;
while ((m = reStream.exec(html))) {
  streams.push(m[0]);
}
console.log('Stream matches:', streams.length, [...new Set(streams)]);

// Check for all mp4, m3u8, webm URLs
const mediaUrls = [];
const reMedia = /https?:\\?\/\\?\/[^\s"'<>]+\.(?:mp4|m3u8|webm)(?:\?[^\s"'<>]*)?/gi;
while ((m = reMedia.exec(html))) {
  mediaUrls.push(m[0]);
}
console.log('Direct media URLs:', mediaUrls.length, [...new Set(mediaUrls)]);
