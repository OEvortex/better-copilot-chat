"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeIndentCharacter = normalizeIndentCharacter;
function normalizeIndentCharacter(options, completion, isEmptyLine) {
    function replace(text, toReplace, replacer) {
        const regex = new RegExp(`^(${toReplace})+`, 'g');
        return text
            .split('\n')
            .map(line => {
            const trimmed = line.replace(regex, '');
            const removedCharacters = line.length - trimmed.length;
            return replacer(removedCharacters) + trimmed;
        })
            .join('\n');
    }
    //Get the "size" of indentation
    let indentSize;
    if (options.tabSize === undefined || typeof options.tabSize === 'string') {
        //Undefined or string case never happens when getting the indent size. This case is just for making TS typechecker happy.
        indentSize = 4;
    }
    else {
        indentSize = options.tabSize;
    }
    //If editor indentation is set to tabs
    if (options.insertSpaces === false) {
        const r = (txt) => replace(txt, ' ', n => '\t'.repeat(Math.floor(n / indentSize)) + ' '.repeat(n % indentSize));
        completion.displayText = r(completion.displayText);
        completion.completionText = r(completion.completionText);
    }
    //If editor indentation is set to spaces
    else if (options.insertSpaces === true) {
        const r = (txt) => replace(txt, '\t', n => ' '.repeat(n * indentSize));
        completion.displayText = r(completion.displayText);
        completion.completionText = r(completion.completionText);
        if (isEmptyLine) {
            const re = (txt) => {
                if (txt === '') {
                    return txt;
                }
                const firstLine = txt.split('\n')[0];
                const spacesAtStart = firstLine.length - firstLine.trimStart().length;
                const remainder = spacesAtStart % indentSize;
                if (remainder !== 0 && spacesAtStart > 0) {
                    const toReplace = ' '.repeat(remainder);
                    return replace(txt, toReplace, n => ' '.repeat((Math.floor(n / indentSize) + 1) * indentSize));
                }
                else {
                    return txt;
                }
            };
            completion.displayText = re(completion.displayText);
            completion.completionText = re(completion.completionText);
        }
    }
    return completion;
}
//# sourceMappingURL=normalizeIndent.js.map