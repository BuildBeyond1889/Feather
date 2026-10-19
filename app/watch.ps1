# Feather autostart (runs hidden on this laptop): opens Feather when the stick is plugged in.
# Finds sticks made before the rename too (ArchiePocket folder).
$seen = @{}
while ($true) {
    $now = @{}
    foreach ($d in [System.IO.DriveInfo]::GetDrives()) {
        $r = $d.Name
        if ($d.IsReady -and ((Test-Path (Join-Path $r 'Feather\feather.id')) -or (Test-Path (Join-Path $r 'ArchiePocket\pocket.id')) -or (Test-Path (Join-Path $r 'ArchiePocket\feather.id')))) {
            $now[$r] = 1
            if (-not $seen.ContainsKey($r)) {
                Start-Sleep -Seconds 2
                $bat = Join-Path $r 'Start Feather.bat'
                if (-not (Test-Path $bat)) { $bat = Join-Path $r 'Start Archie Pocket.bat' }
                Start-Process -FilePath $bat -WorkingDirectory $r -WindowStyle Hidden
            }
        }
    }
    $seen = $now
    Start-Sleep -Seconds 3
}
