# Cắt TLS từ nginx host sang Caddy — máy staging đang chạy

> **File dùng một lần.** Xoá nó sau khi đã tắt cron certbot (Bước 7) — không phải ngay hôm cắt: trong
> 1–2 tuần còn giữ đường lùi, nếu phải lùi rồi cắt lại thì cần đúng tài liệu này. Lúc xoá, gỡ luôn
> khối trích dẫn ở đầu Phase 6 của [`deployment-runbook.md`](./deployment-runbook.md) — đó là chỗ duy
> nhất trong repo trỏ tới đây.

Tài liệu này dành cho **máy EC2 staging đang phục vụ traffic** bằng nginx host + certbot, cần chuyển
sang Caddy on-demand TLS để tenant custom domain có HTTPS.

Deploy mới hoàn toàn thì **không** dùng file này — dùng
[`deployment-runbook.md`](./deployment-runbook.md) Phase 6–7, ở đó Caddy chỉ là một service trong
compose và không có gì phải cắt. Lý do kiến trúc nằm ở [`deployment.md`](./deployment.md) → *TLS —
Caddy on-demand*.

Tổng thời gian: khoảng 20–30 phút, trong đó **gián đoạn thật chỉ vài giây** ở Bước 5. Mọi bước trước
đó chạy song song với nginx đang phục vụ, và mỗi bước đều lùi được.

## ⚠️ Trên máy này có HAI nginx — đừng nhầm

| | Nó là gì | Số phận |
| --- | --- | --- |
| **nginx host** (`systemctl nginx`, `/etc/nginx/conf.d/bookingos-stg.conf`) | Giữ public 80/443, terminate certificate certbot, proxy vào `127.0.0.1:8080` | **Đây là thứ bị thay.** Container `caddy` tiếp quản. |
| **nginx compose** (service `nginx` trong `docker-compose.deploy.yml`) | Route theo Host: `admin.*` → dashboard, `api.*` → api, còn lại → storefront (default_server) | **Giữ nguyên và vẫn bắt buộc.** Nó còn được thêm listener `:8081`. |

Tắt nhầm cái thứ hai là sập toàn bộ ứng dụng. Mọi lệnh `systemctl` bên dưới đều nói về nginx host;
mọi lệnh `docker compose` đều nói về stack.

Caddy **chạy trong chính compose stack** (service `caddy`, profile `tls`), không phải systemd unit.
Nghĩa là không có `dnf install`, không có `/etc/caddy`, và từ nay Caddyfile được workflow Deploy đồng
bộ như mọi file khác — [`deployment.md`](./deployment.md) → *What the deploy syncs*.

## Trước khi bắt đầu

- [ ] Commit chứa thay đổi này đã merge vào `main` và **CI xanh**.
- [ ] SSH vào được EC2, có `sudo`.
- [ ] Security Group đang mở 80 và 443 ra `0.0.0.0/0`. Caddy xin certificate bằng **HTTP-01**, nên
      cổng 80 phải tới được từ Internet — đóng nó là không cấp được certificate nào.
- [ ] Biết Elastic IP (`STAGING_EIP`) và có quyền sửa DNS zone `bookingos.vn` trên Cloudflare.
- [ ] Có hộp thư vận hành thật để đặt vào `ACME_EMAIL`.

Ghi lại trạng thái hiện tại để so sánh sau khi cắt:

```bash
sudo systemctl is-active nginx
sudo certbot certificates
curl -sS -o /dev/null -w '%{http_code}\n' https://api.stg.bookingos.vn/health/ready
```

## Bước 0 — Cloudflare và R2 (làm trước, độc lập, không đụng traffic)

Hai việc này không liên quan gì tới Caddy và có thể làm bất cứ lúc nào trước đó.

**0.1. Record CNAME đích.** Cloudflare → `bookingos.vn` → DNS → Records:

| Type | Name | Content | Proxy status | TTL |
| --- | --- | --- | --- | --- |
| A | `connect.stg` | `STAGING_EIP` | **DNS only** | Auto |

Đây là đích CNAME cho tên miền con của tenant. Mây xám bắt buộc: bật Proxied là hỏng cả việc xin
certificate lẫn hướng dẫn trỏ A mà ta đưa cho tenant. Nhân tiện xác nhận `stg` và `*.stg` cũng vẫn
đang DNS only.

```bash
dig +short A connect.stg.bookingos.vn @1.1.1.1   # phải ra Elastic IP
```

**0.2. CORS của R2.** Cloudflare → R2 → bucket `bookingos-stg` → Settings → CORS, thay bằng:

```json
[{ "AllowedOrigins": ["*"], "AllowedMethods": ["PUT"],
   "AllowedHeaders": ["content-type"], "MaxAgeSeconds": 3600 }]
```

Việc này **sửa một lỗi đang tồn tại**, không phải hệ quả của Caddy: danh sách ba origin gõ tay nghĩa
là mỗi tenant mới đều hỏng upload cho tới khi ops sửa tay. Lý do đầy đủ vì sao `*` ở đây không phải
nới lỏng bảo mật: [`deployment-runbook.md`](./deployment-runbook.md) §8.3.

## Bước 1 — Thêm biến vào `.env.stg` — LÀM TRƯỚC KHI DEPLOY

**Thứ tự ở đây là bắt buộc.** Compose nội suy biến cho **toàn bộ** file, không phân biệt profile, nên
`ACME_EMAIL` phải có mặt ngay khi `docker-compose.deploy.yml` mới lên máy — kể cả khi profile `tls`
còn tắt. Thiếu nó thì mọi lệnh compose sau đó fail (`ACME_EMAIL is required`). Stack đang chạy không
việc gì, nhưng deploy sẽ đỏ và bạn không `up -d` được cho tới khi thêm.

Trên EC2:

```bash
cd /home/ec2-user/bookingos
cp .env.stg .env.stg.bak.$(date +%Y%m%d)   # đường lùi cho chính bước này
nano .env.stg
```

Thêm:

```dotenv
# Hộp thư vận hành thật — Let's Encrypt gửi cảnh báo hết hạn về đây.
ACME_EMAIL=ops@bookingos.vn

# CHƯA bật ở bước này. nginx host vẫn giữ 80/443, bật lên là container caddy
# không bind được cổng và crashloop. Bước 5 mới đổi thành `tls`.
COMPOSE_PROFILES=

# Cổng nginx compose mở cho Caddy hỏi trước khi cấp certificate. Giữ loopback.
TLS_ASK_PORT=127.0.0.1:8081

# Nơi tenant trỏ tên miền riêng về. Hiện nguyên văn trong dashboard của tenant.
PLATFORM_STOREFRONT_CNAME=connect.stg.bookingos.vn
PLATFORM_STOREFRONT_IPV4=STAGING_EIP
```

Thay `STAGING_EIP` bằng Elastic IP thật. Sai giá trị này là đưa hướng dẫn sai cho **mọi** tenant, và
nút "Kiểm tra kết nối" sẽ báo "chưa trỏ" cho cả tenant đã trỏ đúng.

Xác nhận `HTTP_PORT` vẫn là `127.0.0.1:8080` — Caddy proxy vào nginx qua compose network, còn publish
này chỉ là cửa loopback để debug:

```bash
grep -E '^(HTTP_PORT|TLS_ASK_PORT|COMPOSE_PROFILES|ACME_EMAIL|PLATFORM_STOREFRONT_)' .env.stg
```

## Bước 2 — Deploy

nginx host vẫn đang giữ 80/443 suốt bước này, nên **chưa có gì thay đổi với người dùng**.

Chạy workflow **Deploy** trên GitHub Actions với `environment=stg`, `app=all`, `migrate=true`.

Workflow tự đồng bộ `docker-compose.deploy.yml`, `docker-compose.stg-data.yml`, template nginx và
Caddyfile lên máy, rồi recreate nginx vì nội dung đổi — **không còn phải scp tay** như phiên bản
trước của tài liệu này. Nó cũng validate Caddyfile bằng đúng image `caddy:2-alpine` trước khi đụng
tới máy.

Kiểm tra nginx compose đã mở cổng mới:

```bash
cd /home/ec2-user/bookingos
docker compose --env-file .env.stg \
  -f docker-compose.deploy.yml -f docker-compose.stg-data.yml ps
```

Cột PORTS của service `nginx` phải có cả `127.0.0.1:8080->80/tcp` lẫn `127.0.0.1:8081->8081/tcp`.
Chưa thấy `caddy` là đúng — profile còn tắt.

## Bước 3 — Cổng nghiệm thu: endpoint `ask`

**Đây là bước quyết định. Không cắt nếu bước này chưa đúng.**

Caddy gọi `GET /public/domains/tls-allowed?domain=<host>` ngay trong lúc bắt tay TLS: 2xx thì cấp
certificate, khác thì từ chối. Nó sai theo hướng "luôn từ chối" thì không tên miền nào lên được HTTPS;
sai theo hướng "luôn đồng ý" thì người lạ trỏ tên miền bừa vào Elastic IP là ép được hệ thống đi xin
certificate và đốt rate limit Let's Encrypt.

```bash
curl -i "http://127.0.0.1:8081/public/domains/tls-allowed?domain=bookingstudio.stg.bookingos.vn"
curl -i "http://127.0.0.1:8081/public/domains/tls-allowed?domain=khong-ton-tai.example"
curl -i "http://127.0.0.1:8081/health/ready"
```

Kết quả bắt buộc: **200** · **404** · **404**.

Lượt thứ ba quan trọng không kém hai lượt đầu — nó chứng minh `:8081` chỉ mở đúng một path chứ không
phải cả API trên một cổng thứ hai.

Cổng phải chỉ bind loopback:

```bash
ss -ltnp | grep 8081     # phải là 127.0.0.1:8081, KHÔNG phải 0.0.0.0:8081
```

Và phải không tới được từ ngoài:

```bash
# chạy trên máy local, không phải EC2 — phải timeout hoặc connection refused
curl -m 5 "http://STAGING_EIP:8081/public/domains/tls-allowed?domain=bookingstudio.stg.bookingos.vn"
```

## Bước 4 — Kéo sẵn image Caddy

Kéo trước để lúc cắt không phải chờ mạng trong lúc site đang tắt:

```bash
docker pull caddy:2-alpine
```

> **Muốn diễn tập trước?** Thêm `acme_ca https://acme-staging-v02.api.letsencrypt.org/directory` vào
> block global của `docker/caddy/Caddyfile`, cắt thử, xem log xin certificate chạy đúng, rồi bỏ dòng
> đó ra và deploy lại. Certificate của CA staging trình duyệt không tin, nên đừng để lại quá vài phút.
> Nhớ là file đó giờ do workflow đồng bộ — sửa trong repo rồi deploy, đừng sửa tay trên máy vì lần
> deploy sau sẽ ghi đè.

## Bước 5 — Cắt

Hai bên cùng muốn 80/443 nên đây là một lần cắt dứt khoát, gián đoạn vài giây.

```bash
cd /home/ec2-user/bookingos

# 1. Nhả cổng
sudo systemctl disable --now nginx

# 2. Bật profile tls
sed -i 's/^COMPOSE_PROFILES=.*/COMPOSE_PROFILES=tls/' .env.stg

# 3. Dựng caddy
docker compose --env-file .env.stg \
  -f docker-compose.deploy.yml -f docker-compose.stg-data.yml up -d
```

`disable` chứ không chỉ `stop`: còn enable thì lần reboot sau nginx host sống lại và giành cổng với
container caddy, kết quả là một trong hai chết ngẫu nhiên tuỳ thứ tự khởi động.

Theo dõi lượt xin certificate đầu tiên:

```bash
docker compose --env-file .env.stg \
  -f docker-compose.deploy.yml -f docker-compose.stg-data.yml logs -f caddy
```

Trong log sẽ thấy Caddy xin certificate cho `admin.stg.bookingos.vn` và `api.stg.bookingos.vn` ngay
lúc start. Subdomain tenant và custom domain xin ở **request đầu tiên** tới hostname đó — request ấy
chậm khoảng 1–3 giây, các request sau bình thường.

## Bước 6 — Nghiệm thu

```bash
# Certificate riêng của từng hostname, không phải wildcard
for h in api.stg.bookingos.vn admin.stg.bookingos.vn bookingstudio.stg.bookingos.vn; do
  echo "--- $h"
  openssl s_client -connect "$h:443" -servername "$h" </dev/null 2>/dev/null |
    openssl x509 -noout -subject -issuer -dates
done

curl -sS https://api.stg.bookingos.vn/health/ready
curl -sS -o /dev/null -w 'http→https: %{http_code} %{redirect_url}\n' http://api.stg.bookingos.vn/
```

`subject` phải là chính hostname đó (`CN=api.stg.bookingos.vn`), **không** phải `*.stg.bookingos.vn`.
Còn thấy wildcard nghĩa là Caddy chưa thực sự phục vụ — kiểm tra lại `systemctl is-active nginx`.

Bằng trình duyệt:

1. Đăng nhập `https://admin.stg.bookingos.vn`.
2. Mở `https://bookingstudio.stg.bookingos.vn` và `https://bookingstad.stg.bookingos.vn`.
3. Upload một ảnh (hồ sơ partner hoặc ảnh đánh giá) — xác nhận CORS wildcard ở Bước 0.2 đã có tác dụng.
4. Thêm một custom domain thật trong Dashboard → Cài đặt cửa hàng → Tên miền, làm đủ Bước 1 (TXT) và
   Bước 2 (CNAME/A) của card, bấm "Kiểm tra kết nối" cho tới khi báo đã trỏ, rồi mở nó bằng HTTPS.

Bước 4 mới là thứ toàn bộ việc cắt này sinh ra để làm được. Trước khi làm nó thì chưa nghiệm thu xong.

## Rollback

Certificate certbot vẫn còn nguyên trên đĩa và config cũ vẫn còn trong repo, nên đường lùi ngắn:

```bash
cd /home/ec2-user/bookingos
COMPOSE="docker compose --env-file .env.stg -f docker-compose.deploy.yml -f docker-compose.stg-data.yml"

# Tắt profile cho lần up -d sau, rồi gỡ container caddy đang chạy
sed -i 's/^COMPOSE_PROFILES=.*/COMPOSE_PROFILES=/' .env.stg
$COMPOSE --profile tls stop caddy
$COMPOSE --profile tls rm -f caddy

sudo systemctl enable --now nginx
```

Hai lệnh `stop`/`rm` là bắt buộc và phải có cờ `--profile tls`: tắt `COMPOSE_PROFILES` chỉ khiến các
lần `up -d` sau bỏ qua service đó, **container đang chạy vẫn chạy** — kể cả với `--remove-orphans` —
và nó vẫn giữ 80/443 nên nginx host sẽ không start được. Không có cờ `--profile tls` thì compose báo
không có service tên `caddy`.

Trạng thái lùi này **không** mất dữ liệu và không cần deploy lại: listener `:8081`, các biến env mới
và code mới đều vô hại khi Caddy không chạy. Certificate đã xin vẫn nằm trong volume `caddy_data`,
nên cắt lại lần sau là dùng tiếp chứ không xin lại. Cái mất lại là custom domain hỏng TLS — đúng vấn
đề ban đầu.

Muốn lùi cả `.env.stg`: `cp .env.stg.bak.<ngày> .env.stg` rồi `docker compose … up -d`.

## Sau 1–2 tuần ổn định — tắt certbot

Giữ certbot và cron renewal đủ lâu để chắc chắn không phải lùi. Sau đó:

```bash
sudo rm /etc/cron.d/certbot-renew
sudo crontab -l 2>/dev/null | grep -i certbot   # phải rỗng
```

Chưa cần gỡ certbot hay xoá `/etc/letsencrypt` — chúng không tốn gì đáng kể và là bảo hiểm rẻ. Nếu
muốn dọn hẳn thì xoá `/etc/nginx/conf.d/bookingos-stg.conf` trước, để không còn config trỏ vào
certificate đã xoá.

Đây cũng là lúc xoá chính file này khỏi repo:

```bash
git rm docs/nginx-to-caddy-cutover.md
# rồi gỡ khối trích dẫn ở đầu Phase 6 của docs/deployment-runbook.md
```

Phần vận hành lâu dài của Caddy đã nằm trong `deployment.md` → *TLS — Caddy on-demand* và Phase 6–7
của runbook; chỉ trình tự cắt là hết giá trị. Cần lại thì `git log` vẫn còn.

Caddy tự gia hạn khi đang chạy, không có cron nào phải tạo. Máy staging tắt 12 tiếng mỗi ngày thì
certificate có thể chạm ngưỡng gia hạn lúc máy tắt; Caddy gia hạn ở lượt start kế tiếp, và với cửa sổ
30 ngày của Let's Encrypt thì lịch 10:00–22:00 hàng ngày là dư sức.

## Những chỗ hay sai

| Triệu chứng | Nguyên nhân thường gặp | Xử lý |
| --- | --- | --- |
| Deploy fail `ACME_EMAIL is required` | Chưa làm Bước 1 trước khi deploy | Thêm `ACME_EMAIL` vào `.env.stg`, chạy lại Deploy |
| Bước 3 trả 404 cho domain đã verified | Deploy chưa chạy nên container nginx còn là bản cũ không có `:8081` | Làm lại Bước 2 |
| `curl` Bước 3 báo connection refused | Cổng chưa publish — thiếu `TLS_ASK_PORT` trong `.env.stg` | Bước 1, rồi `up -d` |
| Container `caddy` crashloop `address already in use` | nginx host chưa `disable --now` | `sudo systemctl disable --now nginx` rồi `up -d` |
| `docker compose ps` không thấy `caddy` | `COMPOSE_PROFILES` chưa là `tls` | Bước 5.2 |
| Caddy start nhưng không xin được certificate | Cổng 80 bị chặn ở Security Group, hoặc record Cloudflare đang Proxied | Mở 80; đổi record về DNS only |
| Certificate vẫn là wildcard | nginx host chưa tắt, vẫn đang giữ 443 | `sudo systemctl disable --now nginx` |
| Một tenant mới báo lỗi certificate | Tên miền chưa verified (`ask` trả 404), hoặc vừa verify xong và còn negative cache 60 giây | Verify xong đợi ~1 phút rồi thử lại |
| `too many certificates already issued` | 50 certificate/tuần cho `bookingos.vn`, mọi `*.stg` tính chung | Đợi hết cửa sổ; khi test lặp thì dùng `acme_ca` staging |
| Sau reboot site chết | nginx host còn `enable`, giành cổng với container caddy | `sudo systemctl disable nginx` |

Chẩn đoán bắt đầu từ đây — Caddy ghi cả câu trả lời của endpoint `ask` lẫn kết quả xin certificate cho
từng hostname:

```bash
docker compose --env-file .env.stg \
  -f docker-compose.deploy.yml -f docker-compose.stg-data.yml logs --since 30m caddy
```
