# Runbook deploy BookingOS staging từ con số 0

Tài liệu này là trình tự triển khai staging chính thức cho BookingOS. Kiến trúc tham chiếu nằm trong
[`deployment.md`](./deployment.md); file này tập trung vào thao tác thực tế.

## Kiến trúc đã chốt

- Domain `bookingos.vn` vẫn đăng ký và gia hạn tại Tenten.
- Cloudflare làm authoritative DNS và cung cấp R2; không dùng Cloudflare Zero Trust.
- Ứng dụng chạy trên một EC2 `t3.small`, Amazon Linux 2023, kiến trúc x86_64.
- PostgreSQL 16 và Redis 7 của staging chạy trong Docker trên cùng EC2 bằng
  `docker-compose.stg-data.yml`.
- GitHub Actions build ba image `linux/amd64`, push lên GHCR, SSH vào EC2 và deploy.
- Compose nginx chỉ bind `127.0.0.1:8080`, cộng một listener `127.0.0.1:8081` mở đúng một path cho
  Caddy hỏi trước khi cấp certificate.
- **Caddy** cài trực tiếp trên EC2 giữ public port 80/443 và proxy vào compose nginx. Nó terminate
  TLS bằng **on-demand TLS**: certificate được xin cho từng hostname ở request đầu tiên, nên tenant
  thêm tên miền riêng là chạy, không cần thao tác ops và không cần wildcard certificate.
- Nginx host + certbot là **đường lùi**, giữ nguyên trên máy 1–2 tuần sau khi cắt.
- Mọi record staging trên Cloudflare để **DNS only**. Bật Proxied sẽ đưa TLS trở lại Cloudflare edge
  (certificate Universal SSL miễn phí không phủ hostname sâu như `api.stg.bookingos.vn`) và làm hỏng
  cả việc xin certificate lẫn hướng dẫn trỏ A về Elastic IP mà ta đưa cho tenant.
- Cloudflare R2 giữ media; Resend gửi email.

Đây là staging một máy, không có high availability. Không dùng topology này cho production.

## Hostname staging

| Mục đích | Hostname |
| --- | --- |
| API | `api.stg.bookingos.vn` |
| Dashboard | `admin.stg.bookingos.vn` |
| BookingStudio | `bookingstudio.stg.bookingos.vn` |
| BookingStad | `bookingstad.stg.bookingos.vn` |
| Wildcard tenant | `*.stg.bookingos.vn` |
| Đích CNAME cho tên miền riêng của tenant | `connect.stg.bookingos.vn` |
| Public media | `cdn.stg.bookingos.vn` |

## Phase 0 — Chuẩn bị local

### 0.1. Tài khoản cần có

- AWS account có MFA và billing alert.
- Cloudflare account đang quản lý `bookingos.vn`.
- Tenten account giữ domain `bookingos.vn`.
- GitHub repository có Actions.
- Resend account.
- Password manager để lưu secret.
- Một email vận hành để nhận cảnh báo và thông báo Let’s Encrypt.

### 0.2. Kiểm tra source trước khi deploy

Máy local phải dùng Node `22.22.0` trở lên và pnpm `10.13.1`.

```bash
cd /Users/duyvo/Desktop/booking-saas
node --version
pnpm --version
pnpm install --frozen-lockfile
pnpm check:no-tests
pnpm check:module-cycles
pnpm --filter=@booking/storefront security
pnpm turbo lint typecheck build
pnpm --filter=@booking/api check:rls
```

Không deploy nếu bất kỳ lệnh nào thất bại. Repository này không dùng test file; verification chính
thức là lint, typecheck, build, security gate, module-cycle guard và RLS coverage.

Commit cần deploy phải được push lên GitHub:

```bash
git status --short
git rev-parse HEAD
git push origin main
```

Ghi lại full commit SHA từ `git rev-parse HEAD`.

## Phase 1 — Chuyển DNS từ Tenten sang Cloudflare

Thao tác này không chuyển registrar. Tenten vẫn quản lý quyền sở hữu và gia hạn domain; Cloudflare
chỉ trả lời DNS.

### 1.1. Kiểm tra record cũ

Trong Tenten, chụp hoặc export toàn bộ record hiện có:

- `A`, `AAAA`, `CNAME`;
- `MX`;
- SPF, DKIM, DMARC;
- record xác minh của Google, Microsoft, Resend hoặc dịch vụ khác.

Không xóa record email đang sử dụng.

### 1.2. Thêm domain vào Cloudflare

1. Cloudflare → **Domains → Overview**.
2. Chọn **Onboard a domain** hoặc **Add a domain**.
3. Nhập `bookingos.vn`.
4. Chọn Free plan.
5. Nếu Cloudflare không cho tiếp tục vì zone có 0 record, tạo record tạm:

   | Type | Name | Content | TTL |
   | --- | --- | --- | --- |
   | TXT | `_bookingos-onboarding` | `cloudflare-dns-enabled` | Auto |

6. Chọn **Continue to activation**.

### 1.3. DNSSEC trước khi đổi nameserver

Kiểm tra từ máy local:

```bash
dig +short DS bookingos.vn @1.1.1.1
dig +short DS bookingos.vn @8.8.8.8
```

Nếu hai lệnh không trả dữ liệu, DNSSEC đang tắt. Nếu có DS record, tắt DNSSEC hoặc xóa DS tại Tenten
trước khi đổi nameserver.

### 1.4. Đổi nameserver ở Tenten

Cloudflare đã cấp cho zone này:

```text
alla.ns.cloudflare.com
cartman.ns.cloudflare.com
```

Trong Tenten:

```text
Quản lý dịch vụ
→ Tên miền
→ bookingos.vn
→ Thao tác
→ Cài đặt NS
→ Nameserver bên ngoài
```

Xóa:

```text
ns-b1.tenten.vn
ns-b2.tenten.vn
ns-b3.tenten.vn
```

Chỉ giữ:

```text
alla.ns.cloudflare.com
cartman.ns.cloudflare.com
```

Quay lại Cloudflare và chọn **I’ve updated my nameservers** hoặc **Check nameservers now**.

### 1.5. Checkpoint DNS

Chờ Cloudflare báo `Active`, sau đó kiểm tra:

```bash
dig +short NS bookingos.vn @1.1.1.1
dig +short NS bookingos.vn @8.8.8.8
```

Kết quả phải chứa `alla.ns.cloudflare.com.` và `cartman.ns.cloudflare.com.`. Tenten thường cập nhật
trong 30–60 phút; cache DNS toàn cầu có thể mất đến 24 giờ.

## Phase 2 — Tạo EC2 staging

### 2.1. Launch instance

Trong AWS region Singapore `ap-southeast-1`, tạo:

- AMI: Amazon Linux 2023.
- Architecture: x86_64.
- Instance type: `t3.small`.
- Root EBS: `30 GiB gp3`, bật encryption.
- Key pair: RSA hoặc ED25519, tải private key về máy và lưu trong password manager.
- Auto-assign public IPv4: bật cho lần khởi tạo.

Workflow build image `linux/amd64`; không chọn `t4g.*` hoặc AMI ARM64.

### 2.2. Security Group

Tạo inbound rules:

| Port | Protocol | Source | Mục đích |
| --- | --- | --- | --- |
| 22 | TCP | `0.0.0.0/0` | GitHub-hosted runner deploy qua SSH |
| 80 | TCP | `0.0.0.0/0` | HTTP redirect sang HTTPS |
| 443 | TCP | `0.0.0.0/0` | Public HTTPS |

Port 22 phải public vì GitHub-hosted runner không có một IP cố định trong workflow hiện tại. Máy chỉ
cho SSH key, tắt password và root login ở Phase 3. Khi chuyển workflow sang AWS SSM/OIDC hoặc runner
có static egress IP, thu hẹp rule 22 ngay.

Không mở public:

- PostgreSQL `5432`;
- Redis `6379`;
- compose nginx `8080`;
- API/frontend container port `3000`.

### 2.3. Elastic IP

EC2 → **Elastic IP addresses → Allocate Elastic IP address** → associate với instance staging.

Ghi lại:

```text
STAGING_EIP=<Elastic IPv4 của EC2>
```

DNS phải trỏ Elastic IP, không trỏ public IP tạm của instance.

## Phase 3 — Bootstrap EC2

### 3.1. SSH lần đầu

Trên máy local:

```bash
chmod 600 /path/to/bookingos-staging.pem
ssh -i /path/to/bookingos-staging.pem ec2-user@STAGING_EIP
```

Thay `/path/to/bookingos-staging.pem` và `STAGING_EIP` bằng giá trị thật.

### 3.2. Cập nhật hệ điều hành và cài package

Trên EC2:

```bash
sudo dnf upgrade -y
sudo dnf install -y docker git nginx openssl curl cronie
sudo systemctl enable --now docker
sudo systemctl enable --now crond
sudo usermod -aG docker ec2-user
sudo reboot
```

`nginx` ở đây **không** phải thứ giữ 80/443 — Caddy (Phase 6) làm việc đó. Cài sẵn để có đường lùi;
đừng `systemctl enable` nó.

Chờ instance boot lại, sau đó trên máy local SSH lại để kernel/package update và group `docker` có
hiệu lực:

```bash
ssh -i /path/to/bookingos-staging.pem ec2-user@STAGING_EIP
```

Kiểm tra:

```bash
docker version
docker compose version
nginx -v
```

Nếu `docker compose version` chưa chạy được, cài Compose plugin:

```bash
sudo mkdir -p /usr/local/lib/docker/cli-plugins
sudo curl -SL \
  https://github.com/docker/compose/releases/latest/download/docker-compose-linux-x86_64 \
  -o /usr/local/lib/docker/cli-plugins/docker-compose
sudo chmod 755 /usr/local/lib/docker/cli-plugins/docker-compose
docker compose version
```

### 3.3. Tạo swap 6 GiB

```bash
sudo dd if=/dev/zero of=/swapfile bs=1M count=6144
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
free -h
```

`free -h` phải hiển thị khoảng 6 GiB swap.

### 3.4. Khóa SSH

Tạo file:

```bash
sudoedit /etc/ssh/sshd_config.d/99-bookingos.conf
```

Nội dung:

```text
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin no
PubkeyAuthentication yes
AllowUsers ec2-user
```

Validate rồi restart:

```bash
sudo sshd -t
sudo systemctl restart sshd
```

Giữ terminal hiện tại mở, mở terminal thứ hai và SSH lại để xác nhận key vẫn đăng nhập được.

### 3.5. Dọn Docker image cũ tự động

```bash
echo '0 4 * * * docker image prune -af --filter until=168h' | crontab -
crontab -l
```

## Phase 4 — Đưa deploy files lên EC2

Server không build source; nó chỉ cần compose files, nginx template, Caddyfile và env template.

Trên EC2:

```bash
mkdir -p /home/ec2-user/bookingos/docker/nginx /home/ec2-user/bookingos/docker/caddy
```

Trên máy local:

```bash
cd /Users/duyvo/Desktop/booking-saas

scp -i /path/to/bookingos-staging.pem \
  docker-compose.deploy.yml \
  docker-compose.stg-data.yml \
  .env.deploy.example \
  ec2-user@STAGING_EIP:/home/ec2-user/bookingos/

scp -i /path/to/bookingos-staging.pem \
  docker/nginx/deploy.conf.template \
  docker/nginx/staging-host.conf \
  ec2-user@STAGING_EIP:/home/ec2-user/bookingos/docker/nginx/

scp -i /path/to/bookingos-staging.pem \
  docker/caddy/Caddyfile \
  ec2-user@STAGING_EIP:/home/ec2-user/bookingos/docker/caddy/
```

`staging-host.conf` không còn là config đang chạy — nó là đường lùi khi cần tắt Caddy (Phase 7).

Trên EC2:

```bash
cd /home/ec2-user/bookingos
find . -maxdepth 3 -type f -print
```

Phải thấy:

```text
./docker-compose.deploy.yml
./docker-compose.stg-data.yml
./.env.deploy.example
./docker/nginx/deploy.conf.template
./docker/nginx/staging-host.conf
./docker/caddy/Caddyfile
```

## Phase 5 — Cloudflare DNS cho staging

Sau khi có Elastic IP, Cloudflare → `bookingos.vn` → DNS → Records, tạo:

| Type | Name | Content | Proxy status | TTL |
| --- | --- | --- | --- | --- |
| A | `stg` | `STAGING_EIP` | DNS only | Auto |
| A | `*.stg` | `STAGING_EIP` | DNS only | Auto |
| A | `connect.stg` | `STAGING_EIP` | DNS only | Auto |

Cả ba record phải là mây xám **DNS only**. Bật Proxied là hỏng cả việc xin certificate lẫn việc
hướng tenant trỏ A về Elastic IP.

`connect.stg.bookingos.vn` là **đích CNAME** cho tên miền con của tenant (`PLATFORM_STOREFRONT_CNAME`).
Nó không nằm trong `tenant_domains` và không cần certificate riêng — TLS luôn diễn ra trên hostname
của chính tenant. Record `*.stg` đã phủ nó, nhưng tạo record tường minh để nó không biến mất nếu
wildcard bị thu hẹp.

Kiểm tra:

```bash
dig +short stg.bookingos.vn @1.1.1.1
dig +short api.stg.bookingos.vn @1.1.1.1
dig +short admin.stg.bookingos.vn @1.1.1.1
dig +short bookingstudio.stg.bookingos.vn @1.1.1.1
```

Tất cả phải trả về Elastic IP.

Record `cdn.stg.bookingos.vn` sẽ được Cloudflare R2 quản lý ở Phase 8. Exact record đó ưu tiên hơn
wildcard `*.stg`.

## Phase 6 — Cài Caddy và bật on-demand TLS

> **Máy đã chạy nginx host + certbot?** Đừng dùng Phase 6–7. Chúng viết cho máy trắng, không có bước
> cắt và không có đường lùi. Dùng [`nginx-to-caddy-cutover.md`](./nginx-to-caddy-cutover.md) — thứ tự
> khác, có cổng nghiệm thu trước khi cắt và có rollback.

Tenant tự thêm tên miền riêng trong dashboard bất cứ lúc nào, nên một certificate cố định là không
đủ: `booking.tenant-example.vn` trỏ về Elastic IP sẽ hỏng ngay ở bắt tay TLS và request chưa bao giờ
tới ứng dụng. Caddy **on-demand TLS** xin certificate ngay ở request đầu tiên cho từng hostname —
không thao tác ops, không deploy lại cho mỗi tenant.

Hệ quả: **không cần wildcard certificate nữa.** Subdomain tenant (`bookingstudio.stg.bookingos.vn`)
cũng là một row đã verified trong `tenant_domains`, nên nó đi chung đường on-demand HTTP-01 như custom
domain. Không cần DNS-01, không cần build `xcaddy` với plugin Cloudflare, không cần đặt Cloudflare API
token trên máy.

### 6.1. Cài Caddy từ repo chính thức

Trên EC2 (Amazon Linux 2023):

```bash
sudo dnf install -y 'dnf-command(copr)'
sudo dnf copr enable -y @caddy/caddy
sudo dnf install -y caddy
caddy version
```

Dùng đúng package chính thức để systemd unit và thư mục certificate
`/var/lib/caddy/.local/share/caddy` do nó quản lý. **Xoá thư mục đó là phải xin lại toàn bộ
certificate.**

### 6.2. Đặt Caddyfile

```bash
sudo cp /home/ec2-user/bookingos/docker/caddy/Caddyfile /etc/caddy/Caddyfile
sudoedit /etc/caddy/Caddyfile
```

Sửa `email` thành hộp thư vận hành thật — Let's Encrypt gửi cảnh báo hết hạn về đó. Với production
thì đổi hai hostname tường minh thành `admin.bookingos.vn` / `api.bookingos.vn`.

Validate bằng đúng bản Caddy vừa cài (cú pháp on-demand đã đổi giữa các bản 2.x, các tuỳ chọn
rate-limit cũ đã bị gỡ):

```bash
sudo caddy validate --config /etc/caddy/Caddyfile
```

### 6.3. Nghiệm thu endpoint `ask` trước khi cắt

Caddy gọi `GET /public/domains/tls-allowed?domain=<host>` **ngay trong lúc bắt tay TLS**; 2xx thì cấp
certificate, khác thì từ chối. Đây là thứ duy nhất chặn người lạ trỏ tên miền bừa vào Elastic IP để ép
hệ thống đi xin certificate — và cũng là thứ chặn việc đốt rate limit Let's Encrypt.

Stack phải đang chạy (Phase 10–11). Kiểm tra:

```bash
curl -i "http://127.0.0.1:8081/public/domains/tls-allowed?domain=bookingstudio.stg.bookingos.vn"
curl -i "http://127.0.0.1:8081/public/domains/tls-allowed?domain=khong-ton-tai.example"
curl -i "http://127.0.0.1:8081/health/ready"
```

Lần lượt phải là **200**, **404**, **404**. Lượt thứ ba xác nhận listener `:8081` chỉ mở đúng một path
chứ không phải cả API trên một cổng thứ hai.

Kiểm tra cổng chỉ bind loopback:

```bash
ss -ltnp | grep 8081
```

Phải thấy `127.0.0.1:8081`, không phải `0.0.0.0:8081`.

## Phase 7 — Cắt sang Caddy

### 7.1. Dừng nginx host, bật Caddy

Cả hai cùng muốn cổng 80/443, nên đây là một lần cắt — gián đoạn vài giây:

```bash
sudo systemctl disable --now nginx
sudo systemctl enable --now caddy
sudo systemctl status caddy --no-pager
```

Certificate cho `admin.` và `api.` được xin ngay lúc start. Subdomain tenant và custom domain xin ở
request đầu tiên tới hostname đó — request đó chậm khoảng 1–3 giây, các request sau bình thường.

Theo dõi lượt xin certificate đầu tiên:

```bash
sudo journalctl -u caddy -f
```

### 7.2. Nghiệm thu

```bash
openssl s_client \
  -connect api.stg.bookingos.vn:443 \
  -servername api.stg.bookingos.vn \
  </dev/null 2>/dev/null |
  openssl x509 -noout -subject -issuer -dates

curl -sS https://api.stg.bookingos.vn/health/ready
```

Rồi bằng trình duyệt: đăng nhập `admin.stg.bookingos.vn`, mở một subdomain tenant
(`bookingstudio.stg.bookingos.vn`), và mở một custom domain thật đã verified.

Certificate của mỗi hostname phải là certificate **riêng của hostname đó**, không phải wildcard.

### 7.3. Rollback

Certificate certbot cũ vẫn còn trên đĩa và config cũ vẫn còn trong repo, nên đường lùi là hai lệnh:

```bash
sudo systemctl stop caddy
sudo systemctl start nginx
```

Ở trạng thái lùi này custom domain lại hỏng TLS — đó chính là vấn đề Caddy sinh ra để giải quyết.

### 7.4. Tắt certbot sau khi ổn định

Giữ certbot và cron renewal **1–2 tuần**. Sau đó mới:

```bash
sudo rm /etc/cron.d/certbot-renew
```

Nếu máy này chưa từng chạy certbot (deploy mới hoàn toàn) thì bỏ qua toàn bộ mục này — Caddy tự lo
renewal, không có cron nào cần tạo.

## Phase 8 — Cloudflare R2

### 8.1. Tạo bucket và public domain

Cloudflare → R2:

1. Create bucket `bookingos-stg`.
2. Bucket Settings → Public access → Connect custom domain.
3. Nhập `cdn.stg.bookingos.vn`.
4. Chờ domain status Active.

R2 tự quản lý certificate cho custom domain này; không đưa `cdn.stg.bookingos.vn` vào Caddyfile. DNS
của nó trỏ về R2 chứ không về Elastic IP, nên site catch-all của Caddy không bao giờ thấy hostname đó.

### 8.2. Tạo R2 access key

R2 → Manage API tokens → Create token:

- Object Read & Write.
- Chỉ scope bucket `bookingos-stg`.

Lưu:

- Access Key ID;
- Secret Access Key;
- Account ID;
- endpoint `https://ACCOUNT_ID.r2.cloudflarestorage.com`.

### 8.3. CORS

Bucket → Settings → CORS:

```json
[
  {
    "AllowedOrigins": ["*"],
    "AllowedMethods": ["PUT"],
    "AllowedHeaders": ["content-type"],
    "MaxAgeSeconds": 3600
  }
]
```

**Vì sao là `*`, ghi lại để lần audit sau khỏi phải suy luận lại.** Khách upload ảnh hồ sơ partner và
ảnh đánh giá đi thẳng từ trình duyệt lên R2 bằng presigned URL, nên **mỗi origin storefront** phải nằm
trong CORS của bucket. Liệt kê tay ba origin nghĩa là **mỗi tenant mới đều hỏng upload cho tới khi ops
sửa tay** — kể cả tenant chỉ dùng subdomain. Custom domain chỉ làm lỗ hổng sẵn có này lộ ra.

Đây không phải nới lỏng bảo mật: điều kiện duy nhất để ghi được object là **chữ ký trong presigned
URL**. Muốn có chữ ký phải gọi `/uploads/presign` của BFF — route yêu cầu đăng nhập, cookie
`httpOnly`, và `request-security.server.ts` chặn POST khác origin bằng kiểm tra `Origin` +
`sec-fetch-site`. Ai đã cầm URL đã ký thì dùng `curl` cũng PUT được; CORS chưa bao giờ chặn request
ngoài trình duyệt. Cấu hình trên cũng không bật credentials nên không có cookie nào đi kèm request PUT.

Phương án sinh CORS tự động từ `tenant_domains` đã cân nhắc và loại: nó cần thêm secret R2 quyền admin
cho API và thêm một điểm hỏng, mà không làm hệ thống an toàn hơn một cách thực chất.

`STORAGE_UPLOAD_ORIGINS` là chuyện khác và **không** đổi theo số tenant: đó là danh sách origin *của
R2* để đưa vào CSP `connect-src` của storefront.

`S3_ENDPOINT` là nơi browser PUT bằng presigned URL. `S3_PUBLIC_URL` là nơi browser đọc object:

```text
S3_ENDPOINT=https://ACCOUNT_ID.r2.cloudflarestorage.com
S3_PUBLIC_URL=https://cdn.stg.bookingos.vn
STORAGE_UPLOAD_ORIGINS=https://ACCOUNT_ID.r2.cloudflarestorage.com
```

Không đặt `STORAGE_UPLOAD_ORIGINS` thành `cdn.stg.bookingos.vn`.

## Phase 9 — Resend

1. Resend → Domains → Add domain `bookingos.vn`.
2. Thêm SPF/DKIM record Resend yêu cầu vào Cloudflare DNS.
3. Các record mail và verification để DNS only.
4. Chờ Resend báo Verified.
5. Tạo API key dành riêng cho staging.

SMTP:

```dotenv
SMTP_HOST=smtp.resend.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=resend
SMTP_PASS=REPLACE_WITH_RESEND_API_KEY
EMAIL_FROM=no-reply@bookingos.vn
```

Nếu `SMTP_HOST` trống, API chuyển sang log-only và OTP không được gửi thật.

## Phase 10 — Tạo `.env.stg`

### 10.1. Sinh secret

Trên EC2:

```bash
openssl rand -hex 32
openssl rand -base64 48
openssl rand -base64 48
```

Theo thứ tự, lưu ba giá trị vào password manager với tên:

```text
STG_POSTGRES_PASSWORD
STG_SESSION_SECRET_CURRENT
STG_PAYMENTS_ENC_KEY
```

`PAYMENTS_ENC_KEY` phải được giữ nguyên qua mọi release. Mất hoặc thay key sẽ làm toàn bộ payment
gateway credentials đã mã hóa không thể giải mã.

### 10.2. Điền env file

```bash
cd /home/ec2-user/bookingos
cp .env.deploy.example .env.stg
chmod 600 .env.stg
nano .env.stg
```

Điền đầy đủ:

```dotenv
API_IMAGE=bookingos/api:local
STOREFRONT_IMAGE=bookingos/storefront:local
DASHBOARD_IMAGE=bookingos/dashboard:local

DASHBOARD_HOST=admin.stg.bookingos.vn
API_HOST=api.stg.bookingos.vn
HTTP_PORT=127.0.0.1:8080
TLS_ASK_PORT=127.0.0.1:8081

PUBLIC_API_URL=https://api.stg.bookingos.vn
DASHBOARD_URL=https://admin.stg.bookingos.vn
STOREFRONT_URL=https://bookingstudio.stg.bookingos.vn
PLATFORM_BASE_DOMAIN=stg.bookingos.vn
PLATFORM_STOREFRONT_CNAME=connect.stg.bookingos.vn
PLATFORM_STOREFRONT_IPV4=STAGING_EIP
INTERNAL_API_URL=http://api:3000

MIGRATE_DATABASE_URL=postgresql://postgres:REPLACE_WITH_STG_POSTGRES_PASSWORD@postgres:5432/bookingos
DATABASE_URL=postgresql://app_user:app_user_dev_pw@postgres:5432/bookingos
ADMIN_DATABASE_URL=postgresql://app_admin:app_admin_dev_pw@postgres:5432/bookingos

POSTGRES_USER=postgres
POSTGRES_PASSWORD=REPLACE_WITH_STG_POSTGRES_PASSWORD
POSTGRES_DB=bookingos

REDIS_URL=redis://redis:6379
REDIS_MAXMEMORY=256mb

SESSION_SECRET_CURRENT=REPLACE_WITH_STG_SESSION_SECRET_CURRENT
SESSION_SECRET_PREVIOUS=
PAYMENTS_ENC_KEY=REPLACE_WITH_STG_PAYMENTS_ENC_KEY
SESSION_COOKIE_SECURE=true

ALLOW_MOCK_PAYMENTS=false
PAYMENT_STALE_SEC=600
PAYMENT_REDIRECT_ORIGINS=https://pay-sandbox.sepay.vn,https://pay.sepay.vn,https://test-payment.momo.vn,https://payment.momo.vn,https://sbgateway.zalopay.vn,https://gateway.zalopay.vn

S3_ENDPOINT=https://REPLACE_WITH_R2_ACCOUNT_ID.r2.cloudflarestorage.com
S3_REGION=auto
S3_ACCESS_KEY=REPLACE_WITH_R2_ACCESS_KEY
S3_SECRET_KEY=REPLACE_WITH_R2_SECRET_KEY
S3_BUCKET=bookingos-stg
S3_PUBLIC_URL=https://cdn.stg.bookingos.vn
S3_FORCE_PATH_STYLE=true
S3_PRESIGN_EXPIRES_SEC=300
STORAGE_UPLOAD_ORIGINS=https://REPLACE_WITH_R2_ACCOUNT_ID.r2.cloudflarestorage.com

EMAIL_FROM=no-reply@bookingos.vn
SMTP_HOST=smtp.resend.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=resend
SMTP_PASS=REPLACE_WITH_RESEND_API_KEY

LOG_LEVEL=info
SWAGGER_ENABLED=false
```

Thay toàn bộ giá trị `REPLACE_WITH_*`, và thay `STAGING_EIP` bằng Elastic IP thật —
`PLATFORM_STOREFRONT_IPV4` được hiển thị nguyên văn trong dashboard của tenant, nên sai giá trị ở đây
là đưa hướng dẫn sai cho mọi tenant.

Kiểm tra:

```bash
grep -n 'CHANGE_ME\|REPLACE_WITH_\|STAGING_EIP' .env.stg
```

Lệnh phải không trả dòng nào.

Validate Compose mà không in secret:

```bash
docker compose \
  --env-file .env.stg \
  -f docker-compose.deploy.yml \
  -f docker-compose.stg-data.yml \
  config --quiet
```

## Phase 11 — GitHub Actions

### 11.1. GHCR pull token

GitHub → Settings → Developer settings → Personal access tokens → Tokens classic:

- scope `read:packages`;
- expiration phù hợp với quy trình rotate secret.

Lưu token trong password manager.

### 11.2. Repository secrets

Repository → Settings → Secrets and variables → Actions:

| Secret | Giá trị |
| --- | --- |
| `DEPLOY_HOST` | Elastic IP của EC2 |
| `DEPLOY_USER` | `ec2-user` |
| `DEPLOY_SSH_KEY` | Toàn bộ private key của EC2 key pair |
| `DEPLOY_PATH` | `/home/ec2-user/bookingos` |
| `GHCR_PULL_TOKEN` | PAT classic có `read:packages` |

Private key phải gồm cả dòng BEGIN và END.

### 11.3. Environment

Repository → Settings → Environments:

- tạo `stg`, không cần reviewer;
- tạo `prod`, thêm required reviewers trước khi production tồn tại.

## Phase 12 — First deploy

GitHub → Actions → Deploy → Run workflow:

```text
Use workflow from: main
Environment: stg
App: all
Run migrations: true
```

Workflow sẽ:

1. Build API, Storefront và Dashboard cho `linux/amd64`.
2. Push immutable `sha-<commit>` tags lên GHCR.
3. SSH vào EC2.
4. Tự merge `docker-compose.stg-data.yml` vì environment là `stg`.
5. Pin ba image SHA vào `.env.stg`.
6. Start PostgreSQL và Redis.
7. Chạy `prisma migrate deploy`.
8. Start API, Storefront, Dashboard và compose nginx.

### 12.1. Kiểm tra container

Trên EC2:

```bash
cd /home/ec2-user/bookingos
docker compose \
  --env-file .env.stg \
  -f docker-compose.deploy.yml \
  -f docker-compose.stg-data.yml \
  ps
```

Các service dài hạn phải Up/healthy:

```text
postgres
redis
api
storefront
dashboard
nginx
```

`migrate` là one-shot nên có thể ở trạng thái exited 0.

### 12.2. Seed tenant settings

Dùng email vận hành và hai password thật khác nhau; không để seed rơi về platform admin
`admin@bookingos.local` / `admin-dev-password` hoặc owner demo password trên staging public.
Nhập password ẩn để chúng không nằm trong shell history:

```bash
read -rp 'Platform admin email: ' SEED_ADMIN_EMAIL
read -rsp 'Platform admin password: ' SEED_ADMIN_PASSWORD
echo
read -rsp 'Tenant owner password: ' SEED_OWNER_PASSWORD
echo
export SEED_ADMIN_EMAIL SEED_ADMIN_PASSWORD SEED_OWNER_PASSWORD

docker compose \
  --env-file .env.stg \
  -f docker-compose.deploy.yml \
  -f docker-compose.stg-data.yml \
  run --rm \
  -e SEED_SCOPE=tenants \
  -e SEED_ADMIN_EMAIL \
  -e SEED_ADMIN_PASSWORD \
  -e SEED_OWNER_PASSWORD \
  api node dist/operations/prisma/seed.js

unset SEED_ADMIN_EMAIL SEED_ADMIN_PASSWORD SEED_OWNER_PASSWORD
```

Seed này tạo platform settings, plans, permissions, hai tenant, domain, theme, subscription, owner,
cancellation policy, commission rules, listing types và categories. Nó không tạo demo partners,
listings, bookings hoặc promotions.

### 12.3. Bootstrap R2 assets

```bash
docker compose \
  --env-file .env.stg \
  -f docker-compose.deploy.yml \
  -f docker-compose.stg-data.yml \
  run --rm \
  api node dist/operations/scripts/bootstrap-storage.js
```

Với R2, script bỏ qua `PutBucketPolicy` và upload các default assets qua S3-compatible API. Public
read đi qua R2 custom domain.

## Phase 13 — Health và functional smoke check

### 13.1. Public health

```bash
curl -fsS https://api.stg.bookingos.vn/health/ready
curl -fsS https://admin.stg.bookingos.vn/healthz
curl -fsS https://bookingstudio.stg.bookingos.vn/healthz
curl -fsS https://bookingstad.stg.bookingos.vn/healthz
```

API readiness phải báo database và Redis up.

### 13.2. Internal diagnostics

```bash
docker compose \
  --env-file .env.stg \
  -f docker-compose.deploy.yml \
  -f docker-compose.stg-data.yml \
  logs --tail=200 api storefront dashboard nginx postgres redis

sudo journalctl -u caddy --since '30 minutes ago' --no-pager
sudo caddy validate --config /etc/caddy/Caddyfile
```

Lỗi TLS trên một hostname cụ thể thì bắt đầu từ `journalctl -u caddy` — nó ghi cả câu trả lời của
endpoint `ask` lẫn kết quả xin certificate cho từng hostname.

### 13.3. Smoke check bằng trình duyệt

1. Mở `https://admin.stg.bookingos.vn`.
2. Đăng nhập `owner@bookingstudio.vn` bằng password đã truyền vào `SEED_OWNER_PASSWORD`.
3. Tạo listing.
4. Upload ảnh và xác nhận request PUT tới R2 thành công.
5. Mở URL ảnh từ `https://cdn.stg.bookingos.vn`.
6. Trigger password reset và xác nhận email tới qua Resend.
7. Mở `https://bookingstudio.stg.bookingos.vn`.
8. Mở `https://bookingstad.stg.bookingos.vn`.
9. Cấu hình payment gateway sandbox; không bật mock payment.

Nếu cần full demo data, chỉ chạy demo seed khi staging đã được bảo vệ khỏi truy cập công khai vì các
demo accounts dùng password được công bố trong repository.

## Phase 14 — Backup staging

PostgreSQL nằm trên EBS của cùng EC2, không có managed backup.

### 14.1. Tạo dump

```bash
mkdir -p /home/ec2-user/backups

docker compose \
  --env-file /home/ec2-user/bookingos/.env.stg \
  -f /home/ec2-user/bookingos/docker-compose.deploy.yml \
  -f /home/ec2-user/bookingos/docker-compose.stg-data.yml \
  exec -T postgres \
  pg_dump -U postgres -d bookingos -Fc \
  > /home/ec2-user/backups/bookingos-stg.dump

ls -lh /home/ec2-user/backups/bookingos-stg.dump
```

### 14.2. Tải backup ra máy local

```bash
scp -i /path/to/bookingos-staging.pem \
  ec2-user@STAGING_EIP:/home/ec2-user/backups/bookingos-stg.dump \
  /path/to/safe-backup-location/bookingos-stg.dump
```

Backup chỉ nằm trên cùng EC2 không bảo vệ được khi instance hoặc EBS mất. Phải copy sang S3 private,
máy local mã hóa hoặc backup provider khác.

## Phase 15 — Release tiếp theo

Mỗi release:

1. Chạy full static gate ở Phase 0.
2. Push commit.
3. Actions → Deploy.
4. Chọn `stg`.
5. Chọn `all` hoặc app cần deploy.
6. Giữ migrations bật cho `api` hoặc `all`.
7. Sau workflow, chạy public health và xem logs.

Workflow pin immutable image SHA vào `.env.stg`; không dùng `latest`.

## Phase 16 — Rollback

Tìm tag SHA trước trong GHCR hoặc GitHub Actions run cũ. Trên EC2, sửa image cần rollback:

```bash
cd /home/ec2-user/bookingos
sed -i \
  's|^API_IMAGE=.*|API_IMAGE=ghcr.io/REPLACE_WITH_GITHUB_OWNER/bookingos-api:sha-REPLACE_WITH_PREVIOUS_SHA|' \
  .env.stg

docker compose \
  --env-file .env.stg \
  -f docker-compose.deploy.yml \
  -f docker-compose.stg-data.yml \
  up -d api
```

Nếu rollback cả ba app, cập nhật cả:

```text
API_IMAGE
STOREFRONT_IMAGE
DASHBOARD_IMAGE
```

Rollback image không rollback migration. Migrations là forward-only; nếu release có migration phá
dữ liệu, phương án phục hồi là migration sửa tiếp hoặc restore database dump.

## Phase 17 — Bật lại DNSSEC

Chỉ làm sau khi Cloudflare zone đã Active và toàn bộ DNS hoạt động:

1. Cloudflare → DNS → Settings → DNSSEC → Enable.
2. Cloudflare cung cấp DS record.
3. Thêm DS record đó tại Tenten.
4. Kiểm tra:

   ```bash
   dig +short DS bookingos.vn @1.1.1.1
   dig +dnssec bookingos.vn @1.1.1.1
   ```

Nếu Tenten UI không hỗ trợ DS record, liên hệ Tenten trước khi bật DNSSEC.

## Phase 18 — Chỉ chạy staging từ 10:00 đến 22:00

Dùng Amazon EventBridge Scheduler trong cùng region Singapore `ap-southeast-1`. Tạo hai recurring
schedules với **Flexible time window = Off** và timezone `Asia/Ho_Chi_Minh`:

| Schedule | Cron expression | Universal target | Input |
| --- | --- | --- | --- |
| `bookingos-stg-start-1000` | `cron(0 10 * * ? *)` | EC2 `StartInstances` | `{"InstanceIds":["INSTANCE_ID"]}` |
| `bookingos-stg-stop-2200` | `cron(0 22 * * ? *)` | EC2 `StopInstances` | `{"InstanceIds":["INSTANCE_ID"]}` |

Trong console: EventBridge → Scheduler → Create schedule → **All APIs** → Amazon EC2 → chọn API
tương ứng. Có thể để console tạo execution role riêng cho từng schedule; role chỉ cần quyền
`ec2:StartInstances` hoặc `ec2:StopInstances` trên đúng staging instance.

Elastic IP và EBS vẫn tồn tại khi instance stopped. Docker, Caddy và crond đã được systemd enable;
các container dùng `restart: unless-stopped`, nên stack tự trở lại sau khi EC2 start. GitHub deploy
qua SSH chỉ chạy được trong khung giờ EC2 đang bật hoặc sau khi start instance thủ công.

Kiểm tra timezone của host:

```bash
timedatectl | grep 'Time zone'
```

Amazon Linux mặc định UTC. Khi đó Docker image cleanup lúc `04:00` UTC tương ứng `11:00` Việt Nam,
vẫn nằm trong thời gian staging hoạt động.

Caddy tự gia hạn certificate khi đang chạy, không có cron nào phải canh giờ. Nhưng máy tắt 12 tiếng
mỗi ngày, nên certificate có thể chạm ngưỡng gia hạn trong lúc máy tắt — Caddy sẽ gia hạn ở lượt start
kế tiếp. Với cửa sổ 30 ngày của Let's Encrypt thì lịch 10:00–22:00 hàng ngày là dư sức.

## Tenant custom domain

Quy trình đầy đủ, tenant tự làm được trong dashboard; ops **không** thao tác gì cho từng tenant.

Điều kiện nền tảng (làm một lần, đã nằm trong các phase trên):

- record A `connect.stg.bookingos.vn` → Elastic IP, DNS only (Phase 5);
- `PLATFORM_STOREFRONT_CNAME` + `PLATFORM_STOREFRONT_IPV4` trong `.env.stg` (Phase 10);
- Caddy chạy với on-demand TLS và endpoint `ask` trả đúng (Phase 6–7);
- CORS của R2 là wildcard PUT (Phase 8.3) — nếu không, tenant nào cũng hỏng upload;
- gói dịch vụ của tenant bật `customDomain` (gói `Studio Pro` trong seed đã bật).

Tenant làm, trong **Dashboard → Cài đặt cửa hàng → Tên miền**:

1. Thêm tên miền (`booking.tenant-example.vn`).
2. **Bước 1 · Chứng minh sở hữu** — tạo bản ghi TXT đúng cả ba cột card hiển thị:
   tên `_bookingos-verify.booking.tenant-example.vn`, loại `TXT`, giá trị `bookingos-verify=…`.
   Bấm **Kiểm tra lại DNS**; worker nền sẽ đặt `verified_at` khi bản ghi lan truyền.
3. **Bước 2 · Trỏ tên miền** — TXT chỉ chứng minh sở hữu, chưa làm tên miền hoạt động:
   - tên miền con → `CNAME` về `connect.stg.bookingos.vn`;
   - tên miền gốc → `A` về Elastic IP (bản ghi gốc không dùng được CNAME).
4. Bấm **Kiểm tra kết nối** để xem đã trỏ đúng chưa. Đây là truy vấn DNS tại thời điểm bấm, không lưu
   trạng thái — nếu báo chưa trỏ, card sẽ nói tên miền đang trỏ về đâu.
5. Mở tên miền bằng HTTPS. Request đầu tiên chậm khoảng 1–3 giây vì Caddy đang xin certificate; các
   request sau bình thường.

Thứ tự quan trọng: **verify trước, mở tên miền sau.** Nếu tenant mở tên miền trước khi verify xong,
`ask` trả 404 và Caddy backoff, cộng thêm negative cache 60 giây — đợi khoảng một phút rồi thử lại.
Sau `markVerified` đã có `invalidateHost` nên đường thuận không bị trễ.

Rate limit Let's Encrypt là 50 certificate mỗi tuần cho một registered domain, và mọi
`*.stg.bookingos.vn` tính chung vào `bookingos.vn`. Vài tenant thì thoải mái; khi test lặp thì trỏ
`acme_ca` trong Caddyfile sang staging CA của Let's Encrypt.

Tên miền bị xoá khỏi `tenant_domains` vẫn còn certificate tới khi hết hạn — vô hại, storefront trả
trang không tìm thấy tenant.

## Final acceptance checklist

- [ ] Full static gate local thành công trên đúng commit.
- [ ] Cloudflare zone `bookingos.vn` Active.
- [ ] Nameserver là `alla.ns.cloudflare.com` và `cartman.ns.cloudflare.com`.
- [ ] EC2 là `t3.small` x86_64, EBS 30 GiB, swap 6 GiB.
- [ ] Elastic IP đã associate.
- [ ] Security Group chỉ public 22/80/443.
- [ ] SSH password và root login đã tắt.
- [ ] `stg`, `*.stg` và `connect.stg` là DNS only, trỏ đúng Elastic IP.
- [ ] `caddy validate` thành công với đúng bản Caddy đã cài.
- [ ] Caddy giữ 80/443 và proxy vào `127.0.0.1:8080`; nginx host đã tắt.
- [ ] `:8081` chỉ bind loopback; `tls-allowed` trả 200 cho domain đã verified, 404 cho domain lạ, và
      404 cho mọi path khác.
- [ ] Mỗi hostname có certificate riêng của nó (không phải wildcard).
- [ ] `PLATFORM_STOREFRONT_IPV4` trong `.env.stg` đúng Elastic IP thật.
- [ ] CORS của R2 là `AllowedOrigins: ["*"]` cho PUT.
- [ ] Một custom domain thật đã verify, đã trỏ, và mở được bằng HTTPS.
- [ ] PostgreSQL/Redis không publish ra host.
- [ ] API readiness báo DB và Redis up.
- [ ] Dashboard đăng nhập được.
- [ ] Hai tenant storefront resolve đúng Host.
- [ ] R2 upload và public read hoạt động.
- [ ] Resend gửi email thật.
- [ ] `ALLOW_MOCK_PAYMENTS=false`.
- [ ] `PAYMENTS_ENC_KEY` đã escrow ngoài EC2.
- [ ] Database dump đã được copy ra ngoài EC2.
- [ ] EventBridge Scheduler start staging 10:00 và stop 22:00 theo `Asia/Ho_Chi_Minh`.
- [ ] Biết release, xem log và rollback image.
