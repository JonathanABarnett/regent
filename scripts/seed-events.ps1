# Drops a few sample events into the KingdomOS inbox to demo the integration path.
# Usage: .\scripts\seed-events.ps1

$inbox = Join-Path $env:APPDATA 'com.jonat.kingdomos\inbox'
if (!(Test-Path $inbox)) { New-Item -ItemType Directory -Force -Path $inbox | Out-Null }

function New-Event($kind, $intensity, $duration, $payload) {
  $obj = [ordered]@{
    v = 1
    id = [guid]::NewGuid().ToString()
    ts = [int][double]::Parse((Get-Date -UFormat %s))
    kind = $kind
    source = 'inbox'
    intensity = $intensity
    duration_ms = $duration
    payload = $payload
  }
  $name = "$($obj.id).json"
  $obj | ConvertTo-Json -Depth 5 | Set-Content -Path (Join-Path $inbox $name) -Encoding UTF8
  Write-Host "queued: $kind ($name)"
  Start-Sleep -Milliseconds 600
}

New-Event 'courier' 0.6 30000 @{ from = 'rivermouth'; to = 'highkeep'; label = 'royal scroll' }
New-Event 'forge' 0.8 12000 @{ structure = 'ironhearth'; label = 'broadsword' }
New-Event 'research' 0.5 10000 @{ structure = 'scriptorium'; label = 'rune translation' }
New-Event 'mining' 0.9 20000 @{ structure = 'deeprock'; label = 'iron seam found' }
New-Event 'celebration' 0.9 8000 @{ structure = 'highkeep'; label = 'deploy succeeded' }
New-Event 'storm' 0.8 30000 @{ label = 'CI failure' }

Write-Host "`nSeeded $($inbox)"
