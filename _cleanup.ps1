$env:GIT_CONFIG_GLOBAL = "D:\qa\.gitconfig"
$env:GIT_TERMINAL_PROMPT = "0"
$G = "C:\Program Files\Git\cmd\git.exe"
$out = "D:\qa\cleanup.txt"
Set-Content -Path $out -Value "" -Encoding UTF8
function Log($s) { Add-Content -Path $out -Value $s -Encoding UTF8 }

Log "=== what changed ==="
& $G status --porcelain
Log ("status exit=" + $LASTEXITCODE)

Log "=== stage all ==="
& $G add -A
Log ("add exit=" + $LASTEXITCODE)

Log "=== commit ==="
& $G commit -F "D:\qa\.cleanupmsg.txt"
Log ("commit exit=" + $LASTEXITCODE)

Log "=== push ==="
& $G push
Log ("push exit=" + $LASTEXITCODE)

Log "=== last 3 commits ==="
& $G log --oneline -3
Log ("log exit=" + $LASTEXITCODE)

Log "DONE"
