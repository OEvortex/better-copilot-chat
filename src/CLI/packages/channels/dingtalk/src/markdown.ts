export function normalizeDingTalkMarkdown(text: string): string[] {
    return [text];
}

export function extractTitle(text: string): string {
    return text.split('\n', 1)[0] || 'Aether';
}
