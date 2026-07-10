const fs = require('fs');
const html = fs.readFileSync('ddg_get.html', 'utf8');
const results = [];
const resultRegex = /<a\s+[^>]*href=(["'])(.*?)\1[^>]*class=(["'])result-link\3[^>]*>([\s\S]*?)<\/a>[\s\S]*?<td[^>]*class=(["'])result-snippet\5[^>]*>([\s\S]*?)<\/td>/g;

let match;
while ((match = resultRegex.exec(html)) !== null && results.length < 5) {
  let rawUrl = match[2];
  const uddgMatch = rawUrl.match(/uddg=([^&]+)/);
  if (uddgMatch) rawUrl = decodeURIComponent(uddgMatch[1]);
  if (rawUrl.startsWith("//")) rawUrl = `https:${rawUrl}`;

  results.push({
    title: match[4].replace(/<[^>]*>/g, "").trim(),
    link: rawUrl,
    snippet: match[6].replace(/<[^>]*>/g, "").trim()
  });
}

console.log('Results count:', results.length);
if (results.length === 0) {
    // try to find where it failed.
    console.log("Regex didn't match. Printing sample of result-link:");
    const linkMatches = html.match(/class="[^"]*result-link[^"]*"/g);
    console.log(linkMatches ? linkMatches.slice(0, 5) : "No result-link found");
    const snippetMatches = html.match(/class="[^"]*result-snippet[^"]*"/g);
    console.log(snippetMatches ? snippetMatches.slice(0, 5) : "No result-snippet found");
} else {
    console.log(results);
}
