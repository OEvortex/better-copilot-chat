# Second pass: catch remaining qwen references
$base = "C:\Users\koula\Desktop\CODEBASE\Projects\OEvortex\copilot-helper\src\CLI"

# Build list of remaining 'qwen' references
$extensions = @('*.ts','*.tsx','*.js','*.json','*.md','*.sb','*.snap')
$files = foreach($ext in $extensions) {
    Get-ChildItem -Path $base -Recurse -Filter $ext -File -ErrorAction SilentlyContinue
}

$count = 0
foreach ($file in $files) {
    $content = Get-Content $file.FullName -Raw -Encoding UTF8 -ErrorAction SilentlyContinue
    if (-not $content) { continue }
    $original = $content

    # CLI command usage strings: 'qwen auth', 'qwen mcp', 'qwen extensions', 'qwen -p'
    # These appear in help text, usage strings, comments, examples
    $content = $content -replace "`bqwen auth\b","aether auth"
    $content = $content -replace "`bqwen mcp\b","aether mcp"
    $content = $content -replace "`bqwen extensions\b","aether extensions"
    $content = $content -replace "`bqwen -p\b","aether -p"

    # scriptName('qwen')
    $content = $content -replace "\.scriptName\('qwen'\)",".scriptName('aether')"
    
    # qwen-oauth → aether-oauth
    $content = $content -replace 'qwen-oauth','aether-oauth'
    
    # qwen- model prefixes in comments/strings
    $content = $content -replace '`bqwen-coder\b`','aether-coder'
    $content = $content -replace 'qwen-coder','aether-coder'
    $content = $content -replace 'qwen3','aether3'
    $content = $content -replace 'qwen/','aether/'
    
    # qwen-code-root → already handled, but check again
    $content = $content -replace 'qwen-code-root','aether-cli-root'
    
    # qwen-cli in file paths
    $content = $content -replace 'qwen-cli','aether-cli'
    
    # qwen-extension.json in comments → aether-extension.json
    $content = $content -replace 'qwen-extension\.json','aether-extension.json'
    
    # Usage strings
    $content = $content -replace "Usage: qwen mcp","Usage: aether mcp"
    
    # Qwen OAuth references in comments  
    $content = $content -replace 'Qwen OAuth','Aether OAuth'
    $content = $content -replace 'qwen-oauth vision','aether-oauth vision'
    $content = $content -replace 'qwen-oauth model','aether-oauth model'
    $content = $content -replace 'qwen-oauth users','aether-oauth users'
    $content = $content -replace 'qwen-oauth models','aether-oauth models'
    $content = $content -replace 'hard-coded qwen-oauth','hard-coded aether-oauth'
    $content = $content -replace 'Non-qwen providers','Non-aether providers'
    $content = $content -replace 'Qwen models:','Aether models:'
    
    # Alibaba Cloud Coding Plan references
    $content = $content -replace 'Qwen OAuth \(free tier\)','Aether OAuth (free tier)'
    $content = $content -replace 'qwen-coder-plus','aether-coder-plus'
    
    # .qwen/ paths that weren't caught (not inside string delimiters)
    $content = $content -replace '~\/\.qwen\/','~/.aether/'
    $content = $content -replace '\.qwen/extensions/','.aether/extensions/'
    $content = $content -replace '\.qwen/settings\.json','.aether/settings.json'
    $content = $content -replace '\.qwen/commands','.aether/commands'
    $content = $content -replace '\.qwen/locales','.aether/locales'
    $content = $content -replace '\.qwen/output-language\.md','.aether/output-language.md'
    $content = $content -replace "mock/\.qwen/","mock/.aether/"
    $content = $content -replace "'\.qwen/'","'.aether/'"
    $content = $content -replace '"\.qwen/"','".aether/"'
    $content = $content -replace "'\.qwen/commands'","'.aether/commands'"
    $content = $content -replace "'\.qwen/settings\.json'","'.aether/settings.json'"
    
    # Ask Qwen → Ask Aether
    $content = $content -replace 'ask Qwen to','ask Aether to'
    
    # QWEN.md in example text
    $content = $content -replace 'QWEN\.md','AGENTS.md'

    if ($content -ne $original) {
        Set-Content -Path $file.FullName -Value $content -Encoding UTF8 -NoNewline
        $count++
    }
}

Write-Host "Second pass complete. Updated $count files."
