const fs = require('fs');
const path = require('path');

const CONFIG_DIR = path.join(__dirname, '..', 'src', 'providers', 'config');
const files = fs.readdirSync(CONFIG_DIR).filter((f) => f.endsWith('.json'));

const isMinimax = (s = '') => /minimax/i.test(String(s));
const isKimi = (s = '') => /kimi/i.test(String(s));
const isKimiK25 = (s = '') => /kimi[-_\/]?k2\.5|kimi-k2\.5/i.test(String(s));

let problems = [];
for (const file of files) {
  const p = path.join(CONFIG_DIR, file);
  const json = JSON.parse(fs.readFileSync(p, 'utf8'));
  if (!Array.isArray(json.models)) continue;
  for (const model of json.models) {
    const hay = `${model.id || ''} ${model.model || ''} ${model.name || ''}`.toLowerCase();
    if (isMinimax(hay)) {
      if (model.maxInputTokens !== 224000 || model.maxOutputTokens !== 32000) {
        problems.push({ file, id: model.id, maxInputTokens: model.maxInputTokens, maxOutputTokens: model.maxOutputTokens });
      }
    }
    if (isKimi(hay)) {
      const expectedImage = isKimiK25(hay);
      if (model.maxInputTokens !== 224000 || model.maxOutputTokens !== 32000) {
        problems.push({ file, id: model.id, maxInputTokens: model.maxInputTokens, maxOutputTokens: model.maxOutputTokens });
      }
      const imageActual = !!(model.capabilities && model.capabilities.imageInput);
      if (imageActual !== expectedImage) {
        problems.push({ file, id: model.id, imageActual, expectedImage });
      }
    }
  }
}

if (problems.length === 0) {
  console.log('All MiniMax and Kimi models comply with the requested settings.');
  process.exit(0);
}

console.log('Problems found:');
for (const p of problems) {
  console.log(JSON.stringify(p));
}
process.exit(1);
