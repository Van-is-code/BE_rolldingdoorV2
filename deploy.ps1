# ==============================================================================
# SCRIPT DEPLOY CHO WINDOWS (POWERSHELL)
# ==============================================================================

Write-Host "====================================================" -ForegroundColor Cyan
Write-Host "   BAT DAU TRIEN KHAI ROLLING DOOR BE TREN WINDOWS  " -ForegroundColor Cyan
Write-Host "====================================================" -ForegroundColor Cyan

# 1. Kiem tra Node.js
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "[1/4] Node.js chua duoc cai dat! Vui long cai Node.js tu https://nodejs.org" -ForegroundColor Red
    exit 1
} else {
    $nodeVer = node -v
    Write-Host "[1/4] Node.js da san sang: $nodeVer" -ForegroundColor Green
}

# 2. Tao file .env neu chua co
$envPath = Join-Path $PSScriptRoot ".env"
$envExamplePath = Join-Path $PSScriptRoot ".env.example"

if (-not (Test-Path $envPath)) {
    Write-Host "[2/4] Dang tao file .env tu .env.example..." -ForegroundColor Yellow
    if (Test-Path $envExamplePath) {
        Copy-Item $envExamplePath $envPath
    } else {
        @"
PORT=4000
DATABASE_URL=postgres://postgres:postgres@localhost:5432/rolldingdoor_service2
USE_SSL=false
JWT_SECRET=aGV0aG9uZ2N1YWN1b24=
HIVEMQ_CLUSTER_URL=c131d19cf9b3498ab5655988b219498f.s1.eu.hivemq.cloud
HIVEMQ_PORT=8883
HIVEMQ_USERNAME=cbgbar
HIVEMQ_PASSWORD=@Van02092005
ADMIN_USERNAME=admin
ADMIN_PASSWORD=admin123
"@ | Out-File -FilePath $envPath -Encoding utf8
    }
    Write-Host "      -> Da tao file .env." -ForegroundColor Green
} else {
    Write-Host "[2/4] File .env da ton tai." -ForegroundColor Green
}

# 3. Cai dat dependencies
Write-Host "[3/4] Dang chay npm install..." -ForegroundColor Yellow
npm install --production

# 4. Khoi chay voi PM2 hoac huong dan chay
Write-Host "[4/4] Kiem tra PM2..." -ForegroundColor Yellow
if (Get-Command pm2 -ErrorAction SilentlyContinue) {
    pm2 start server.js --name "rolldoor-be"
    pm2 save
    Write-Host "====================================================" -ForegroundColor Green
    Write-Host "   DEPLOY THANH CONG VOI PM2!                       " -ForegroundColor Green
    Write-Host "   API dang chay tai: http://localhost:4000         " -ForegroundColor Green
    Write-Host "   Xem log: pm2 logs rolldoor-be                    " -ForegroundColor Green
    Write-Host "====================================================" -ForegroundColor Green
} else {
    Write-Host "PM2 chua duoc cai dat toan cuc." -ForegroundColor Yellow
    Write-Host "Ban co the cai PM2 bang lenh: npm install -g pm2" -ForegroundColor Cyan
    Write-Host "Hoac chay truc tiep du an bang lenh: npm start" -ForegroundColor Cyan
}
