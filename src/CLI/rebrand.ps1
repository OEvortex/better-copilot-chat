# Rebrand qwen -> aether across all source files
$dir = "$PSScriptRoot"

$extensions = @('*.ts','*.tsx','*.js','*.json','*.md','*.sb','*.snap')
$files = foreach($ext in $extensions) {
    Get-ChildItem -Path $dir -Recurse -Filter $ext -File -ErrorAction SilentlyContinue
}

$count = 0
foreach ($file in $files) {
    $content = Get-Content $file.FullName -Raw -Encoding UTF8 -ErrorAction SilentlyContinue
    if (-not $content) { continue }
    $original = $content
    
    # Package names / imports
    $content = $content -replace '@qwen-code/qwen-code-core','@aether/aether-core'
    $content = $content -replace '@qwen-code/qwen-code-test-utils','@aether/aether-test-utils'
    $content = $content -replace '@qwen-code/qwen-code','@aether/aether-cli'
    $content = $content -replace '@qwen-code/channel-base','@aether/channel-base'
    $content = $content -replace '@qwen-code/channel-telegram','@aether/channel-telegram'
    $content = $content -replace '@qwen-code/channel-weixin','@aether/channel-weixin'
    $content = $content -replace '@qwen-code/channel-dingtalk','@aether/channel-dingtalk'
    $content = $content -replace '@qwen-code/web-templates','@aether/web-templates'
    # Auth types
    $content = $content -replace 'QWEN_OAUTH','AETHER_OAUTH'
    $content = $content -replace 'QWEN_OAUTH_MODELS','AETHER_OAUTH_MODELS'
    # Env vars
    $content = $content -replace 'QWEN_SANDBOX','AETHER_SANDBOX'
    $content = $content -replace 'QWEN_DEBUG_LOG_FILE','AETHER_DEBUG_LOG_FILE'
    # Directory paths - literal strings
    $content = $content -replace '''\.qwen''','''.aether'''
    $content = $content -replace '"\\.qwen"','".aether"'
    # path references like .qwen/
    $content = $content -replace 'pathPrefix\.qwen','pathPrefix.aether'
    # Filenames / constants
    $content = $content -replace 'QWEN_DIR','AETHER_DIR'
    $content = $content -replace 'QWEN\.md','AGENTS.md'
    # .qwenignore -> .aetherignore
    $content = $content -replace '\.qwenignore','.aetherignore'
    # Class / variable names  
    $content = $content -replace 'QwenIgnoreParser','AetherIgnoreParser'
    $content = $content -replace 'qwenIgnoreParser','aetherIgnoreParser'
    $content = $content -replace 'QwenOAuthProgress','AetherOAuthProgress'
    $content = $content -replace 'useQwenAuth','useAetherAuth'
    $content = $content -replace 'qwenOAuth2','aetherOAuth2'
    $content = $content -replace 'qwenContentGenerator','aetherContentGenerator'
    $content = $content -replace 'qwenOAuth','aetherOAuth'
    $content = $content -replace 'qwen-logger','aether-logger'
    $content = $content -replace 'qwen-light','aether-light'
    $content = $content -replace 'qwen-dark','aether-dark'
    $content = $content -replace 'qwen-code-root','aether-cli-root'
    # URLs / org
    $content = $content -replace 'QwenLM','OEvortex'
    $content = $content -replace 'qwenlm','oewortex'
    $content = $content -replace 'ghcr\.io/qwenlm','ghcr.io/oewortex'
    # Product names in comments and descriptions
    $content = $content -replace 'QwenCode','AetherCli'
    # qwen-code -> aether-cli BUT NOT @aether/aether already replaced
    # We need to be careful here - replace qwen-code only where it hasn't been caught
    $content = $content -replace '@aether/qwen-code','@aether/aether-cli'
    # VSCode extension ID
    $content = $content -replace 'qwenlm\.qwen-code-vscode-ide-companion','oewortex.aether-vscode-ide-companion'
    # qwen_code -> aether_cli  
    $content = $content -replace 'qwen_code','aether_cli'
    
    if ($content -ne $original) {
        Set-Content -Path $file.FullName -Value $content -Encoding UTF8 -NoNewline
        $count++
        Write-Host "Updated: $($file.FullName)"
    }
}

Write-Host "`nDone. Updated $count files."
