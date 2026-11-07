# Start already-initialized local development services.
$ErrorActionPreference = 'Stop'
$project = Split-Path -Parent $PSScriptRoot
$data = Join-Path $project '.local\mysql-data'
$log = Join-Path $project '.local'
$backend = Join-Path $project 'backend'
$user = Join-Path $project 'user'
$mysql = 'C:\Program Files\MySQL\MySQL Server 8.0\bin\mysqld.exe'
$node = (Get-Command node -ErrorAction Stop).Source
function Listening($port) { return [bool](Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue) }
if (-not (Test-Path -LiteralPath $data) -or -not (Test-Path -LiteralPath (Join-Path $backend '.env'))) { throw 'Local database is not initialized.' }
if (-not (Listening 3307)) {
  if (-not (Test-Path -LiteralPath $mysql)) { throw 'MySQL Server 8.0 was not found.' }
  $args = @('--no-defaults', '"--basedir=C:\Program Files\MySQL\MySQL Server 8.0"', ('"--datadir=' + $data + '"'), '--port=3307', '--bind-address=127.0.0.1', '--mysqlx=0')
  Start-Process -FilePath $mysql -ArgumentList $args -WindowStyle Hidden | Out-Null
}
for ($i = 0; $i -lt 40 -and -not (Listening 3307); $i++) { Start-Sleep -Milliseconds 250 }
if (-not (Listening 3307)) { throw 'MySQL did not start on port 3307.' }
if (-not (Listening 5000)) {
  Start-Process -FilePath $node -ArgumentList @('app.js') -WorkingDirectory $backend -WindowStyle Hidden -RedirectStandardOutput (Join-Path $log 'backend.stdout.log') -RedirectStandardError (Join-Path $log 'backend.stderr.log') | Out-Null
}
if (-not (Listening 5173)) {
  $vite = Join-Path $project 'node_modules\vite\bin\vite.js'
  if (-not (Test-Path -LiteralPath $vite)) { throw 'Frontend dependencies are missing; run npm ci from the repository root.' }
  Start-Process -FilePath $node -ArgumentList @('"' + $vite + '"', '--host', '127.0.0.1', '--port', '5173', '--strictPort') -WorkingDirectory $user -WindowStyle Hidden -RedirectStandardOutput (Join-Path $log 'user.stdout.log') -RedirectStandardError (Join-Path $log 'user.stderr.log') | Out-Null
}
Write-Output 'Local services requested. Open http://127.0.0.1:5173/ after they start.'
