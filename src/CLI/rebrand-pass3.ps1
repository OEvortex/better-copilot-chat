# Third pass: catch remaining qwen references more carefully
$base = "C:\Users\koula\Desktop\CODEBASE\Projects\OEvortex\copilot-helper\src\CLI"

$extensions = @('*.ts','*.tsx','*.js','*.json','*.md','*.sb','*.snap')
$files = foreach($ext in $extensions) {
    Get-ChildItem -Path $base -Recurse -Filter $ext -File -ErrorAction SilentlyContinue
}

$count = 0
foreach ($file in $files) {
    $content = Get-Content $file.FullName -Raw -Encoding UTF8 -ErrorAction SilentlyContinue
    if (-not $content) { continue }
    $original = $content

    # Variable names with qwen prefix
    $content = $content -replace '\bqwenAuthState\b','aetherAuthState'
    $content = $content -replace '\bQwenAuthState\b','AetherAuthState'
    $content = $content -replace '\bcancelQwenAuth\b','cancelAetherAuth'
    $content = $content -replace '\bqwenDarkColors\b','aetherDarkColors'
    $content = $content -replace '\bqwenLightColors\b','aetherLightColors'
    $content = $content -replace '\bqwenModels\b','aetherModels'
    $content = $content -replace '\bQwenModels\b','AetherModels'
    $content = $content -replace '\bgetFilteredQwenModels\b','getFilteredAetherModels'
    $content = $content -replace '\bqwenThemes\b','aetherThemes'
    $content = $content -replace '\bqwenDir\b','aetherDir'
    $content = $content -replace '\bQwenDir\b','AetherDir'
    $content = $content -replace '\bgetGlobalQwenDir\b','getGlobalAetherDir'
    
    # File/extension install metadata
    $content = $content -replace '\.qwen-extension-install\.json','.aether-extension-install.json'
    
    # Memory references
    $content = $content -replace 'global qwen memory','global aether memory'
    $content = $content -replace '[^a-z]qwen memory[^a-z]',' aether memory '
    
    # GitHub repo URLs
    $content = $content -replace 'OEvortex/qwen-code','OEvortex/aether'
    $content = $content -replace 'qwen-code/packages/','aether/packages/'
    $content = $content -replace 'OEvortex\.github\.io/qwen-code-docs','OEvortex.github.io/aether-docs'
    
    # respect_qwen_ignore
    $content = $content -replace 'respect_qwen_ignore','respect_aether_ignore'
    
    # qwen as generation method value
    $content = $content -replace "value: 'qwen'","value: 'aether'"
    $content = $content -replace "method: 'qwen'","method: 'aether'"  
    $content = $content -replace "generationMethod: 'qwen'","generationMethod: 'aether'"
    $content = $content -replace "'qwen' \| 'manual'","'aether' | 'manual'"
    
    # Agent types
    $content = $content -replace 'qwen-tester','aether-tester'
    $content = $content -replace 'qwen-speculation','aether-speculation'
    
    # CLI command usage
    $content = $content -replace 'qwen --','aether --'
    $content = $content -replace 'Run `qwen','Run `aether'
    $content = $content -replace 'Usage: qwen','Usage: aether'
    $content = $content -replace 'qwen -p','aether -p'
    $content = $content -replace 'qwen channel','aether channel'
    
    # fix: qwen auth aether- -> aether auth aether-
    $content = $content -replace 'qwen auth aether-','aether auth aether-'
    $content = $content -replace 'qwen auth coding','aether auth coding'
    
    # qwen-code -> aether  
    $content = $content -replace 'qwen-code','aether'
    
    # output language marker
    $content = $content -replace 'qwen-code:llm-output-language','aether:llm-output-language'
    
    # qwen-ignored -> aether-ignored
    $content = $content -replace 'qwen-ignored','aether-ignored'
    $content = $content -replace 'Qwen-ignored','Aether-ignored'
    
    # Email
    $content = $content -replace 'aether-cli@qwen\.ai','aether-cli@oewortex.dev'
    
    # Runtime dir
    $content = $content -replace '\.qwen-runtime','.aether-runtime'
    
    # Sandbox image
    $content = $content -replace 'qwen-code-sandbox','aether-sandbox'
    $content = $content -replace 'qwen-code-sandbox-proxy','aether-sandbox-proxy'
    
    # Test dirs
    $content = $content -replace '/mock-qwen','/mock-aether'
    
    # brew grep
    $content = $content -replace 'grep -q "\^qwen-code\$"','grep -q "^aether\$"'
    
    # Windows paths
    $content = $content -replace 'C:\\ProgramData\\qwen-code','C:\\ProgramData\\aether'
    
    # etc path
    $content = $content -replace '/etc/qwen-code/settings\.json','/etc/aether/settings.json'
    
    # QWEN_MODEL env var
    $content = $content -replace 'QWEN_MODEL:','AETHER_MODEL:'
    
    # Export file name
    $content = $content -replace 'qwen-code-export-','aether-export-'
    
    # Sandbox env in test
    $content = $content -replace 'qwen-code-test-sandbox','aether-test-sandbox'
    $content = $content -replace 'qwen-custom-sandbox','aether-custom-sandbox'
    
    # OAuth endpoints
    $content = $content -replace 'chat\.qwen\.ai','chat.aether.dev'
    $content = $content -replace 'oauth\.qwen\.com','oauth.aether.dev'
    
    # acp session
    $content = $content -replace 'qwen-acp-session-','aether-acp-session-'
    $content = $content -replace 'qwen-edit-','aether-edit-'
    
    # warnings file
    $content = $content -replace 'qwen-code-warnings\.txt','aether-warnings.txt'
    
    # modelVersion
    $content = $content -replace "modelVersion: 'qwen'","modelVersion: 'aether'"
    $content = $content -replace "name: 'qwen-code'","name: 'aether'"
    
    # Test model values
    $content = $content -replace "model: 'qwen-max'","model: 'aether-max'"
    $content = $content -replace "model: 'qwen-turbo'","model: 'aether-turbo'"
    $content = $content -replace "model: 'qwen-vl-max'","model: 'aether-vl-max'"
   
    # issue triage
    $content = $content -replace 'issue-triage/qwen-','issue-triage/aether-'
    $content = $content -replace 'pr-review/qwen-','pr-review/aether-'
    $content = $content -replace 'qwen-dispatch/qwen-dispatch','aether-dispatch/aether-dispatch'
    $content = $content -replace 'qwen-assistant/qwen-invoke','aether-assistant/aether-invoke'
    
    # inline pattern
    $content = $content -replace '/@qwen-code/qwen-code-core/','/@aether/aether-core/'
    
    # project path
    $content = $content -replace '/projects/qwen-code','/projects/aether'
   
    # temp dirs for test
    $content = $content -replace '/tmp/qwen-extension','/tmp/aether-extension'
    $content = $content -replace 'qwen-extension-','aether-extension-'
    $content = $content -replace 'qwen-md-test-','aether-md-test-'
    $content = $content -replace 'qwen-migration-test-','aether-migration-test-'
    $content = $content -replace 'qwen-code-test-','aether-test-'
    
    # extension json refs
    $content = $content -replace 'qwen-extension\.json','aether-extension.json'
    
    # base URL  
    $content = $content -replace "chat\.aether\.dev/api","chat.aether.dev/api"
    
    # qwen in model tests: tokenLimit, expect calls, normalize
    $content = $content -replace "tokenLimit\('qwen","tokenLimit('aether"
    $content = $content -replace "normalize\('qwen","normalize('aether"
    $content = $content -replace "toBe\('qwen","toBe('aether"
    $content = $content -replace "toContain\('qwen","toContain('aether"
    $content = $content -replace "toBe\('qwen","toBe('aether"
    $content = $content -replace "\.toBe\('qwen-max'\)",".toBe('aether-max')"
    
    # custom-qwen
    $content = $content -replace "custom-qwen","custom-aether"
    $content = $content -replace 'custom-qwen','custom-aether'
    
    # getModel mock
    $content = $content -replace "mockReturnValue\('qwen-max'\)","mockReturnValue('aether-max')"
    
    # result.config.model
    $content = $content -replace "result\.config\.model.*qwen-max","result.config.model').toBe('aether-max"
    
    # saveCacheSafeParams  
    $content = $content -replace "qwen-max\)", "aether-max)"
    
    # QWEN_MODEL in config
    $content = $content -replace "'qwen-model'","'aether-model'"
   
    # respect qwen ignored
    $content = $content -replace "\['qwen'\]","['aether']"
    $content = $content -replace "ignoredByReason\['qwen'\]","ignoredByReason['aether']"
    
    # Qwen OAuthProgress component ref
    $content = $content -replace '\.qwen-extension-install\.json','.aether-extension-install.json'

    if ($content -ne $original) {
        Set-Content -Path $file.FullName -Value $content -Encoding UTF8 -NoNewline
        $count++
    }
}

Write-Host "Third pass complete. Updated $count files."
