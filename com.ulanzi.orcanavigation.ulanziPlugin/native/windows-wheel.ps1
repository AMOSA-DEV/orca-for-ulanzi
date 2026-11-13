param([Parameter(Mandatory=$true)][ValidateSet('up','down')][string]$Direction)
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System.Runtime.InteropServices;
public static class OrcaWheel {
    [DllImport("user32.dll")]
    public static extern void mouse_event(uint flags, uint dx, uint dy, int data, System.UIntPtr extraInfo);
}
'@
[OrcaWheel]::mouse_event(0x0800, 0, 0, $(if ($Direction -eq 'up') { 120 } else { -120 }), [System.UIntPtr]::Zero)
