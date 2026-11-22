$ErrorActionPreference = "Stop"
$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$configPath = Join-Path $root "apps/api/env.test.example"
$config = @{}

foreach ($line in Get-Content -LiteralPath $configPath) {
  if ($line -match "^\s*#" -or $line -notmatch "=") { continue }
  $name, $value = $line.Split("=", 2)
  $config[$name.Trim()] = $value.Trim()
}

$database = [Uri]($config["DATABASE_URL"] -replace "^postgresql://", "http://")
if ($database.Host -notin @("127.0.0.1", "localhost") -or $database.Port -ne 5433 -or $database.AbsolutePath -ne "/finlitter_test") {
  throw "Refusing tests unless DATABASE_URL targets the local finlitter_test database."
}
if ($config["DATABASE_URL"] -ne $config["PORTFOLIO_SNAPSHOT_TEST_DATABASE_URL"]) {
  throw "The integration-test URL must exactly match the isolated test database URL."
}

$env:DATABASE_URL = $config["DATABASE_URL"]
$env:PORTFOLIO_SNAPSHOT_TEST_DATABASE_URL = $config["PORTFOLIO_SNAPSHOT_TEST_DATABASE_URL"]
$env:JWT_SECRET = $config["JWT_SECRET"]
Push-Location $root
try {
  docker compose --env-file apps/api/env.test.example -f compose.test.yml up -d postgres-test
  if ($LASTEXITCODE -ne 0) { throw "Could not start the local PostgreSQL test service." }

  $ready = $false
  for ($attempt = 0; $attempt -lt 30; $attempt++) {
    docker compose --env-file apps/api/env.test.example -f compose.test.yml exec -T postgres-test pg_isready -U finlitter_test -d finlitter_test *> $null
    if ($LASTEXITCODE -eq 0) { $ready = $true; break }
    Start-Sleep -Seconds 1
  }
  if (-not $ready) { throw "Local PostgreSQL did not become ready." }

  npx prisma migrate deploy --schema prisma/schema.prisma
  if ($LASTEXITCODE -ne 0) { throw "Test database migrations failed." }
  npx prisma generate --schema prisma/schema.prisma
  if ($LASTEXITCODE -ne 0) { throw "Prisma client generation failed." }
  npm run test:api
  if ($LASTEXITCODE -ne 0) { throw "API tests failed." }
}
finally {
  Pop-Location
}
