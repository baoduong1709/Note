# 🚀 Hướng Dẫn Triển Khai - AI Notebook Server

## Yêu Cầu

| Yêu cầu | Chi tiết |
|----------|---------|
| **VPS** | Contabo VPS (đã có) |
| **OS** | Ubuntu 20.04+ hoặc Debian 11+ |
| **RAM** | Tối thiểu 1GB |
| **Domain** | Tùy chọn (khuyến nghị có để dùng HTTPS) |

---

## Cách 1: Deploy với Docker (Khuyến nghị ✅)

### Bước 1: Cài đặt Docker trên VPS

```bash
# SSH vào VPS
ssh root@YOUR_VPS_IP

# Cài Docker
curl -fsSL https://get.docker.com | sh

# Cài Docker Compose
apt install docker-compose-plugin -y

# Verify
docker --version
docker compose version
```

### Bước 2: Upload code lên VPS

```bash
# Option A: Git (khuyến nghị)
git clone https://github.com/YOUR_USERNAME/Note.git /opt/note-app
cd /opt/note-app

# Option B: SCP
scp -r ./Project/Note root@YOUR_VPS_IP:/opt/note-app
```

### Bước 3: Cấu hình environment

```bash
cd /opt/note-app/server

# Tạo file .env production
cat > .env << 'EOF'
PORT=3001
NODE_ENV=production
JWT_SECRET=THAY_BANG_CHUOI_NGAU_NHIEN_DAI_32_KY_TU
GOOGLE_CLIENT_ID=113610150516-jo77q0pv19qso8qg84a2h30hug4jga5s.apps.googleusercontent.com
DATABASE_PATH=./data/notebook.db
EOF
```

> Tạo JWT_SECRET ngẫu nhiên: `openssl rand -hex 32`

### Bước 4: Cấu hình Nginx (nếu có domain)

```bash
# Sửa nginx.conf — thay "your-domain.com" bằng domain thật
nano /opt/note-app/server/nginx.conf
```

### Bước 5: Build và chạy

**Không có domain (chỉ dùng IP):**
```bash
cd /opt/note-app/server
docker compose up -d note-app
docker compose logs -f note-app
```
→ Truy cập: `http://YOUR_VPS_IP:3001`

**Có domain (với SSL):**
```bash
cd /opt/note-app/server

# Lấy SSL certificate
docker compose up -d nginx
docker compose run --rm certbot certonly \
  --webroot --webroot-path /var/www/certbot \
  -d your-domain.com --email your-email@gmail.com \
  --agree-tos --no-eff-email

# Chạy full stack
docker compose up -d
```
→ Truy cập: `https://your-domain.com`

### Bước 6: Kiểm tra

```bash
curl http://localhost:3001/api/auth/me
docker compose logs -f note-app
```

---

## Cách 2: Deploy thủ công (không Docker)

### Bước 1: Cài Node.js + build tools

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install nodejs python3 make g++ -y
```

### Bước 2: Upload và build

```bash
cd /opt/note-app

# Build frontend
npm ci && npm run build

# Build backend
cd server
npm ci && npx tsc
```

### Bước 3: Cấu hình .env

```bash
cd /opt/note-app/server
nano .env
# Nội dung giống Cách 1 Bước 3
```

### Bước 4: Chạy với PM2

```bash
npm install -g pm2
cd /opt/note-app/server
pm2 start dist/index.js --name note-server
pm2 startup && pm2 save
pm2 logs note-server
```

### Bước 5: Nginx reverse proxy

```bash
apt install nginx -y
cat > /etc/nginx/sites-available/note-app << 'CONF'
server {
    listen 80;
    server_name your-domain.com;
    client_max_body_size 50M;
    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 120s;
    }
}
CONF
ln -s /etc/nginx/sites-available/note-app /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl restart nginx
```

### Bước 6: SSL (nếu có domain)

```bash
apt install certbot python3-certbot-nginx -y
certbot --nginx -d your-domain.com
```

---

## Cấu hình Google OAuth cho domain thật

Vào [Google Cloud Console → Credentials](https://console.cloud.google.com/apis/credentials):

1. Click vào OAuth Client ID web
2. **Authorized JavaScript origins** — thêm:
   - `https://your-domain.com`
   - `http://YOUR_VPS_IP:3001`
3. **Authorized redirect URIs** — thêm:
   - `https://your-domain.com/oauth-callback.html`
4. Bấm **Save**

---

## Cấu hình App kết nối Server

### Tauri Desktop / Mobile
Tạo file `.env` ở root project:
```env
VITE_API_URL=https://your-domain.com
```

### Web Browser
Truy cập trực tiếp: `https://your-domain.com`

---

## Backup dữ liệu

```bash
# Backup thủ công
cp /opt/note-app/server/data/notebook.db /backup/notebook_$(date +%Y%m%d).db

# Auto backup hàng ngày (crontab -e)
0 2 * * * cp /opt/note-app/server/data/notebook.db /backup/notebook_$(date +\%Y\%m\%d).db
```

---

## Cập nhật code

```bash
cd /opt/note-app && git pull

# Docker:
docker compose up -d --build

# Manual:
npm ci && npm run build
cd server && npm ci && npx tsc
pm2 restart note-server
```

---

## Troubleshooting

| Vấn đề | Giải pháp |
|---------|-----------|
| `EADDRINUSE port 3001` | `lsof -i :3001` rồi `kill -9 PID` |
| `better-sqlite3` build lỗi | `apt install python3 make g++ -y` |
| CORS error | Kiểm tra cors config, thêm domain |
| Google OAuth lỗi | Kiểm tra GOOGLE_CLIENT_ID và Authorized Origins |
| Database locked | Chỉ chạy 1 instance server |
| 502 Bad Gateway | `pm2 logs` xem lỗi, kiểm tra port |
