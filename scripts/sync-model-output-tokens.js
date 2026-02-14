const fs = require('fs');
const path = require('path');

const CONFIG_DIR = path.join(__dirname, '..', 'src', 'providers', 'config');
const files = fs.readdirSync(CONFIG_DIR).filter((f) => f.endsWith('.json'));

const RESULTS = [];
for (const file of files) {
    const p = path.join(CONFIG_DIR, file);
    const raw = fs.readFileSync(p, 'utf8');
    let json;
    try {
        json = JSON.parse(raw);
    } catch (err) {
        console.error(`Skipping ${file} - JSON parse error:`, err.message);
        continue;
    }
    if (!Array.isArray(json.models)) continue;
    let changed = false;
    const changedModels = [];
    for (const model of json.models) {
        if (!Object.prototype.hasOwnProperty.call(model, 'maxInputTokens')) continue;
        const inTokens = Number(model.maxInputTokens) || 0;
        const desired = inTokens >= 200000 ? 32000 : 16000;
        if (model.maxOutputTokens !== desired) {
            changed = true;
            changedModels.push({ id: model.id, before: model.maxOutputTokens, after: desired });
            model.maxOutputTokens = desired;
        }
    }
    if (changed) {
        fs.writeFileSync(p, JSON.stringify(json, null, 4) + '\n', 'utf8');
        RESULTS.push({ file, changedModels });
    }
}

if (RESULTS.length === 0) {
    console.log('No changes necessary — all models already match the rule.');
} else {
    for (const r of RESULTS) {
        console.log(`Updated ${r.file}:`);
        for (const m of r.changedModels) {
            console.log(`  ${m.id}: ${m.before} -> ${m.after}`);
        }
    }
}
