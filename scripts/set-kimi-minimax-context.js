const fs = require('fs');
const path = require('path');

const CONFIG_DIR = path.join(__dirname, '..', 'src', 'providers', 'config');
const files = fs.readdirSync(CONFIG_DIR).filter((f) => f.endsWith('.json'));

const isMinimax = (s = '') => /minimax/i.test(String(s));
const isKimi = (s = '') => /kimi/i.test(String(s));
const isKimiK25 = (s = '') => /kimi[-_\/]?k2\.5|kimi-k2\.5/i.test(String(s));

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
        const hay = `${model.id || ''} ${model.model || ''} ${model.name || ''}`.toLowerCase();
        if (isMinimax(hay)) {
            // set 256K total: input = 224000, output = 32000
            const beforeIn = model.maxInputTokens;
            const beforeOut = model.maxOutputTokens;
            model.maxInputTokens = 224000;
            model.maxOutputTokens = 32000;
            // ensure tooltip references 256K
            if (typeof model.tooltip === 'string') {
                model.tooltip = model.tooltip.replace(/200k/gi, '256K').replace(/200k/gi, '256K');
                if (!/256k/.test(model.tooltip)) {
                    model.tooltip = `${model.tooltip}`.trim() + ' — 256K context';
                }
            }
            changed = changed || beforeIn !== model.maxInputTokens || beforeOut !== model.maxOutputTokens;
            if (changed) changedModels.push({ id: model.id, beforeIn, beforeOut, afterIn: model.maxInputTokens, afterOut: model.maxOutputTokens });
        }

        if (isKimi(hay)) {
            const beforeIn = model.maxInputTokens;
            const beforeOut = model.maxOutputTokens;
            model.maxInputTokens = 224000;
            model.maxOutputTokens = 32000;
            // only kimi-k2.5 supports vision
            const k25 = isKimiK25(hay);
            if (k25) {
                model.capabilities = model.capabilities || {};
                model.capabilities.imageInput = true;
            } else {
                if (model.capabilities) model.capabilities.imageInput = false;
            }
            // update tooltip
            if (typeof model.tooltip === 'string') {
                model.tooltip = model.tooltip.replace(/200k/gi, '256K');
                if (!/256k/.test(model.tooltip)) {
                    model.tooltip = `${model.tooltip}`.trim() + (k25 ? ' — 256K context with vision' : ' — 256K context');
                }
            }
            const changedK = beforeIn !== model.maxInputTokens || beforeOut !== model.maxOutputTokens || (model.capabilities && model.capabilities.imageInput !== k25);
            if (changedK) {
                changed = true;
                changedModels.push({ id: model.id, beforeIn, beforeOut, afterIn: model.maxInputTokens, afterOut: model.maxOutputTokens, imageInput: model.capabilities?.imageInput });
            }
        }
    }

    if (changed) {
        fs.writeFileSync(p, JSON.stringify(json, null, 4) + '\n', 'utf8');
        RESULTS.push({ file, changedModels });
    }
}

if (RESULTS.length === 0) {
    console.log('No changes necessary — all Kimi and MiniMax models already match the rule.');
} else {
    for (const r of RESULTS) {
        console.log(`Updated ${r.file}:`);
        for (const m of r.changedModels) {
            console.log(`  ${m.id}: in ${m.beforeIn} -> ${m.afterIn}, out ${m.beforeOut} -> ${m.afterOut}` + (m.imageInput !== undefined ? `, imageInput=${m.imageInput}` : ''));
        }
    }
}
