param([string]$Repo = "$env:USERPROFILE\Downloads\XotiicDuck-Music-Portable")
$ErrorActionPreference = "Stop"
Set-Location -LiteralPath $Repo
if (-not (Get-Command gh -ErrorAction SilentlyContinue)) { throw "Install GitHub CLI, then run gh auth login." }
& gh auth status
if ($LASTEXITCODE -ne 0) { throw "Sign in with gh auth login first." }
$privateRepo = "X-S-M-X/Xotiic-Songs-Private"
& gh repo view $privateRepo --json name > $null 2>&1
if ($LASTEXITCODE -ne 0) {
    & gh repo create $privateRepo --private --add-readme --description "Private unreleased XotiicDuck music"
    if ($LASTEXITCODE -ne 0) { throw "Could not create the private repository." }
}
$visibility = & gh repo view $privateRepo --json isPrivate --jq ".isPrivate"
if ($LASTEXITCODE -ne 0 -or $visibility -ne "true") { throw "The staging repository must be private." }
& node scripts/private-storage.cjs bootstrap --apply
if ($LASTEXITCODE -ne 0) { throw "Private tools setup failed." }
Write-Host "Enter a fine-grained token with Contents read/write for BOTH music repositories when GitHub CLI prompts below."
& gh secret set XOTIIC_PUBLISH_TOKEN --repo $privateRepo
if ($LASTEXITCODE -ne 0) { throw "The publishing secret was not saved." }
& node scripts/private-storage.cjs migrate
if ($LASTEXITCODE -ne 0) { throw "Migration preview failed." }
Write-Host "The next step copies unreleased records and media privately, verifies the copies, then removes the current public copies."
Write-Host "Existing public Git history remains public. Keep your local media backup."
$answer = Read-Host "Type MOVE to apply this migration, or press Enter to leave it for later"
if ($answer -ceq "MOVE") {
    & node scripts/private-storage.cjs migrate --apply
    if ($LASTEXITCODE -ne 0) { throw "Migration stopped. Source data is retained where verification did not finish. Read the error before retrying." }
}
& gh workflow run publish-scheduled.yml --repo $privateRepo
if ($LASTEXITCODE -ne 0) { throw "Open the private repository Actions tab and run Publish due releases." }
Write-Host "Setup dispatched. Check the private Actions run, then refresh the Artist Console."
