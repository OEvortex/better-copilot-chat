# Rename files with qwen/Qwen in their names
$base = "C:\Users\koula\Desktop\CODEBASE\Projects\OEvortex\copilot-helper\src\CLI"

$renames = @(
    @{Old='packages\cli\src\ui\components\QwenOAuthProgress.tsx'; New='packages\cli\src\ui\components\AetherOAuthProgress.tsx'},
    @{Old='packages\cli\src\ui\components\QwenOAuthProgress.test.tsx'; New='packages\cli\src\ui\components\AetherOAuthProgress.test.tsx'},
    @{Old='packages\cli\src\ui\hooks\useQwenAuth.ts'; New='packages\cli\src\ui\hooks\useAetherAuth.ts'},
    @{Old='packages\cli\src\ui\hooks\useQwenAuth.test.ts'; New='packages\cli\src\ui\hooks\useAetherAuth.test.ts'},
    @{Old='packages\core\src\telemetry\aether-logger\qwen-logger.ts'; New='packages\core\src\telemetry\aether-logger\aether-logger.ts'},
    @{Old='packages\core\src\telemetry\aether-logger\qwen-logger.test.ts'; New='packages\core\src\telemetry\aether-logger\aether-logger.test.ts'},
    @{Old='packages\cli\src\ui\themes\qwen-light.ts'; New='packages\cli\src\ui\themes\aether-light.ts'},
    @{Old='packages\cli\src\ui\themes\qwen-dark.ts'; New='packages\cli\src\ui\themes\aether-dark.ts'},
    @{Old='packages\cli\src\commands\extensions\examples\skills\qwen-extension.json'; New='packages\cli\src\commands\extensions\examples\skills\aether-extension.json'},
    @{Old='packages\cli\src\commands\extensions\examples\mcp-server\qwen-extension.json'; New='packages\cli\src\commands\extensions\examples\mcp-server\aether-extension.json'},
    @{Old='packages\cli\src\commands\extensions\examples\context\qwen-extension.json'; New='packages\cli\src\commands\extensions\examples\context\aether-extension.json'},
    @{Old='packages\cli\src\commands\extensions\examples\context\QWEN.md'; New='packages\cli\src\commands\extensions\examples\context\AGENTS.md'},
    @{Old='packages\cli\src\commands\extensions\examples\commands\qwen-extension.json'; New='packages\cli\src\commands\extensions\examples\commands\aether-extension.json'},
    @{Old='packages\cli\src\commands\extensions\examples\agent\qwen-extension.json'; New='packages\cli\src\commands\extensions\examples\agent\aether-extension.json'}
)

foreach($r in $renames) {
    $oldPath = Join-Path $base $r.Old
    $newPath = Join-Path $base $r.New
    if (Test-Path $oldPath) {
        Move-Item -Path $oldPath -Destination $newPath -Force
        Write-Host "Renamed: $($r.Old) -> $($r.New)"
    } else {
        Write-Host "NOT FOUND: $($r.Old)"
    }
}

Write-Host "`nDone renaming files."
