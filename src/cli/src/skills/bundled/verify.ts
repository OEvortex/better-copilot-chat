import { parseFrontmatter } from '../../utils/frontmatterParser.js'
import { registerBundledSkill } from '../bundledSkills.js'

function loadVerifyContent(): { skillMd: string; skillFiles: Record<string, string> } {
  try {
    /* eslint-disable @typescript-eslint/no-require-imports */
    const { SKILL_FILES, SKILL_MD } = require('./verifyContent.js') as {
      SKILL_FILES: Record<string, string>
      SKILL_MD: string
    }
    /* eslint-enable @typescript-eslint/no-require-imports */
    return { skillMd: SKILL_MD, skillFiles: SKILL_FILES }
  } catch {
    return {
      skillMd:
        '# Verify\n\nVerify a code change does what it should by running the app.',
      skillFiles: {},
    }
  }
}

export function registerVerifySkill(): void {
  if (process.env.USER_TYPE !== 'ant') {
    return
  }

  const { skillMd, skillFiles } = loadVerifyContent()
  const { frontmatter, content: skillBody } = parseFrontmatter(skillMd)

  const description =
    typeof frontmatter.description === 'string'
      ? frontmatter.description
      : 'Verify a code change does what it should by running the app.'

  registerBundledSkill({
    name: 'verify',
    description,
    userInvocable: true,
    files: skillFiles,
    async getPromptForCommand(args) {
      const parts: string[] = [skillBody.trimStart()]
      if (args) {
        parts.push(`## User Request\n\n${args}`)
      }
      return [{ type: 'text', text: parts.join('\n\n') }]
    },
  })
}
