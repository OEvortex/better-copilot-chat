/**
 * Health Reporter utility
 * 
 * Converts Doctor results to markdown reports.
 */

import { DoctorResult, HealthGuidance } from '../types';

/**
 * Format guidance section as markdown
 */
function formatGuidance(guidance: HealthGuidance): string {
  const steps = guidance.steps.map((step, i) => `${i + 1}. ${step}`).join('\n');
  const links = guidance.links?.map(link => `   👉 [${link.label}](${link.url})`).join('\n') ?? '';
  
  return `### ${guidance.title}
${steps}
${links ? `\n${links}` : ''}`;
}

/**
 * Convert Doctor result to markdown report
 * @param result - Doctor verification result
 * @returns Markdown format report string
 */
export function formatHealthReport(result: DoctorResult): string {
  const { status, installGuidance } = result;
  const cliName = status.cli.charAt(0).toUpperCase() + status.cli.slice(1);
  const { install } = status;
  const timestamp = status.checkedAt.toLocaleString();

  // Installed
  if (install.status === 'installed') {
    return `## 🔍 CLI Health Check: ${cliName}

### Installation
- **Status**: ✅ Installed${install.version ? `\n- **Version**: ${install.version}` : ''}${install.path ? `\n- **Path**: \`${install.path}\`` : ''}
- **Checked At**: ${timestamp}

---
✅ All checks passed. ${cliName} CLI is ready to use.`;
  }

  // Not installed
  return `## 🔍 CLI Health Check: ${cliName}

### Installation
- **Status**: ❌ Not Installed
- **Checked At**: ${timestamp}

${formatGuidance(installGuidance)}

---
⚠️ Some issues found. Please follow the instructions above to resolve them.`;
}
