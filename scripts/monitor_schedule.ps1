# E.5.5 — instalación EXPLÍCITA de tarea de monitor local en Windows.
# Ninguna tarea se instala por ejecutar este archivo sin parámetros.
# Uso: powershell -NoProfile -File scripts\monitor_schedule.ps1 -Action Status|Install|Remove
[CmdletBinding()]
param(
    [ValidateSet('Status', 'Install', 'Remove')]
    [string]$Action = 'Status'
)
$ErrorActionPreference = 'Stop'
$taskName = 'HJStoreVP-E55-Monitor-Local'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$python = Join-Path $root '.venv-e2e\Scripts\python.exe'
$script = Join-Path $root 'scripts\operations_history.py'

if ($Action -eq 'Status') {
    $existing = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
    if ($existing) { Write-Host ('Tarea instalada: ' + $taskName + ' / ' + $existing.State) }
    else { Write-Host 'Tarea E.5.5 NO instalada' }
    return
}

if ($Action -eq 'Install') {
    if ((Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue)) {
        throw 'Tarea ya existente. No se sobrescribe automáticamente.'
    }
    if (-not (Test-Path -LiteralPath $python -PathType Leaf)) {
        throw 'No existe Python de .venv-e2e. No se creó ninguna tarea.'
    }
    if (-not (Test-Path -LiteralPath $script -PathType Leaf)) {
        throw 'No existe el recolector. No se creó ninguna tarea.'
    }
    # Sin elevación, sin password guardado, sólo al iniciar sesión de este usuario.
    $principal = New-ScheduledTaskPrincipal -UserId ([System.Security.Principal.WindowsIdentity]::GetCurrent().Name) -LogonType Interactive -RunLevel Limited
    $taskAction = New-ScheduledTaskAction -Execute $python -Argument ('"' + $script + '"') -WorkingDirectory $root
    $trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 10) -RepetitionDuration (New-TimeSpan -Days 3650)
    $settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 2) -StartWhenAvailable
    Register-ScheduledTask -TaskName $taskName -Principal $principal -Action $taskAction -Trigger $trigger -Settings $settings -Description 'HJStoreVP E5.5: monitor pasivo LOCAL, sin notificaciones externas' | Out-Null
    Write-Host 'Tarea creada: cada 10 minutos, sólo cuando esta sesión de Windows está iniciada.'
    return
}

if ($Action -eq 'Remove') {
    if ((Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue)) {
        Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
        Write-Host 'Tarea E.5.5 eliminada. Historial local conservado.'
    } else {
        Write-Host 'No existe una tarea E.5.5 para eliminar.'
    }
}
