$env:GIT_CONFIG_GLOBAL = "D:\qa\.gitconfig"
$G = "C:\Program Files\Git\cmd\git.exe"
$out = "D:\qa\cleanup2.txt"
Set-Content -Path $out -Value "" -Encoding UTF8
function Log($s) { Add-Content -Path $out -Value $s -Encoding UTF8 }

Log "=== remove stray script from repo ==="
& $G rm --cached _cleanup.ps1
Log ("rm --cached exit=" + $LASTEXITCODE)

Remove-Item _cleanup.ps1 -Force -ErrorAction SilentlyContinue
Log ("file deleted: " + (-not (Test-Path _cleanup.ps1)))

& $G add -A
& $G commit -m "清理: 移除误提交的诊断脚本"
Log ("commit exit=" + $LASTEXITCODE)

Log "=== status ==="
& $G status --porcelain
Log ("status exit=" + $LASTEXITCODE)

Log "=== files tracked by HEAD ==="
$t = & $G ls-tree -r --name-only HEAD
Log ("tracked count = " + ($t | Measure-Object).Count)
foreach ($f in $t) { Log ("  " + $f) }

Log "=== log ==="
& $G log --oneline
Log "DONE"
