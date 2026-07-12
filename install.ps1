$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
& node (Join-Path $Root "scripts/setup.mjs") @args
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
