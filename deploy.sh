#!/bin/bash
# ==============================================================================
# SCRIPT DEPLOY DU AN ROLLING DOOR BACKEND CHO HOME SERVER (UBUNTU / DEBIAN)
# ==============================================================================
set -e

# Mau sac hien thi
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$APP_DIR"

echo -e "${BLUE}====================================================${NC}"
echo -e "${BLUE}   BAT DAU TRIEN KHAI ROLLING DOOR BACKEND          ${NC}"
echo -e "${BLUE}====================================================${NC}"

# 1. Kiem tra va cai dat Node.js (>= 18)
if ! command -v node &> /dev/null || [[ $(node -v | cut -d'v' -f2 | cut -d'.' -f1) -lt 18 ]]; then
    echo -e "${YELLOW}[1/6] Node.js chua co hoac cu hon ban 18. Dang cai dat Node.js 20 LTS...${NC}"
    sudo apt update
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt install -y nodejs
else
    echo -e "${GREEN}[1/6] Node.js da cai dat: $(node -v)${NC}"
fi

# 2. Kiem tra va cai dat PostgreSQL
if ! command -v psql &> /dev/null; then
    echo -e "${YELLOW}[2/6] PostgreSQL chua cai dat. Dang cai dat PostgreSQL...${NC}"
    sudo apt update
    sudo apt install -y postgresql postgresql-contrib
    sudo systemctl enable postgresql
    sudo systemctl start postgresql
else
    echo -e "${GREEN}[2/6] PostgreSQL da duoc cai dat.${NC}"
fi

# 3. Kiem tra file .env
DB_NAME="rolldingdoor_service2"
DB_USER="rolldoor_user"
DB_PASS="RolldoorPass2026@"

if [ ! -f "$APP_DIR/.env" ]; then
    echo -e "${YELLOW}[3/6] File .env chua ton tai. Dang tao tu mau .env.example...${NC}"
    cat <<EOF > "$APP_DIR/.env"
PORT=4000
DATABASE_URL=postgres://${DB_USER}:${DB_PASS}@localhost:5432/${DB_NAME}
USE_SSL=false
JWT_SECRET=aGV0aG9uZ2N1YWN1b24=
HIVEMQ_CLUSTER_URL=c131d19cf9b3498ab5655988b219498f.s1.eu.hivemq.cloud
HIVEMQ_PORT=8883
HIVEMQ_USERNAME=cbgbar
HIVEMQ_PASSWORD=@Van02092005
ADMIN_USERNAME=admin
ADMIN_PASSWORD=admin123
EOF
    echo -e "${GREEN}      -> Da tao file .env.${NC}"
else
    echo -e "${GREEN}[3/6] File .env da ton tai.${NC}"
fi

# 4. Khoi tao Database va User PostgreSQL neu chua co
echo -e "${YELLOW}[4/6] Kiem tra co so du lieu PostgreSQL...${NC}"
sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname = '${DB_NAME}'" | grep -q 1 || {
    echo -e "${YELLOW}      Dang tao Database: ${DB_NAME}...${NC}"
    sudo -u postgres psql -c "CREATE DATABASE ${DB_NAME};"
}

sudo -u postgres psql -tc "SELECT 1 FROM pg_roles WHERE rolname = '${DB_USER}'" | grep -q 1 || {
    echo -e "${YELLOW}      Dang tao User: ${DB_USER}...${NC}"
    sudo -u postgres psql -c "CREATE USER ${DB_USER} WITH ENCRYPTED PASSWORD '${DB_PASS}';"
}

sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE ${DB_NAME} TO ${DB_USER};" > /dev/null 2>&1
sudo -u postgres psql -c "ALTER DATABASE ${DB_NAME} OWNER TO ${DB_USER};" > /dev/null 2>&1
echo -e "${GREEN}      -> PostgreSQL san sang!${NC}"

# 5. Cai dat NPM Dependencies
echo -e "${YELLOW}[5/6] Dang cai dat thu vien Node.js (npm install)...${NC}"
npm install --production

# 6. Chay / Reload ung dung voi PM2
echo -e "${YELLOW}[6/6] Khoi chay tien trinh voi PM2...${NC}"
if ! command -v pm2 &> /dev/null; then
    sudo npm install -g pm2
fi

if pm2 list | grep -q "rolldoor-be"; then
    echo -e "${YELLOW}      Ung dung dang chay, tien hanh reload...${NC}"
    pm2 reload rolldoor-be --update-env
else
    echo -e "${YELLOW}      Khoi tao ung dung lan dau tren PM2...${NC}"
    pm2 start server.js --name "rolldoor-be"
fi

pm2 save
echo -e "${GREEN}====================================================${NC}"
echo -e "${GREEN}   DEPLOY THANH CONG!                               ${NC}"
echo -e "${GREEN}   API dang chay tai: http://localhost:4000         ${NC}"
echo -e "${GREEN}   Xem log: pm2 logs rolldoor-be                    ${NC}"
echo -e "${GREEN}====================================================${NC}"
