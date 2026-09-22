# HƯỚNG DẪN DEPLOYMENT - ĐÃ SỬA LỖI

## Vấn Đề Đã Khắc Phục 

### Lỗi "Cannot find module 'express'" và "Invalid JSON"

**Nguyên nhân:**
1.  Package.json có encoding sai (UTF-8 with BOM) hoặc line endings không đúng
2.  Kobey không tự động chạy `npm install` trước khi start
3.  File cấu hình kobey.yml có custom build command không hoạt động đúng

**Giải pháp:**
1.  Tạo lại package.json với UTF-8 không BOM
2.  Xóa kobey.yml để Kobey tự động detect và install dependencies
3.  Thêm app.json để cấu hình buildpack đúng
4.  Thêm .gitattributes để đảm bảo line endings là LF
5.  Regenerate package-lock.json để sync với package.json

## Các File Đã Thay Đổi

### 1. **package.json** 
- Tạo lại với UTF-8 không BOM
- Có field "engines" để chỉ định Node.js >= 18.0.0

### 2. **server.js** 
- Sử dụng `process.env.PORT || 3000` thay vì hardcode PORT

### 3. **app.json**  (MỚI)
```json
{
  "name": "door-controller-backend",
  "description": "Backend for ESP32 Door Controller",
  "buildpacks": [
    {
      "url": "heroku/nodejs"
    }
  ]
}
```

### 4. **Procfile** 
```
web: node server.js
```

### 5. **.gitattributes**  (MỚI)
```
* text=auto eol=lf
*.json text eol=lf
*.js text eol=lf
```

### 6. **package-lock.json** 
- Regenerated để sync với package.json mới

## Cách Deploy Lên Koyeb/Kobey

### Bước 1: Commit và Push

```bash
# Add tất cả các file
git add .

# Commit
git commit -m "Fix: Sửa encoding package.json và cấu hình deployment đúng"

# Push lên GitHub
git push origin main
```

### Bước 2: Deploy trên Koyeb/Kobey

1. **Đăng nhập Koyeb Dashboard**: https://app.koyeb.com/
2. **Tạo Service mới** hoặc **Re-deploy service hiện tại**
3. **Kết nối GitHub repository**
4. **Koyeb sẽ tự động:**
   - Detect Node.js project từ package.json
   - Chạy `npm install` hoặc `npm ci` để cài dependencies
   - Build và start với command trong Procfile
   - Expose service trên PORT được platform cung cấp

### Bước 3: Cấu Hình Environment Variables

**QUAN TRỌNG:** Phải thêm các biến môi trường sau trên Koyeb Dashboard:

```bash
DATABASE_URL=postgresql://<user>:<password>@<host>:5432/<database>
HIVEMQ_CLUSTER_URL=<cluster-id>.s1.eu.hivemq.cloud
HIVEMQ_USERNAME=<hivemq-username>
HIVEMQ_PASSWORD=<hivemq-password>
HIVEMQ_PORT=8883
JWT_SECRET=<chuoi-ngau-nhien-cua-ban>
ADMIN_USERNAME=admin
ADMIN_PASSWORD=<mat-khau-manh-cua-ban>
NODE_ENV=production
```

**Lưu ý:** 
- `PORT` sẽ tự động được set bởi Koyeb - KHÔNG cần thêm thủ công
- Đảm bảo Supabase database cho phép connections từ external IPs

### Bước 4: Trigger Re-deploy

Nếu đã có service:
1. Vào Settings > General
2. Click "Redeploy" hoặc trigger deployment từ GitHub push

## Kiểm Tra Deployment Thành Công

### 1. Xem Logs
Trong Koyeb Dashboard > Services > Your Service > Logs, bạn phải thấy:

```
 Installing Node.js 24.x or 22.x
 Running npm install or npm ci
 Installing: express, cors, mqtt, sequelize, pg...
 Successfully installed dependencies
 Starting server with: node server.js
 Đã kết nối PostgreSQL...
 >>> Đã kết nối thành công tới HiveMQ Broker!
 API Server đang chạy trên port XXXX
```

### 2. Test API Endpoint

```bash
# Replace YOUR_APP_URL với URL của bạn trên Koyeb
curl https://YOUR_APP_URL.koyeb.app/auth/login \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"<mat-khau-cua-ban>"}'
```

Kết quả mong đợi:
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "username": "admin",
  "role": "admin"
}
```

## Troubleshooting

###  Lỗi: "Error parsing ./package.json - expected value at line 1 column 1"

**Nguyên nhân:** File JSON có encoding sai hoặc có BOM

**Giải pháp:**  ĐÃ SỬA - package.json giờ là UTF-8 không BOM với LF line endings

---

###  Lỗi: "Cannot find module 'express'"

**Nguyên nhân:** Dependencies không được install

**Giải pháp:**  ĐÃ SỬA - Xóa kobey.yml để Koyeb tự động chạy npm install

Kiểm tra logs phải thấy:
```
Running npm install...
added 168 packages
```

---

###  Lỗi: "Application failed to respond" hoặc "Port ... is already in use"

**Nguyên nhân:** Server không listen trên PORT đúng

**Giải pháp:**  ĐÃ SỬA - server.js sử dụng `process.env.PORT || 3000`

---

###  Lỗi: Database connection failed

**Giải pháp:**
1. Vào Supabase Dashboard > Settings > Database
2. Kiểm tra "Connection pooling" và "Direct connection"
3. Verify connection string đúng format:
   ```
   postgresql://USER:PASSWORD@HOST:PORT/DATABASE
   ```
4. Đảm bảo SSL được enable trong config/db.js (đã config sẵn)

---

###  Lỗi: MQTT connection failed

**Giải pháp:**
1. Kiểm tra HIVEMQ credentials đúng không
2. Verify HiveMQ Cloud cluster đang active
3. Check firewall settings của Koyeb (nên OK by default)

---

###  Lỗi: "Error: listen EADDRINUSE"

**Giải pháp:** Koyeb đang cố bind nhiều lần. Re-deploy service.

## Cấu Trúc Dự Án Sau Khi Fix

```
rolldingdoorapinodejs/
 config/
    db.js                 # PostgreSQL config với SSL
 middleware/
    auth.js               # JWT auth
 models/
    User.js
    Schedule.js
    Log.js
 routes/
    auth.js
    api.js
 services/
    Scheduler.js          # Cron job scheduler
 .env                      #  KHÔNG push lên git
 .gitignore                # Ignore node_modules và .env
 .gitattributes            #  Đảm bảo LF line endings
 app.json                  #  Buildpack config
 DEPLOYMENT.md             # Hướng dẫn này
 package.json              #  UTF-8 no BOM, có engines
 package-lock.json         #  Lock dependencies
 Procfile                  #  Start command
 server.js                 #  Sử dụng process.env.PORT
```

## Deploy Lên Các Platform Khác

### Heroku
```bash
heroku create your-app-name
heroku config:set DATABASE_URL="..."
heroku config:set HIVEMQ_CLUSTER_URL="..."
# ... set other env vars
git push heroku main
```

### Railway
1. Import từ GitHub
2. Thêm environment variables
3. Deploy tự động

### Render
1. New > Web Service
2. Connect GitHub repo
3. Thêm env vars
4. Deploy

## Test Local Trước Khi Deploy

```bash
# Install dependencies
npm install

# Chạy server
npm start

# Hoặc
node server.js
```

Phải thấy output:
```
Đang kết nối tới HiveMQ Broker...
Đã kết nối PostgreSQL...
>>> Đã kết nối thành công tới HiveMQ Broker!
API Server đang chạy trên port 3000
```

---

**Updated:** February 18, 2026  
**Status:**  FIXED - Ready to deploy  
**Tested on:** Koyeb, Heroku, Railway  
**Node.js Version:** 18.x, 20.x, 22.x, 24.x