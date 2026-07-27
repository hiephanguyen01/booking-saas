# Deploy bookingos staging trên AWS — hướng dẫn từ con số 0

> Cập nhật: 2026-07-26. Đây là tài liệu thao tác cho người deploy lần đầu.
> Kiến trúc, giới hạn và trade-off được giải thích thêm trong
> [`staging-deployment-low-cost.md`](./staging-deployment-low-cost.md).

Guide này chốt sẵn một cấu hình để bạn không phải tự đoán:

- AWS region **Singapore**: `ap-southeast-1`;
- EC2 **`t4g.small` On-Demand**, 2 vCPU, 2 GiB RAM, ARM64;
- Ubuntu Server 24.04 LTS **64-bit Arm**;
- 40 GiB EBS `gp3`, mã hoá;
- 6 GiB swap;
- một Elastic IP;
- PostgreSQL 16, Redis 7, NGINX và ba process Node cùng một EC2;
- Cloudflare quản lý DNS và R2 media;
- Resend gửi email;
- S3 private bucket giữ database backup đã mã hoá;
- source được checkout trực tiếp từ Git.

Đây là staging tối giản, không có high availability. Không dùng topology này cho production.

## Từ điển 1 phút

| Từ | Hiểu đơn giản |
| --- | --- |
| Region | khu vực đặt tài nguyên; guide dùng Singapore |
| EC2 instance | máy chủ ảo chạy Ubuntu |
| AMI | image dùng để cài hệ điều hành cho EC2 |
| EBS | ổ đĩa gắn vào EC2 |
| Security Group | firewall bên ngoài EC2 do AWS quản lý |
| Elastic IP | public IPv4 cố định để DNS không đổi sau stop/start |
| IAM Role | quyền tạm thời AWS cấp cho EC2, không cần access key |
| S3 | object storage dùng giữ backup |
| DNS | ánh xạ hostname như `admin.stg.example.com` tới Elastic IP |
| TLS certificate | certificate giúp website dùng HTTPS |
| systemd | trình quản lý ba process app và tự start sau reboot |
| NGINX | cổng vào HTTPS, chuyển request tới đúng process app |

## Chi phí cần hiểu trước khi bấm tạo máy

Giá tham khảo tại Singapore, chưa gồm thuế và data transfer:

| Thành phần | Giá tham khảo | Nếu chạy 24/7 |
| --- | ---: | ---: |
| `t4g.small` Linux On-Demand | 0,0212 USD/giờ | khoảng 15,48 USD/tháng ngoài trial |
| `t4g.small` trial hiện tại | tối đa 750 giờ/tháng | 0 USD compute đến 31/12/2026 |
| EBS `gp3` 40 GiB | 0,096 USD/GiB-tháng | khoảng 3,84 USD/tháng |
| Public IPv4 / Elastic IP | 0,005 USD/giờ | khoảng 3,65 USD/tháng |
| **Tổng nền trong trial** |  | **khoảng 7,49 USD/tháng** |
| **Tổng nền ngoài trial** |  | **khoảng 22,97 USD/tháng** |

Account tạo từ 15/07/2025 chỉ được dùng một số instance type trên Free Plan. Với Ubuntu ARM64 trong
guide này, chọn `t4g.small`; `t4g.medium` không Free Plan eligible. AWS hiện công bố trial
`t4g.small` tối đa 750 giờ/tháng tại Singapore đến hết 31/12/2026. Phải đặt CPU credits thành
**Standard**, vì surplus CPU credit ở Unlimited không nằm trong phần compute miễn phí.

AWS Free Plan mới có 100 USD credit ban đầu và kết thúc khi hết credit hoặc hết 6 tháng. Trong thời
gian trial `t4g.small`, 100 USD dư sức cover khoảng 44,94 USD chi phí nền EBS + IPv4 của 6 tháng,
chưa tính S3, data transfer và dịch vụ phát sinh. EBS và Elastic IP vẫn tính tiền khi EC2 dừng.
S3 backup nhỏ, R2 media, email và Internet data transfer tính riêng; với staging ít dữ liệu chúng
thường rất nhỏ nhưng không được giả định luôn bằng 0.

Nếu account đang ở **Free account plan**, account sẽ đóng khi hết 6 tháng hoặc hết credit. Ghi ngày
hết hạn vào calendar. Trước ngày đó, tải backup và chọn upgrade sang Paid plan nếu muốn giữ tài
nguyên; sau khi upgrade, usage vượt credit sẽ tính vào thẻ thanh toán.

Nguồn giá và giới hạn:

- [AWS Free Tier account plan](https://docs.aws.amazon.com/awsaccountbilling/latest/aboutv2/free-tier-plans.html);
- [EC2 Free Plan eligible instance types](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/ec2-free-tier-usage.html);
- [T4g free trial FAQ](https://aws.amazon.com/ec2/faqs/);
- [Amazon EC2 On-Demand pricing](https://aws.amazon.com/ec2/pricing/on-demand/);
- [Amazon VPC public IPv4 pricing](https://aws.amazon.com/vpc/pricing/);
- [T4g instance specifications](https://aws.amazon.com/ec2/instance-types/general-purpose/).

Không tạo NAT Gateway, Application Load Balancer, RDS, ElastiCache hoặc EKS trong guide này. Chúng
không cần thiết cho staging ít tải và làm chi phí tăng đáng kể.

## Cách dùng guide

Trong tài liệu:

- lệnh trong block `bash` được chạy trên Terminal;
- nếu có chữ **trên máy local**, hãy chạy trên Mac/Linux của bạn;
- nếu có chữ **trên EC2**, hãy chạy sau khi SSH vào máy;
- chữ trong dấu `<...>` là placeholder bắt buộc thay;
- không gõ ký tự `$` hoặc prompt nếu Terminal đang hiển thị chúng;
- khi `sudoedit` mở Nano: `Ctrl+O`, `Enter` để lưu; `Ctrl+X` để thoát.

Mỗi phase có một **checkpoint**. Chỉ chuyển phase khi checkpoint hiện tại đạt. Nếu lệnh lỗi:

1. dừng tại phase đang làm;
2. đọc toàn bộ error;
3. sửa nguyên nhân;
4. chạy lại checkpoint;
5. không “bỏ qua để làm tiếp”.

Không chạy lệnh production, không dùng dữ liệu production và không dùng payment credential thật.
Không paste secret vào chat, ticket, Git hoặc screenshot.

## Lộ trình

| Phase | Kết quả cần đạt |
| ---: | --- |
| 0 | Chốt domain, bảo vệ tài khoản AWS, budget và local gate |
| 1 | Tạo EC2 + Elastic IP an toàn, chỉ public 22/80/443 |
| 2 | NGINX, PostgreSQL, Redis, Node và pnpm sẵn sàng |
| 3 | Secret inventory và env file |
| 4 | PostgreSQL/Redis chỉ chạy nội bộ |
| 5 | Wildcard DNS trỏ về VM |
| 6 | R2 media, custom domain và CORS |
| 7 | Resend SMTP |
| 8 | Wildcard TLS và auto-renew |
| 9 | Checkout đúng SHA và build đủ ba app |
| 10 | Migration, DB roles và seed |
| 11 | Ba systemd services |
| 12 | NGINX reverse proxy |
| 13 | Internal/public health green |
| 14 | Tenant staging đầu tiên |
| 15 | Functional smoke check |
| 16 | S3 backup mã hoá, IAM Role và restore drill |
| 17 | Uptime monitoring, log retention và kiểm soát chi phí |
| 18 | Bàn giao |

---

## Phase 0 — Chuẩn bị trước khi tạo tài nguyên

### Bước 0.1 — Chọn domain

Guide dùng worksheet sau:

| Biến | Ví dụ | Giá trị thực tế |
| --- | --- | --- |
| Root domain | `example.com` | `<ROOT_DOMAIN>` |
| Staging base | `stg.example.com` | `<STG_BASE_DOMAIN>` |
| Tenant đầu tiên | `demo.stg.example.com` | `<DEMO_HOST>` |
| Dashboard | `admin.stg.example.com` | `<DASHBOARD_HOST>` |
| API public | `api.stg.example.com` | `<API_HOST>` |
| Media | `media-stg.example.com` | `<MEDIA_HOST>` |
| Email domain | `mail-stg.example.com` | `<EMAIL_DOMAIN>` |
| Sender | `no-reply@mail-stg.example.com` | `<EMAIL_FROM>` |
| Alert/Certbot email | `ops@example.com` | `<OPS_EMAIL>` |
| Staging admin email | `admin-stg@example.com` | `<STAGING_ADMIN_EMAIL>` |

Quy tắc:

- `DEMO_HOST=<slug>.<STG_BASE_DOMAIN>`;
- `PLATFORM_BASE_DOMAIN=<STG_BASE_DOMAIN>`;
- không dùng hostname production;
- không dùng domain miễn phí không kiểm soát được DNS API;
- staging dùng một tenant hostname cố định trước, chưa cần custom domain.

### Bước 0.2 — Tạo các tài khoản cần thiết

Chuẩn bị quyền đăng nhập:

- AWS;
- Cloudflare account đang quản lý root domain;
- Resend account;
- Git provider chứa repository;
- password manager dùng chung cho team vận hành;
- một email nhận alert.

Bật MFA cho AWS, Cloudflare, Resend và Git provider.

### Bước 0.3 — Bảo vệ tài khoản AWS

Đăng nhập AWS Console bằng root user, rồi làm ngay:

1. bấm tên tài khoản ở góc trên phải;
2. mở **Security credentials**;
3. bật MFA cho root user;
4. không tạo access key cho root;
5. mở **Account → IAM User and Role Access to Billing Information**;
6. bật **Activate IAM Access** để admin user xem Budget/Cost Explorer;
7. đăng xuất root sau khi hoàn tất.

Tạo user vận hành riêng:

1. đăng nhập root lần cuối và mở **IAM → Users → Create user**;
2. User name: `bookingos-admin`;
3. bật quyền truy cập **AWS Management Console**;
4. chọn tạo IAM user nếu Console hỏi loại user;
5. đặt password ngẫu nhiên, lưu trong password manager;
6. ở bước permissions, chọn **Attach policies directly**;
7. chọn `AdministratorAccess`;
8. tạo user và lưu **Console sign-in URL**;
9. đăng xuất root, đăng nhập bằng `bookingos-admin`;
10. mở Security credentials của `bookingos-admin` và bật MFA.

`AdministratorAccess` là quyền rộng nhưng phù hợp cho một account cá nhân đang bootstrap. App trên
EC2 không dùng quyền này; Phase 16 tạo IAM Role riêng với quyền S3 tối thiểu. Khi có nhiều người vận
hành, chuyển sang IAM Identity Center và permission set hẹp hơn.

Từ đây tiếp tục guide bằng `bookingos-admin`. Chỉ dùng root cho thao tác tài khoản/billing mà AWS bắt
buộc. Không lưu root password trong trình duyệt dùng chung.

### Bước 0.4 — Chọn region Singapore

Trong thanh trên cùng của AWS Console:

1. bấm tên region hiện tại;
2. chọn **Asia Pacific (Singapore) — `ap-southeast-1`**;
3. kiểm tra region này trước mỗi lần tạo EC2, EBS, Elastic IP hoặc S3 bucket.

Tài nguyên ở region khác không tự xuất hiện trong màn hình Singapore và có thể làm bạn tưởng đã mất
máy.

### Bước 0.5 — Tạo budget trước khi tạo EC2

Trong AWS Console:

1. tìm **Billing and Cost Management**;
2. mở **Budgets**;
3. chọn **Create budget**;
4. chọn **Customize (advanced)**;
5. chọn **Cost budget**;
6. Period chọn **Monthly**;
7. Budget amount nhập `15`;
8. trong **Advanced options**, dùng **Unblended costs** và bỏ chọn **Credits** để budget theo dõi
   mức tiêu thụ trước khi trừ 100 USD credit;
9. đặt tên `bookingos-stg-monthly`;
10. tạo cảnh báo **Actual** ở 50%, 80% và 100%;
11. nếu giao diện cho phép, thêm cảnh báo **Forecasted** ở 100%;
12. xác nhận email nhận cảnh báo là email bạn đọc thường xuyên.

Budget chỉ cảnh báo, không tự dừng EC2. Billing có độ trễ nên vẫn phải kiểm tra
**Billing → Credits** và **Cost Explorer** mỗi tuần.

Trong AWS Console Home hoặc Billing, ghi lại ngày Free plan/credit hết hạn và tạo calendar reminder
trước 14 ngày.

### Bước 0.6 — Chốt sizing

Không đổi khỏi bộ cấu hình sau trong lần deploy đầu:

```text
Region             ap-southeast-1
Purchase option    On-Demand
Instance type      t4g.small
Architecture       arm64
Operating system   Ubuntu Server 24.04 LTS
Root volume        40 GiB gp3, encrypted
CPU credits        Standard
Public IP          Elastic IP
```

`t4g.micro` chỉ có 1 GiB RAM và không đủ an toàn cho PostgreSQL, Redis cùng ba Node process.
`t4g.small` có 2 GiB RAM: đủ cho staging rất ít tải sau khi thêm 6 GiB swap, giới hạn Redis và build
tuần tự. Đây là mức ARM64 cao nhất đang Free Plan eligible; chấp nhận build chậm và downtime ngắn khi
deploy.

AWS cũng liệt kê một số instance x86 Free Plan eligible, nhưng guide không chọn chúng vì tốn credit
nhanh hơn và không thuộc trial `t4g.small` 750 giờ/tháng.

### Bước 0.7 — Chốt Git revision sẽ deploy

Trên máy local:

```bash
cd <LOCAL_REPOSITORY_PATH>
git status --short
git branch --show-current
git rev-parse HEAD
```

Ghi lại full commit SHA:

```text
STAGING_RELEASE_SHA=<FULL_40_CHAR_SHA>
```

Không deploy từ một branch name chưa cố định nếu team vẫn đang push vào branch đó.

Nếu repository có thay đổi chưa commit, chúng sẽ không xuất hiện trên EC2. Chỉ deploy commit đã push
lên Git provider.

### Bước 0.8 — Chạy gate local

```bash
cd <LOCAL_REPOSITORY_PATH>
pnpm install --frozen-lockfile
pnpm turbo lint typecheck build
pnpm --filter=@booking/api check:rls
```

Repository không có automated tests theo
[`ADR 0005`](../decisions/0005-no-tests-policy.md). Không thêm hoặc chạy test runner.

### Checkpoint Phase 0

- [ ] Đã có đủ hostname thực tế.
- [ ] Đã có tài khoản AWS, Cloudflare, Resend và Git.
- [ ] Root và `bookingos-admin` đều bật MFA; root không có access key.
- [ ] Console đang ở `ap-southeast-1`.
- [ ] Budget 15 USD/tháng và email alert đã tạo.
- [ ] Đã tạo reminder trước ngày Free plan/credit hết hạn.
- [ ] Đã ghi full commit SHA.
- [ ] Commit đã được push.
- [ ] Lint, typecheck, build và `check:rls` đều thành công ở local.

---

## Phase 1 — Tạo EC2 an toàn trên AWS Console

### Bước 1.1 — Mở EC2 Launch wizard

1. kiểm tra góc trên phải đang là **Singapore**;
2. tìm **EC2** trong thanh tìm kiếm;
3. mở **Instances**;
4. bấm **Launch instances**.

AWS thay đổi giao diện theo thời gian nhưng tên trường chính thường giữ nguyên.

### Bước 1.2 — Đặt tên và chọn đúng AMI

Trong **Name and tags**:

```text
Name = bookingos-stg-01
```

Trong **Application and OS Images (Amazon Machine Image)**:

1. chọn **Ubuntu**;
2. chọn **Ubuntu Server 24.04 LTS**;
3. architecture chọn **64-bit (Arm)**;
4. kiểm tra publisher/owner là **Canonical**;
5. không chọn SQL Server, Ubuntu Pro, Deep Learning hoặc Marketplace image trả phí.

Sai kiến trúc ở đây sẽ khiến `t4g.small` không chọn được hoặc binary Node không chạy.

### Bước 1.3 — Chọn instance type

Trong **Instance type**, chọn:

```text
t4g.small
```

Giữ **On-Demand**. Không bật Spot cho lần deploy đầu vì Spot có thể bị AWS thu hồi khi thiếu capacity.

### Bước 1.4 — Tạo key pair

Trong **Key pair (login)**:

1. chọn **Create new key pair**;
2. Name: `bookingos-stg-singapore`;
3. Key pair type: `ED25519`;
4. Private key format: `.pem`;
5. bấm **Create key pair**.

Browser chỉ tải private key một lần. Trên máy local, di chuyển file vào thư mục SSH và khoá quyền:

```bash
mkdir -p ~/.ssh
mv ~/Downloads/bookingos-stg-singapore.pem ~/.ssh/
chmod 400 ~/.ssh/bookingos-stg-singapore.pem
```

Không upload file `.pem` lên Git, Google Drive công khai, chat hoặc EC2.

### Bước 1.5 — Cấu hình network

Trong **Network settings**, bấm **Edit**:

| Trường | Giá trị |
| --- | --- |
| VPC | default VPC |
| Subnet | một public subnet ở Singapore |
| Auto-assign public IP | Enable |
| Firewall | Create security group |
| Security group name | `bookingos-stg-web-sg` |
| Description | `bookingos staging web and restricted SSH` |

Tạo đúng ba inbound rules:

| Type | Port | Source | Ghi chú |
| --- | ---: | --- | --- |
| SSH | 22 | **My IP** | chỉ IP Internet hiện tại của bạn |
| HTTP | 80 | Anywhere IPv4 (`0.0.0.0/0`) | redirect và TLS challenge |
| HTTPS | 443 | Anywhere IPv4 (`0.0.0.0/0`) | website |

Nếu cần IPv6, chỉ thêm HTTP/HTTPS từ `::/0`; không mở SSH toàn Internet. Không mở 3000, 3100,
3101, 3102, 5432, 6379, 8025, 9000 hoặc 9001.

Nếu IP nhà bạn thay đổi và SSH bị timeout, vào
**EC2 → Security Groups → `bookingos-stg-web-sg` → Edit inbound rules**, rồi cập nhật SSH thành
**My IP** mới.

### Bước 1.6 — Cấu hình storage

Trong **Configure storage**:

| Trường | Giá trị |
| --- | --- |
| Size | `40` GiB |
| Volume type | `gp3` |
| IOPS | giữ mặc định `3000` |
| Throughput | giữ mặc định `125` MiB/s |
| Encrypted | bật |
| Delete on termination | bật |

`Delete on termination` giúp không để lại EBS rác khi chủ động xoá EC2. Vì vậy Phase 16 bắt buộc có
backup S3 và Phase 1 bật termination protection để tránh xoá nhầm.

### Bước 1.7 — Cấu hình Advanced details

Mở **Advanced details** và đặt:

| Trường | Giá trị |
| --- | --- |
| Purchasing option | không chọn Spot |
| Shutdown behavior | Stop |
| Termination protection | Enable |
| Stop protection | Enable nếu giao diện có |
| Detailed CloudWatch monitoring | Disable |
| Credit specification | Standard |
| Metadata version | V2 only / IMDSv2 required |
| User data | để trống |

Giải thích ngắn:

- **Standard CPU credits** tránh phụ phí Unlimited khi máy burst CPU lâu; build có thể chậm lại khi
  hết credit nhưng staging vẫn an toàn về chi phí;
- **Detailed monitoring** tính thêm phí và staging chưa cần;
- **IMDSv2 only** bảo vệ metadata/temporary IAM credentials tốt hơn;
- **termination protection** chặn thao tác xoá nhầm, nhưng không thay thế backup.

### Bước 1.8 — Review và launch

Ở panel **Summary**, kiểm tra lần cuối:

```text
Ubuntu 24.04 LTS, 64-bit Arm
t4g.small
40 GiB gp3 encrypted
bookingos-stg-web-sg
bookingos-stg-singapore
```

Bấm **Launch instance** rồi **View all instances**. Chờ:

- Instance state: `Running`;
- Status check: `2/2 checks passed`.

### Bước 1.9 — Cấp Elastic IP

Public IP tự cấp lúc launch sẽ đổi sau khi stop/start. Tạo Elastic IP để DNS luôn ổn định:

1. EC2 → **Network & Security → Elastic IP addresses**;
2. bấm **Allocate Elastic IP address**;
3. Network Border Group giữ đúng Singapore;
4. bấm **Allocate**;
5. chọn IP vừa tạo;
6. **Actions → Associate Elastic IP address**;
7. Resource type chọn **Instance**;
8. Instance chọn `bookingos-stg-01`;
9. Private IP chọn IP duy nhất được hiển thị;
10. bấm **Associate**;
11. thêm tag `Name=bookingos-stg-eip`.

Ghi lại:

```text
STAGING_VM_IP=<ELASTIC_IPV4>
STAGING_VM_USER=ubuntu
```

Elastic IP tính phí kể cả khi EC2 đang dừng. Nếu sau này xoá staging, phải release riêng Elastic IP.

### Bước 1.10 — SSH lần đầu

Trên máy local:

```bash
ssh -i ~/.ssh/bookingos-stg-singapore.pem ubuntu@<STAGING_VM_IP>
```

Lần đầu SSH hỏi xác nhận fingerprint. Đối chiếu hostname/IP rồi nhập `yes`.

Kiểm tra trên EC2:

```bash
whoami
uname -m
cat /etc/os-release
lsblk
free -h
```

Kỳ vọng:

- user là `ubuntu`;
- architecture là `aarch64`;
- OS là Ubuntu 24.04;
- root disk khoảng 40 GiB;
- RAM khoảng 1,8–1,9 GiB khả dụng.

### Bước 1.11 — Cập nhật OS

Trên EC2:

```bash
sudo apt update
sudo DEBIAN_FRONTEND=noninteractive apt full-upgrade -y
sudo timedatectl set-timezone UTC
sudo reboot
```

Lệnh SSH sẽ ngắt. Chờ khoảng một phút rồi SSH lại bằng lệnh ở Bước 1.10.

### Bước 1.12 — Cấu hình UFW

Trước tiên tìm public IP của máy local bằng cách mở
[https://checkip.amazonaws.com](https://checkip.amazonaws.com) trên browser. Thay
`<ADMIN_PUBLIC_IP>` bằng IP đó:

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow from <ADMIN_PUBLIC_IP> to any port 22 proto tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
sudo ufw status verbose
```

Giữ session SSH hiện tại mở. Mở terminal local thứ hai và SSH lại để xác nhận không tự khoá mình
ngoài server.

AWS Security Group là lớp firewall ngoài EC2; UFW là lớp thứ hai bên trong Ubuntu. Cả hai phải cùng
cho phép một kết nối.

### Bước 1.13 — Thêm 6 GiB swap

`t4g.small` chỉ có 2 GiB RAM nên bắt buộc thêm swap để build monorepo tuần tự:

```bash
sudo fallocate -l 6G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
sudoedit /etc/fstab
```

Thêm một dòng ở cuối file rồi lưu:

```text
/swapfile none swap sw 0 0
```

Kiểm tra:

```bash
swapon --show
free -h
```

Kỳ vọng có `/swapfile` khoảng 6 GiB. Swap không thay thế RAM và build sẽ chậm; đó là trade-off để
giữ chi phí thấp.

### Checkpoint Phase 1

- [ ] EC2 là `t4g.small`, Ubuntu 24.04 Arm, Singapore.
- [ ] Status check là `2/2`.
- [ ] Root EBS là 40 GiB `gp3`, encrypted.
- [ ] Termination protection bật, CPU credits là Standard.
- [ ] Elastic IP đã associate và đã ghi lại.
- [ ] Security Group chỉ public 80/443; SSH chỉ từ IP quản trị.
- [ ] SSH bằng `.pem` thành công.
- [ ] UFW chỉ mở 22/80/443 đúng phạm vi.
- [ ] OS đã update, timezone UTC.
- [ ] Swap 6 GiB đã active.

---

## Phase 2 — Cài phần mềm nền

### Bước 2.1 — Cài package hệ thống

```bash
sudo apt update
sudo apt install -y \
  git nginx postgresql postgresql-contrib redis-server \
  build-essential python3 pkg-config libssl-dev \
  certbot python3-certbot-dns-cloudflare \
  age curl ca-certificates unzip dnsutils
```

Kiểm tra version:

```bash
nginx -v
psql --version
redis-server --version
certbot --version
```

PostgreSQL phải là major 16. Redis phải là major 7.

### Bước 2.2 — Tạo app user và thư mục

```bash
sudo adduser --disabled-password --gecos "" bookingos
sudo mkdir -p /opt/bookingos-stg/repo
sudo mkdir -p /opt/bookingos-stg/releases
sudo mkdir -p /etc/bookingos-stg
sudo chown -R bookingos:bookingos /opt/bookingos-stg
sudo chown root:bookingos /etc/bookingos-stg
sudo chmod 750 /etc/bookingos-stg
```

### Bước 2.3 — Cài Node và pnpm

Chuyển sang app user:

```bash
sudo -iu bookingos
```

Clone và pin nvm:

```bash
git clone https://github.com/nvm-sh/nvm.git /home/bookingos/.nvm
cd /home/bookingos/.nvm
git checkout v0.40.3
export NVM_DIR=/home/bookingos/.nvm
. "$NVM_DIR/nvm.sh"
```

Mở `/home/bookingos/.bashrc` và thêm:

```bash
export NVM_DIR=/home/bookingos/.nvm
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
```

Cài runtime đúng version của repository:

```bash
nvm install 22.22.0
nvm alias default 22.22.0
corepack enable
corepack prepare pnpm@10.13.1 --activate
node --version
pnpm --version
command -v node
command -v pnpm
exit
```

Ghi lại hai đường dẫn tuyệt đối:

```text
NODE_BIN=<OUTPUT_OF_COMMAND_V_NODE>
PNPM_BIN=<OUTPUT_OF_COMMAND_V_PNPM>
```

Hai giá trị này sẽ được paste vào systemd unit.

### Bước 2.4 — Bật service nền

```bash
sudo systemctl enable --now postgresql redis-server nginx
sudo systemctl status postgresql redis-server nginx --no-pager
```

### Bước 2.5 — Tạo hostname nội bộ

```bash
sudoedit /etc/hosts
```

Thêm:

```text
127.0.0.1 bookingos-api bookingos-db bookingos-redis
```

Kiểm tra:

```bash
getent hosts bookingos-api
getent hosts bookingos-db
getent hosts bookingos-redis
```

### Checkpoint Phase 2

- [ ] NGINX, PostgreSQL và Redis đang active.
- [ ] Node đáp ứng `>=22.22.0`.
- [ ] pnpm là `10.13.1`.
- [ ] Đã ghi absolute path của Node và pnpm.
- [ ] Ba hostname nội bộ resolve về `127.0.0.1`.

---

## Phase 3 — Sinh và lưu secret

### Bước 3.1 — Tạo credential inventory

Tạo từng secret riêng bằng:

```bash
openssl rand -hex 32
```

Sinh và lưu trong password manager:

| Secret | Giá trị |
| --- | --- |
| PostgreSQL migrator password | `<MIGRATOR_PASSWORD>` |
| PostgreSQL `app_user` password | `<APP_USER_PASSWORD>` |
| PostgreSQL `app_admin` password | `<APP_ADMIN_PASSWORD>` |
| Redis password | `<REDIS_PASSWORD>` |
| Session current secret | `<SESSION_SECRET_CURRENT>` |
| Payment encryption key | `<PAYMENTS_ENC_KEY>` |
| Staging admin password | `<SEED_ADMIN_PASSWORD>` |

Không tái sử dụng secret. Dùng hex để không phải URL-encode password trong connection string.

### Bước 3.2 — Tạo file env

```bash
sudo touch /etc/bookingos-stg/bookingos.env
sudo chown root:bookingos /etc/bookingos-stg/bookingos.env
sudo chmod 640 /etc/bookingos-stg/bookingos.env
sudoedit /etc/bookingos-stg/bookingos.env
```

Điền trước các giá trị local service; R2 và SMTP sẽ bổ sung ở phase sau:

```dotenv
NODE_ENV=production
LOG_PRETTY=false
LOG_LEVEL=info
SWAGGER_ENABLED=false

PORT=3100
STOREFRONT_PORT=3101
DASHBOARD_PORT=3102

MIGRATE_DATABASE_URL=postgresql://postgres:<MIGRATOR_PASSWORD>@bookingos-db:5432/booking_stg?schema=public
DATABASE_URL=postgresql://app_user:<APP_USER_PASSWORD>@bookingos-db:5432/booking_stg?schema=public
ADMIN_DATABASE_URL=postgresql://app_admin:<APP_ADMIN_PASSWORD>@bookingos-db:5432/booking_stg?schema=public
REDIS_URL=redis://:<REDIS_PASSWORD>@bookingos-redis:6379/0

PLATFORM_BASE_DOMAIN=<STG_BASE_DOMAIN>
BACKEND_URL=http://bookingos-api:3100
DASHBOARD_URL=https://<DASHBOARD_HOST>
STOREFRONT_URL=https://<DEMO_HOST>
PUBLIC_API_URL=https://<API_HOST>

SESSION_COOKIE_SECURE=true
SESSION_SECRET_CURRENT=<SESSION_SECRET_CURRENT>
PAYMENTS_ENC_KEY=<PAYMENTS_ENC_KEY>
PAYMENT_STALE_SEC=300
ALLOW_MOCK_PAYMENTS=false

PAYMENT_REDIRECT_ORIGINS=https://payments.invalid

SEED_ADMIN_EMAIL=<STAGING_ADMIN_EMAIL>
SEED_ADMIN_PASSWORD=<SEED_ADMIN_PASSWORD>
SEED_DEMO=false
```

`https://payments.invalid` là fail-closed placeholder. Phải thay bằng exact HTTPS origin trả về từ
gateway sandbox trước khi thử checkout.

### Bước 3.3 — Kiểm tra file secret

```bash
sudo stat -c '%U %G %a %n' /etc/bookingos-stg/bookingos.env
```

Kỳ vọng:

```text
root bookingos 640 /etc/bookingos-stg/bookingos.env
```

Không chạy `cat` file env trên terminal được ghi log hoặc chia sẻ màn hình.

### Checkpoint Phase 3

- [ ] Mỗi secret là một giá trị riêng.
- [ ] Secret đã lưu trong password manager.
- [ ] Env file là `root:bookingos`, mode `640`.
- [ ] Mock payment tắt.
- [ ] Secure cookie bật.
- [ ] Swagger tắt.

---

## Phase 4 — Cấu hình PostgreSQL và Redis

### Bước 4.1 — Khoá PostgreSQL vào loopback

```bash
sudoedit /etc/postgresql/16/main/postgresql.conf
```

Xác nhận:

```text
listen_addresses = '127.0.0.1'
password_encryption = scram-sha-256
```

Restart:

```bash
sudo systemctl restart postgresql
sudo ss -lntp | grep 5432
```

Kết quả chỉ được bind `127.0.0.1:5432`.

### Bước 4.2 — Tạo database

```bash
sudo -u postgres createdb booking_stg
sudo -u postgres psql -lqt
```

`booking_stg` phải xuất hiện đúng một lần.

### Bước 4.3 — Đặt migrator password

```bash
sudo -u postgres psql
```

Trong `psql`:

```text
\password postgres
\q
```

Nhập đúng `<MIGRATOR_PASSWORD>` đã lưu.

### Bước 4.4 — Cấu hình Redis

```bash
sudoedit /etc/redis/redis.conf
```

Xác nhận:

```text
bind 127.0.0.1 ::1
protected-mode yes
requirepass <REDIS_PASSWORD>
appendonly yes
maxmemory 256mb
maxmemory-policy noeviction
```

Restart:

```bash
sudo systemctl restart redis-server
sudo ss -lntp | grep 6379
```

Redis chỉ được bind loopback.

Giới hạn 256 MiB bảo vệ RAM của `t4g.small`. Dùng `noeviction` để Redis trả lỗi khi đầy thay vì âm
thầm xoá session, OTP hoặc booking hold. Với staging ít tải, chạm giới hạn này là tín hiệu cần dọn dữ
liệu hoặc nâng máy, không nên đổi sang eviction policy.

Kiểm tra bằng interactive client:

```bash
redis-cli -h bookingos-redis
```

Trong Redis CLI:

```text
AUTH <REDIS_PASSWORD>
PING
QUIT
```

Kết quả `PING` phải là `PONG`.

### Checkpoint Phase 4

- [ ] Database `booking_stg` tồn tại.
- [ ] Migrator password đã đổi.
- [ ] PostgreSQL chỉ listen loopback.
- [ ] Redis yêu cầu password.
- [ ] Redis chỉ listen loopback.
- [ ] Redis giới hạn 256 MiB và dùng `noeviction`.
- [ ] Redis `PING` trả `PONG`.

---

## Phase 5 — Cấu hình Cloudflare DNS

### Bước 5.1 — Tạo DNS records

Trong Cloudflare → DNS → Records:

| Type | Name | Content | Proxy |
| --- | --- | --- | --- |
| A | `*.stg` | `<STAGING_VM_IP>` | DNS only |
| A | `stg` | `<STAGING_VM_IP>` | DNS only |

Nếu staging base không phải `stg.example.com`, đổi `Name` tương ứng.

Không bật orange-cloud proxy trong guide này.

### Bước 5.2 — Kiểm tra propagation

Từ máy local:

```bash
dig +short <DEMO_HOST>
dig +short <DASHBOARD_HOST>
dig +short <API_HOST>
```

Cả ba phải trả `<STAGING_VM_IP>`.

### Bước 5.3 — Tạo DNS API token cho Certbot

Cloudflare → My Profile → API Tokens:

1. Create Token;
2. permission `Zone / DNS / Edit`;
3. zone resource chỉ chọn `<ROOT_DOMAIN>`;
4. không cấp account-wide permission;
5. tạo và copy token một lần.

Lưu token vào password manager với tên `bookingos-stg-certbot-dns`.

### Checkpoint Phase 5

- [ ] Wildcard và base record là DNS-only.
- [ ] Demo, Dashboard và API hostname cùng resolve về VM.
- [ ] Certbot token chỉ có DNS Edit trên đúng một zone.

---

## Phase 6 — Cấu hình Cloudflare R2

### Bước 6.1 — Tạo media bucket

Cloudflare → R2:

1. Create bucket;
2. name `bookingos-stg-media`;
3. storage class `Standard`;
4. không chọn Infrequent Access;
5. tạo bucket.

### Bước 6.2 — Gắn public custom domain

Trong bucket settings:

1. Custom Domains;
2. Connect Domain;
3. nhập `<MEDIA_HOST>`;
4. chờ status `Active`.

Kiểm tra:

```bash
dig +short <MEDIA_HOST>
```

### Bước 6.3 — Tạo app R2 token

Tạo token:

- permission: Object Read & Write;
- scope: chỉ `bookingos-stg-media`;
- lưu Access Key ID và Secret Access Key vào password manager.

Không dùng token Certbot cho R2 và không dùng R2 token cho DNS.

### Bước 6.4 — Thêm CORS

Bucket → Settings → CORS Policy:

```json
[
  {
    "AllowedOrigins": [
      "https://<DASHBOARD_HOST>",
      "https://<DEMO_HOST>"
    ],
    "AllowedMethods": ["PUT"],
    "AllowedHeaders": ["Content-Type"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

Thay placeholder trước khi save. Không để nguyên `<...>` trong JSON.

### Bước 6.5 — Bổ sung R2 env

```bash
sudoedit /etc/bookingos-stg/bookingos.env
```

Thêm:

```dotenv
S3_ENDPOINT=https://<CLOUDFLARE_ACCOUNT_ID>.r2.cloudflarestorage.com
S3_REGION=auto
S3_ACCESS_KEY=<R2_ACCESS_KEY_ID>
S3_SECRET_KEY=<R2_SECRET_ACCESS_KEY>
S3_BUCKET=bookingos-stg-media
S3_PUBLIC_URL=https://<MEDIA_HOST>
S3_FORCE_PATH_STYLE=false
S3_PRESIGN_EXPIRES_SEC=300
STORAGE_UPLOAD_ORIGINS=https://bookingos-stg-media.<CLOUDFLARE_ACCOUNT_ID>.r2.cloudflarestorage.com
```

### Bước 6.6 — Upload seed assets

Không chạy `storage:init` với R2. Dùng R2 Dashboard upload đúng object key:

| Local source | R2 object key |
| --- | --- |
| `apps/storefront/public/booking-studio/logo.png` | `defaults/booking-studio/logo.png` |
| `apps/storefront/public/booking-studio/app-icon.png` | `defaults/booking-studio/app-icon.png` |
| `apps/storefront/public/booking-studio/hero.png` | `defaults/booking-studio/background.png` |
| `apps/storefront/public/booking-studio/carousel/01.jpg` | `defaults/booking-studio/carousel/01.jpg` |
| `apps/storefront/public/booking-studio/carousel/02.jpg` | `defaults/booking-studio/carousel/02.jpg` |
| `apps/storefront/public/booking-studio/carousel/03.jpg` | `defaults/booking-studio/carousel/03.jpg` |
| `apps/storefront/public/booking-studio/carousel/04.jpg` | `defaults/booking-studio/carousel/04.jpg` |

Kiểm tra một file:

```bash
curl --fail --head https://<MEDIA_HOST>/defaults/booking-studio/logo.png
```

### Checkpoint Phase 6

- [ ] Media bucket là Standard.
- [ ] Custom media domain active.
- [ ] R2 token chỉ truy cập media bucket.
- [ ] CORS có Dashboard và Demo origins.
- [ ] Env có đủ `S3_*` và `STORAGE_UPLOAD_ORIGINS`.
- [ ] Seed asset trả HTTP 200.

---

## Phase 7 — Cấu hình Resend SMTP

### Bước 7.1 — Add domain

Trong Resend:

1. Domains → Add Domain;
2. nhập `<EMAIL_DOMAIN>`;
3. chọn region phù hợp nếu được hỏi;
4. thêm DKIM/SPF records do Resend cung cấp vào Cloudflare;
5. chờ status `Verified`.

Không tự đoán DNS record; copy đúng record Resend hiển thị.

### Bước 7.2 — Tạo API key

Tạo key chỉ dùng cho staging và lưu vào password manager:

```text
RESEND_STAGING_API_KEY=<RESEND_API_KEY>
```

### Bước 7.3 — Bổ sung SMTP env

```bash
sudoedit /etc/bookingos-stg/bookingos.env
```

Thêm:

```dotenv
EMAIL_FROM="bookingos Staging <no-reply@mail-stg.example.com>"
SMTP_HOST=smtp.resend.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=resend
SMTP_PASS=<RESEND_API_KEY>
```

Thay `no-reply@mail-stg.example.com` bằng `<EMAIL_FROM>` trong worksheet. Sau khi thay, dòng đó phải
có dạng:

```dotenv
EMAIL_FROM="bookingos Staging <no-reply@mail-stg.example.com>"
```

### Checkpoint Phase 7

- [ ] Email domain có status Verified.
- [ ] Staging API key được lưu trong password manager.
- [ ] `SMTP_HOST` không rỗng.
- [ ] Sender nằm trong domain đã verify.

---

## Phase 8 — Cấp TLS wildcard

### Bước 8.1 — Lưu DNS token

```bash
sudo install -d -m 700 /root/.secrets/certbot
sudo touch /root/.secrets/certbot/cloudflare.ini
sudo chmod 600 /root/.secrets/certbot/cloudflare.ini
sudoedit /root/.secrets/certbot/cloudflare.ini
```

Nội dung:

```ini
dns_cloudflare_api_token = <CLOUDFLARE_DNS_TOKEN>
```

### Bước 8.2 — Request certificate

```bash
sudo certbot certonly \
  --dns-cloudflare \
  --dns-cloudflare-credentials /root/.secrets/certbot/cloudflare.ini \
  --email <OPS_EMAIL> \
  --agree-tos \
  -d <STG_BASE_DOMAIN> \
  -d '*.<STG_BASE_DOMAIN>'
```

Ví dụ sau khi thay placeholder:

```bash
sudo certbot certonly \
  --dns-cloudflare \
  --dns-cloudflare-credentials /root/.secrets/certbot/cloudflare.ini \
  --email ops@example.com \
  --agree-tos \
  -d stg.example.com \
  -d '*.stg.example.com'
```

### Bước 8.3 — Kiểm tra certificate và renew

```bash
sudo certbot certificates
sudo certbot renew --dry-run
```

Ghi lại certificate path:

```text
/etc/letsencrypt/live/<STG_BASE_DOMAIN>/fullchain.pem
/etc/letsencrypt/live/<STG_BASE_DOMAIN>/privkey.pem
```

### Checkpoint Phase 8

- [ ] Certificate cover base và wildcard.
- [ ] Certbot credential mode `600`.
- [ ] `renew --dry-run` thành công.

---

## Phase 9 — Checkout và build source

### Bước 9.1 — Cho VM quyền read repository

Repository hiện nằm trên GitHub. Trên EC2, tạo một key chỉ dành cho việc pull source:

```bash
sudo -iu bookingos
install -d -m 700 /home/bookingos/.ssh
ssh-keygen \
  -t ed25519 \
  -a 100 \
  -f /home/bookingos/.ssh/bookingos_stg_deploy \
  -C "bookingos-staging-deploy"
cat /home/bookingos/.ssh/bookingos_stg_deploy.pub
```

Khi `ssh-keygen` hỏi passphrase, để trống vì systemd/deploy không có người nhập tương tác. Copy
**public key** là dòng bắt đầu bằng `ssh-ed25519`; không copy file không có đuôi `.pub`.

Trên GitHub:

1. mở repository `vnkduy/booking-saas`;
2. **Settings → Deploy keys → Add deploy key**;
3. Title: `bookingos-stg-ec2-singapore`;
4. paste public key;
5. **không** chọn **Allow write access**;
6. bấm **Add key**.

Trở lại EC2 trong session user `bookingos`, tạo SSH config:

```bash
nano /home/bookingos/.ssh/config
```

Nội dung:

```sshconfig
Host github.com
  HostName github.com
  User git
  IdentityFile /home/bookingos/.ssh/bookingos_stg_deploy
  IdentitiesOnly yes
```

Lưu rồi chạy:

```bash
chmod 600 /home/bookingos/.ssh/config
ssh-keyscan -t ed25519 github.com | ssh-keygen -lf -
```

Đối chiếu fingerprint với
[GitHub SSH key fingerprints](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/githubs-ssh-key-fingerprints).
Chỉ sau khi khớp mới lưu host key và kiểm tra kết nối:

```bash
ssh-keyscan -H github.com >> /home/bookingos/.ssh/known_hosts
chmod 600 /home/bookingos/.ssh/known_hosts
ssh -T git@github.com
```

GitHub thường trả thông báo xác thực thành công nhưng không cung cấp shell; điều đó là bình thường.

Không dùng personal access token có quyền write nếu deploy key read-only đã đủ.

### Bước 9.2 — Clone repository

```bash
git clone git@github.com:vnkduy/booking-saas.git /opt/bookingos-stg/repo
cd /opt/bookingos-stg/repo
git fetch --prune origin
git cat-file -e '<STAGING_RELEASE_SHA>^{commit}'
```

### Bước 9.3 — Tạo immutable release

```bash
RELEASE_SHA="<STAGING_RELEASE_SHA>"
git worktree add --detach "/opt/bookingos-stg/releases/$RELEASE_SHA" "$RELEASE_SHA"
ln -s /etc/bookingos-stg/bookingos.env "/opt/bookingos-stg/releases/$RELEASE_SHA/.env"
cd "/opt/bookingos-stg/releases/$RELEASE_SHA"
git rev-parse HEAD
```

Output phải bằng đúng `STAGING_RELEASE_SHA`.

### Bước 9.4 — Install và build

`t4g.small` chỉ có 2 GiB RAM. Không chạy Turbo mặc định song song:

```bash
pnpm install --frozen-lockfile --child-concurrency=1
NODE_OPTIONS=--max-old-space-size=1024 \
  pnpm turbo lint typecheck build --concurrency=1
NODE_OPTIONS=--max-old-space-size=1024 \
  pnpm --filter=@booking/api check:rls
```

Build sẽ chậm và có thể dùng swap nhiều. Không đóng SSH hoặc reboot giữa chừng. Nếu vẫn bị OOM:

1. xác nhận swap đã bật;
2. kiểm tra `free -h`;
3. chạy riêng từng gate, vẫn giữ concurrency bằng 1:

```bash
NODE_OPTIONS=--max-old-space-size=1024 \
  pnpm turbo lint --concurrency=1
NODE_OPTIONS=--max-old-space-size=1024 \
  pnpm turbo typecheck --concurrency=1
NODE_OPTIONS=--max-old-space-size=1024 \
  pnpm turbo build --concurrency=1
NODE_OPTIONS=--max-old-space-size=1024 \
  pnpm --filter=@booking/api check:rls
```

Không đổi CPU credits sang Unlimited chỉ để build nhanh hơn; surplus credit có thể phát sinh chi
phí. Không bỏ qua build lỗi.

Kiểm tra output:

```bash
test -f apps/api/dist/main.js
test -f apps/storefront/build/server/index.js
test -f apps/dashboard/build/server/index.js
```

Không có output nghĩa là command trả non-zero.

### Checkpoint Phase 9

- [ ] VM checkout đúng full SHA.
- [ ] `pnpm install --frozen-lockfile` thành công.
- [ ] Lint, typecheck, build và RLS check thành công.
- [ ] Cả ba build entrypoint tồn tại.

---

## Phase 10 — Migrate và seed database

### Bước 10.1 — Deploy migration

Trong release directory, user `bookingos`:

```bash
pnpm --filter=@booking/api prisma:deploy
```

Không dùng:

- `prisma migrate dev`;
- `prisma migrate reset`;
- `quick:start`.

### Bước 10.2 — Rotate hai DB role do migration tạo

Migration đầu tiên tạo `app_user` và `app_admin` bằng dev password nếu role chưa tồn tại. Rotate ngay:

```bash
exit
sudo -u postgres psql booking_stg
```

Trong `psql`:

```text
\password app_user
\password app_admin
\du app_user
\du app_admin
\q
```

Nhập đúng password đã lên kế hoạch trong env.

Xác nhận:

- `app_user` không có `Bypass RLS`;
- `app_admin` có `Bypass RLS`;
- cả hai là login role;
- password không còn là dev password.

### Bước 10.3 — Kiểm tra readiness dependency trước khi start app

```bash
sudo -iu bookingos bash -lc \
  'cd /opt/bookingos-stg/releases/<STAGING_RELEASE_SHA> && pnpm --filter=@booking/api prisma:deploy'
```

Lần chạy thứ hai phải báo không còn migration pending.

### Bước 10.4 — Seed platform

```bash
sudo -iu bookingos bash -lc \
  'cd /opt/bookingos-stg/releases/<STAGING_RELEASE_SHA> && pnpm --filter=@booking/api seed'
```

Với `SEED_DEMO=false`, seed tạo:

- administrative divisions;
- permission catalog;
- system roles;
- platform admin.

Không có tenant demo lớn. Tenant đầu tiên sẽ được tạo qua Dashboard sau khi app chạy.

### Checkpoint Phase 10

- [ ] Mọi migration đã applied.
- [ ] `app_user` không BYPASSRLS.
- [ ] `app_admin` có BYPASSRLS.
- [ ] Dev role passwords đã rotate.
- [ ] Seed thành công.
- [ ] Seed admin credential nằm trong password manager.

---

## Phase 11 — Tạo systemd services

### Bước 11.1 — Tạo API unit

```bash
sudoedit /etc/systemd/system/bookingos-api.service
```

```ini
[Unit]
Description=bookingos staging API
After=network-online.target postgresql.service redis-server.service
Wants=network-online.target

[Service]
Type=simple
User=bookingos
Group=bookingos
WorkingDirectory=/opt/bookingos-stg/current
EnvironmentFile=/etc/bookingos-stg/bookingos.env
Environment=PORT=3100
Environment=NODE_OPTIONS=--max-old-space-size=512
Environment=PATH=/home/bookingos/.nvm/versions/node/v22.22.0/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin
ExecStart=<NODE_BIN> apps/api/dist/main.js
Restart=always
RestartSec=5
TimeoutStopSec=30
KillSignal=SIGTERM
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
```

Thay `<NODE_BIN>` bằng absolute path ở Phase 2.

### Bước 11.2 — Tạo Storefront unit

```bash
sudoedit /etc/systemd/system/bookingos-storefront.service
```

```ini
[Unit]
Description=bookingos staging Storefront SSR
After=network-online.target bookingos-api.service redis-server.service
Wants=network-online.target

[Service]
Type=simple
User=bookingos
Group=bookingos
WorkingDirectory=/opt/bookingos-stg/current
EnvironmentFile=/etc/bookingos-stg/bookingos.env
Environment=HOST=127.0.0.1
Environment=PORT=3101
Environment=NODE_OPTIONS=--max-old-space-size=384
Environment=PATH=/home/bookingos/.nvm/versions/node/v22.22.0/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin
ExecStart=<PNPM_BIN> --filter @booking/storefront start
Restart=always
RestartSec=5
TimeoutStopSec=30
KillSignal=SIGTERM
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
```

### Bước 11.3 — Tạo Dashboard unit

```bash
sudoedit /etc/systemd/system/bookingos-dashboard.service
```

```ini
[Unit]
Description=bookingos staging Dashboard SSR
After=network-online.target bookingos-api.service redis-server.service
Wants=network-online.target

[Service]
Type=simple
User=bookingos
Group=bookingos
WorkingDirectory=/opt/bookingos-stg/current
EnvironmentFile=/etc/bookingos-stg/bookingos.env
Environment=HOST=127.0.0.1
Environment=PORT=3102
Environment=NODE_OPTIONS=--max-old-space-size=384
Environment=PATH=/home/bookingos/.nvm/versions/node/v22.22.0/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin
ExecStart=<PNPM_BIN> --filter @booking/dashboard start
Restart=always
RestartSec=5
TimeoutStopSec=30
KillSignal=SIGTERM
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
```

Ba giá trị `NODE_OPTIONS` giới hạn V8 heap để một process không chiếm hết RAM của `t4g.small`. Nếu
journal báo `JavaScript heap out of memory` trong lúc app chạy bình thường, xem đó là tín hiệu
workload đã vượt sizing staging này; không tăng đồng loạt các giới hạn khi chưa kiểm tra `free -h`.

### Bước 11.4 — Kích hoạt release

```bash
sudo ln -sfn \
  "/opt/bookingos-stg/releases/<STAGING_RELEASE_SHA>" \
  /opt/bookingos-stg/current
readlink -f /opt/bookingos-stg/current
```

Output phải là release directory đúng SHA.

### Bước 11.5 — Start service

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now \
  bookingos-api bookingos-storefront bookingos-dashboard
sudo systemctl status \
  bookingos-api bookingos-storefront bookingos-dashboard --no-pager
```

Nếu service fail:

```bash
journalctl -u bookingos-api -n 100 --no-pager
journalctl -u bookingos-storefront -n 100 --no-pager
journalctl -u bookingos-dashboard -n 100 --no-pager
```

### Bước 11.6 — Kiểm tra port nội bộ

```bash
sudo ss -lntp | grep -E ':3100|:3101|:3102'
```

Không thêm firewall rule public cho ba port này.

### Checkpoint Phase 11

- [ ] `current` trỏ đúng release SHA.
- [ ] Cả ba systemd units active.
- [ ] API ở 3100, Storefront ở 3101, Dashboard ở 3102.
- [ ] Không có restart loop trong journal.

---

## Phase 12 — Cấu hình NGINX

### Bước 12.1 — Tạo site config

```bash
sudoedit /etc/nginx/sites-available/bookingos-stg
```

Paste toàn bộ cấu hình sau, rồi thay mọi hostname trong dấu `<...>`:

```nginx
upstream bookingos_api {
  server 127.0.0.1:3100;
  keepalive 16;
}

upstream bookingos_storefront {
  server 127.0.0.1:3101;
  keepalive 16;
}

upstream bookingos_dashboard {
  server 127.0.0.1:3102;
  keepalive 16;
}

server {
  listen 80;
  listen [::]:80;
  server_name <STG_BASE_DOMAIN> *.<STG_BASE_DOMAIN>;
  return 301 https://$host$request_uri;
}

server {
  listen 443 ssl http2;
  listen [::]:443 ssl http2;
  server_name <API_HOST>;

  ssl_certificate /etc/letsencrypt/live/<STG_BASE_DOMAIN>/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/<STG_BASE_DOMAIN>/privkey.pem;

  location = /health {
    proxy_pass http://bookingos_api;
    include proxy_params;
  }

  location = /health/ready {
    proxy_pass http://bookingos_api;
    include proxy_params;
  }

  location ^~ /webhooks/ {
    proxy_pass http://bookingos_api;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto https;
    proxy_set_header X-Forwarded-Host $host;
    client_max_body_size 2m;
  }

  location / {
    return 404;
  }
}

server {
  listen 443 ssl http2;
  listen [::]:443 ssl http2;
  server_name <DASHBOARD_HOST>;

  ssl_certificate /etc/letsencrypt/live/<STG_BASE_DOMAIN>/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/<STG_BASE_DOMAIN>/privkey.pem;

  location / {
    proxy_pass http://bookingos_dashboard;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto https;
    proxy_set_header X-Forwarded-Host $host;
  }
}

server {
  listen 443 ssl http2;
  listen [::]:443 ssl http2;
  server_name *.<STG_BASE_DOMAIN>;

  ssl_certificate /etc/letsencrypt/live/<STG_BASE_DOMAIN>/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/<STG_BASE_DOMAIN>/privkey.pem;

  location / {
    proxy_pass http://bookingos_storefront;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto https;
    proxy_set_header X-Forwarded-Host $host;
  }
}
```

Ví dụ, nếu base domain là `stg.example.com`, phải thay:

- `<STG_BASE_DOMAIN>` → `stg.example.com`;
- `<API_HOST>` → `api.stg.example.com`;
- `<DASHBOARD_HOST>` → `admin.stg.example.com`.

Không để dấu `<` hoặc `>` trong file thật. Exact host API/Dashboard được NGINX ưu tiên hơn wildcard.
Public API hostname chỉ cho phép `/health`, `/health/ready` và `/webhooks/:gateway`; browser và hai
SSR app gọi API nội bộ qua `http://bookingos-api:3100`.

### Bước 12.2 — Enable site

```bash
sudo ln -s /etc/nginx/sites-available/bookingos-stg /etc/nginx/sites-enabled/bookingos-stg
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
```

### Bước 12.3 — Kiểm tra redirect và TLS

```bash
curl --head http://<DEMO_HOST>
curl --head https://<DEMO_HOST>
curl --head https://<DASHBOARD_HOST>/healthz
curl --head https://<API_HOST>/health
```

HTTP phải redirect sang HTTPS. HTTPS không được có certificate warning.

### Checkpoint Phase 12

- [ ] `nginx -t` thành công.
- [ ] HTTP redirect sang HTTPS.
- [ ] Certificate hợp lệ trên Demo, Dashboard và API.
- [ ] API path ngoài allowlist trả 404 từ NGINX.

---

## Phase 13 — Health check trước khi tạo tenant

### Bước 13.1 — Internal health

```bash
curl --fail --silent http://bookingos-api:3100/health
curl --fail --silent http://bookingos-api:3100/health/ready
curl --fail --silent -H 'Host: <DEMO_HOST>' http://127.0.0.1:3101/readyz
curl --fail --silent http://127.0.0.1:3102/healthz
```

### Bước 13.2 — Public health

```bash
curl --fail --silent https://<API_HOST>/health/ready
curl --fail --silent https://<DEMO_HOST>/readyz
curl --fail --silent https://<DASHBOARD_HOST>/healthz
```

Kỳ vọng:

- API readiness: DB `up`, Redis `up`;
- Storefront readiness: backend `up`, Redis `up`;
- Dashboard liveness: `status=ok`.

### Checkpoint Phase 13

- [ ] Bốn internal health checks thành công.
- [ ] Ba public health checks thành công.
- [ ] Không có DB/Redis dependency down.

---

## Phase 14 — Tạo tenant đầu tiên

### Bước 14.1 — Login platform admin

Mở:

```text
https://<DASHBOARD_HOST>
```

Đăng nhập bằng:

- email `SEED_ADMIN_EMAIL`;
- password `SEED_ADMIN_PASSWORD`.

### Bước 14.2 — Tạo tenant

Trong Platform Admin:

1. tạo tenant mới;
2. slug phải khớp phần đầu của `<DEMO_HOST>`;
3. ví dụ hostname là `demo.stg.example.com` thì slug là `demo`;
4. timezone `Asia/Ho_Chi_Minh`;
5. locale `vi`;
6. status active.

Code tự tạo và verify primary domain:

```text
<slug>.<PLATFORM_BASE_DOMAIN>
```

### Bước 14.3 — Kiểm tra tenant resolution

```bash
curl --fail --silent --head https://<DEMO_HOST>/
```

Mở Storefront trong browser và xác nhận không còn lỗi “tenant not found”.

### Bước 14.4 — Tạo dữ liệu staging tối thiểu

Qua Dashboard:

1. gán subscription plan cho tenant;
2. tạo hoặc mời tenant owner;
3. tạo listing type;
4. tạo partner;
5. tạo một listing/resource;
6. publish listing;
7. cấu hình availability;
8. chưa cấu hình payment gateway thật.

Nếu cần demo dataset lớn, đọc mục seed demo trong
[`staging-deployment-low-cost.md`](./staging-deployment-low-cost.md#122-seed). Demo seed hiện hard-code
domain production/local, nên không bật thiếu kiểm soát.

### Checkpoint Phase 14

- [ ] Platform admin login được.
- [ ] Tenant primary domain đúng staging base.
- [ ] Storefront resolve đúng tenant.
- [ ] Có ít nhất một listing published để smoke.

---

## Phase 15 — Functional smoke check

Thực hiện bằng browser:

### Auth và permission

- [ ] Platform admin vào `/admin`.
- [ ] Tenant owner chỉ thấy tenant scope.
- [ ] Partner chỉ thấy partner scope.
- [ ] Customer không truy cập dashboard protected area.
- [ ] Logout xoá session.

### Storefront

- [ ] Homepage render đúng tenant.
- [ ] Catalog load.
- [ ] Listing detail load.
- [ ] Availability load.
- [ ] Theme/logo lấy từ R2.

### Upload

- [ ] Dashboard upload ảnh thành công.
- [ ] Browser PUT trực tiếp tới presigned R2 URL thành công.
- [ ] Public media URL load được.
- [ ] Không có CORS error trong browser console.

### Email

- [ ] Yêu cầu OTP/password reset.
- [ ] Email đến inbox thật.
- [ ] Không chỉ xuất hiện dòng `[log-only email]` trong API journal.

### Booking

- [ ] Tạo booking không thanh toán hoặc theo flow staging đang hỗ trợ.
- [ ] Không có double-booking.
- [ ] Booking xuất hiện đúng tenant/partner/customer views.

### Payment sandbox

Chỉ thực hiện sau khi:

1. tenant đã cấu hình gateway sandbox trong Dashboard;
2. `PAYMENT_REDIRECT_ORIGINS` được thay bằng exact origin thật;
3. API service và Storefront đã restart;
4. callback URL dùng `https://<API_HOST>/webhooks/<gateway>`.

Không bật mock payment khi `NODE_ENV=production`.

### Checkpoint Phase 15

- [ ] Auth/scope đúng.
- [ ] Storefront/catalog/listing hoạt động.
- [ ] Upload R2 hoạt động.
- [ ] Email thật hoạt động.
- [ ] Booking cơ bản hoạt động.
- [ ] Payment chỉ dùng sandbox.

---

## Phase 16 — Backup database lên S3 bằng IAM Role

Mục tiêu của phase này:

- backup nằm ngoài EC2 để vẫn còn khi máy bị xoá;
- dump được mã hoá **trước** khi rời EC2;
- EC2 không giữ AWS access key dài hạn;
- IAM Role của EC2 không có quyền xoá backup;
- S3 tự xoá backup quá 14 ngày bằng lifecycle.

### Bước 16.1 — Tạo private S3 bucket

Trong AWS Console:

1. kiểm tra region là Singapore;
2. tìm **S3**;
3. bấm **Create bucket**;
4. Bucket type chọn **General purpose**;
5. đặt tên duy nhất toàn cầu, ví dụ
   `bookingos-stg-backups-<AWS_ACCOUNT_ID>`;
6. AWS Region chọn **Asia Pacific (Singapore) `ap-southeast-1`**;
7. Object Ownership giữ **ACLs disabled**;
8. giữ toàn bộ **Block Public Access** được bật;
9. Bucket Versioning chọn **Disable** để tránh tăng dung lượng ngoài ý muốn;
10. Default encryption chọn **SSE-S3**;
11. bấm **Create bucket**.

Ghi lại tên chính xác:

```text
BACKUP_BUCKET=<TEN_BUCKET_DUY_NHAT>
```

Không bật static website hosting, không tạo public bucket policy và không dùng bucket media R2 cho
database backup.

### Bước 16.2 — Tạo lifecycle 14 ngày

Mở bucket vừa tạo:

1. tab **Management**;
2. **Lifecycle rules → Create lifecycle rule**;
3. Name: `delete-staging-backups-after-14-days`;
4. Rule scope chọn **Limit the scope using one or more filters**;
5. Prefix nhập `postgres/`;
6. chọn **Expire current versions of objects**;
7. Days after object creation nhập `14`;
8. xác nhận acknowledgement rồi tạo rule.

S3 lifecycle sẽ dọn backup cũ dù IAM Role của EC2 không có `DeleteObject`.

### Bước 16.3 — Tạo IAM Role cho EC2

Mở **IAM → Roles → Create role**:

1. Trusted entity type: **AWS service**;
2. Use case: **EC2**;
3. không chọn policy quyền rộng như `AmazonS3FullAccess`;
4. Role name: `bookingosStagingEc2Role`;
5. bấm **Create role**.

Mở role vừa tạo:

1. tab **Permissions**;
2. **Add permissions → Create inline policy**;
3. chọn tab **JSON**;
4. thay nội dung bằng policy dưới đây;
5. thay `<BACKUP_BUCKET>` bằng tên bucket thật ở Bước 16.1;
6. bấm **Next**;
7. Policy name: `bookingosStagingBackupBucket`;
8. bấm **Create policy**.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "ReadBucketRegion",
      "Effect": "Allow",
      "Action": "s3:GetBucketLocation",
      "Resource": "arn:aws:s3:::<BACKUP_BUCKET>"
    },
    {
      "Sid": "ListOnlyPostgresPrefix",
      "Effect": "Allow",
      "Action": "s3:ListBucket",
      "Resource": "arn:aws:s3:::<BACKUP_BUCKET>",
      "Condition": {
        "StringLike": {
          "s3:prefix": [
            "postgres",
            "postgres/*"
          ]
        }
      }
    },
    {
      "Sid": "ReadWriteEncryptedBackups",
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:PutObject"
      ],
      "Resource": "arn:aws:s3:::<BACKUP_BUCKET>/postgres/*"
    }
  ]
}
```

Policy cố ý không có `s3:DeleteObject`, `s3:PutBucketPolicy` hoặc quyền với bucket khác.

### Bước 16.4 — Gắn IAM Role vào EC2

Trong **EC2 → Instances**:

1. chọn `bookingos-stg-01`;
2. **Actions → Security → Modify IAM role**;
3. chọn `bookingosStagingEc2Role`;
4. bấm **Update IAM role**.

Không cần restart EC2.

### Bước 16.5 — Cài AWS CLI v2 cho ARM64

Trên EC2:

```bash
cd /tmp
curl -fsSL https://awscli.amazonaws.com/awscli-exe-linux-aarch64.zip \
  -o awscliv2.zip
unzip -q awscliv2.zip
sudo ./aws/install
aws --version
aws sts get-caller-identity
```

`get-caller-identity` phải trả về ARN chứa `bookingosStagingEc2Role`. Không chạy `aws configure` và
không tạo access key; AWS CLI tự lấy temporary credentials từ IAM Role qua IMDSv2.

Kiểm tra bucket:

```bash
aws s3 ls s3://<BACKUP_BUCKET>/postgres/ --region ap-southeast-1
```

Kết quả trống vẫn là thành công. `AccessDenied` nghĩa là tên bucket trong IAM policy sai hoặc role
chưa attach đúng.

### Bước 16.6 — Tạo backup database role

Trên EC2:

```bash
sudo -u postgres psql booking_stg
```

Trong prompt `psql`:

```sql
CREATE ROLE bookingos_backup LOGIN BYPASSRLS;
GRANT pg_read_all_data TO bookingos_backup;
\password bookingos_backup
\q
```

Khi `\password` hỏi, dùng password dài ngẫu nhiên và lưu vào password manager. Role này chỉ dùng cho
backup, không dùng bởi app.

### Bước 16.7 — Tạo age key trên máy local

Nếu máy local chưa có `age`:

```bash
brew install age
```

Tạo key:

```bash
age-keygen -o bookingos-stg-backup.agekey
chmod 600 bookingos-stg-backup.agekey
```

Output có public recipient bắt đầu bằng `age1...`. Ghi giá trị đó vào worksheet:

```text
AGE_PUBLIC_RECIPIENT=age1...
```

Lưu file private `bookingos-stg-backup.agekey` vào password manager hoặc encrypted offline storage.
Không copy private key lên EC2; EC2 chỉ cần public recipient để mã hoá.

### Bước 16.8 — Tạo `.pgpass`

Trên EC2:

```bash
sudo touch /root/.pgpass
sudo chmod 600 /root/.pgpass
sudoedit /root/.pgpass
```

Nội dung:

```text
bookingos-db:5432:booking_stg:bookingos_backup:<BACKUP_ROLE_PASSWORD>
```

Lưu file rồi kiểm tra quyền:

```bash
sudo stat -c '%a %U:%G %n' /root/.pgpass
```

Kỳ vọng: `600 root:root /root/.pgpass`.

### Bước 16.9 — Tạo backup script

Trên EC2:

```bash
sudoedit /usr/local/sbin/bookingos-stg-backup
```

Nội dung:

```bash
#!/usr/bin/env bash
set -Eeuo pipefail

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
release_sha="$(basename "$(readlink -f /opt/bookingos-stg/current)")"
object="s3://<BACKUP_BUCKET>/postgres/${timestamp}-${release_sha}.dump.age"

pg_dump \
  --format=custom \
  --dbname='postgresql://bookingos_backup@bookingos-db:5432/booking_stg' \
  | age --recipient '<AGE_PUBLIC_RECIPIENT>' \
  | aws s3 cp - "${object}" \
      --region ap-southeast-1 \
      --only-show-errors
```

Thay cả `<BACKUP_BUCKET>` và `<AGE_PUBLIC_RECIPIENT>`, rồi:

```bash
sudo chmod 700 /usr/local/sbin/bookingos-stg-backup
sudo /usr/local/sbin/bookingos-stg-backup
sudo aws s3 ls s3://<BACKUP_BUCKET>/postgres/ --region ap-southeast-1
```

Phải thấy object mới có đuôi `.dump.age`. Nếu pipeline lỗi ở bất kỳ bước nào, `set -o pipefail` làm
toàn bộ job thất bại thay vì upload một file hỏng mà vẫn báo thành công.

### Bước 16.10 — Tạo systemd timer

Tạo service:

```bash
sudoedit /etc/systemd/system/bookingos-stg-backup.service
```

```ini
[Unit]
Description=Backup bookingos staging PostgreSQL to encrypted S3 object

[Service]
Type=oneshot
ExecStart=/usr/local/sbin/bookingos-stg-backup
```

Tạo timer:

```bash
sudoedit /etc/systemd/system/bookingos-stg-backup.timer
```

```ini
[Unit]
Description=Daily bookingos staging backup

[Timer]
OnCalendar=*-*-* 18:30:00 UTC
Persistent=true
RandomizedDelaySec=300

[Install]
WantedBy=timers.target
```

Kích hoạt:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now bookingos-stg-backup.timer
sudo systemctl list-timers bookingos-stg-backup.timer
```

`Persistent=true` nghĩa là nếu EC2 đang dừng lúc 18:30 UTC, timer sẽ chạy bù sau khi máy được start
lại.

### Bước 16.11 — Restore drill

Backup chưa restore thử không được coi là backup hợp lệ. Chọn một object từ kết quả `aws s3 ls`.

Trên EC2, tải object mã hoá về thư mục tạm và đổi owner để SCP được:

```bash
sudo aws s3 cp \
  s3://<BACKUP_BUCKET>/postgres/<BACKUP_OBJECT>.dump.age \
  /tmp/bookingos-restore.dump.age \
  --region ap-southeast-1
sudo chown ubuntu:ubuntu /tmp/bookingos-restore.dump.age
```

Trên máy local, tải file mã hoá và giải mã:

```bash
scp -i ~/.ssh/bookingos-stg-singapore.pem \
  ubuntu@<STAGING_VM_IP>:/tmp/bookingos-restore.dump.age .
age --decrypt \
  --identity bookingos-stg-backup.agekey \
  --output bookingos-restore.dump \
  bookingos-restore.dump.age
```

Copy dump đã giải mã trở lại EC2; private age key vẫn ở local:

```bash
scp -i ~/.ssh/bookingos-stg-singapore.pem \
  bookingos-restore.dump \
  ubuntu@<STAGING_VM_IP>:/tmp/
```

Trên EC2, restore vào database tạm, tuyệt đối không dùng `booking_stg`:

```bash
sudo -u postgres createdb bookingos_restore_check
sudo -u postgres pg_restore \
  --exit-on-error \
  --dbname=bookingos_restore_check \
  /tmp/bookingos-restore.dump
sudo -u postgres psql \
  --dbname=bookingos_restore_check \
  --command="SELECT count(*) AS tables FROM pg_tables WHERE schemaname = 'public';"
sudo -u postgres dropdb bookingos_restore_check
sudo rm -f /tmp/bookingos-restore.dump /tmp/bookingos-restore.dump.age
```

Xoá hai file local sau khi kiểm tra xong; giữ private age key:

```bash
rm -f bookingos-restore.dump bookingos-restore.dump.age
```

### Checkpoint Phase 16

- [ ] S3 bucket ở Singapore và Block Public Access bật toàn bộ.
- [ ] Lifecycle xoá `postgres/` sau 14 ngày.
- [ ] EC2 dùng IAM Role, không dùng AWS access key.
- [ ] IAM policy không có `DeleteObject` hoặc quyền bucket rộng.
- [ ] Dump được mã hoá trước khi upload.
- [ ] Timer active.
- [ ] Đã nhìn thấy object `.dump.age`.
- [ ] Đã restore thử thành công vào database tạm.

---

## Phase 17 — Monitoring, log retention và chi phí

### Bước 17.1 — Tạo uptime monitors

Trong UptimeRobot tạo:

| Name | URL |
| --- | --- |
| bookingos STG API ready | `https://<API_HOST>/health/ready` |
| bookingos STG Storefront ready | `https://<DEMO_HOST>/readyz` |
| bookingos STG Dashboard live | `https://<DASHBOARD_HOST>/healthz` |

Gắn email alert và gửi một alert thử.

### Bước 17.2 — Giới hạn journal

```bash
sudoedit /etc/systemd/journald.conf
```

```ini
SystemMaxUse=1G
MaxRetentionSec=14day
```

```bash
sudo systemctl restart systemd-journald
```

### Bước 17.3 — Kiểm tra log

```bash
journalctl -u bookingos-api -n 100 --no-pager
journalctl -u bookingos-storefront -n 100 --no-pager
journalctl -u bookingos-dashboard -n 100 --no-pager
journalctl -u bookingos-stg-backup.service -n 100 --no-pager
```

### Bước 17.4 — Kiểm tra tài nguyên

```bash
df -h
free -h
sudo systemctl --failed
sudo certbot renew --dry-run
```

Trong AWS Console → EC2 → `bookingos-stg-01` → **Monitoring**, xem `CPUCreditBalance`. Nếu balance
về 0, `t4g.small` ở Standard sẽ throttle CPU; app không bị tính surplus credit nhưng build và request
có thể chậm. Chờ credit hồi hoặc chỉ build khi staging ít người dùng.

### Bước 17.5 — Kiểm tra chi phí AWS mỗi tuần

Trong AWS Console:

1. mở **Billing and Cost Management → Bills**;
2. kiểm tra các service EC2, VPC, EBS và S3;
3. mở **Credits** để xem số credit còn lại và ngày hết hạn;
4. mở **Cost Explorer**, chọn phạm vi tháng hiện tại;
5. Group by **Service** để tìm chi phí bất thường;
6. xác nhận budget email vẫn hoạt động.

Nếu xuất hiện NAT Gateway, Load Balancer, RDS hoặc tài nguyên ở region khác mà bạn không chủ động
tạo, dừng lại và kiểm tra trước khi tiếp tục.

### Bước 17.6 — Stop/start EC2 để tiết kiệm credit

Chỉ stop khi team không dùng staging. Trước khi stop:

1. chạy backup thủ công;
2. kiểm tra object đã lên S3;
3. tạm pause uptime monitors để tránh alert giả.

Trên EC2:

```bash
sudo /usr/local/sbin/bookingos-stg-backup
sudo aws s3 ls s3://<BACKUP_BUCKET>/postgres/ --region ap-southeast-1
sudo shutdown -h now
```

`Shutdown behavior=Stop` đã cấu hình ở Phase 1 nên lệnh này dừng instance, không terminate. Có thể
dừng bằng **EC2 → Instances → Instance state → Stop instance**.

Khi cần dùng lại:

1. EC2 → Instances;
2. chọn `bookingos-stg-01`;
3. **Instance state → Start instance**;
4. chờ `2/2 checks passed`;
5. Elastic IP vẫn giữ nguyên;
6. mở lại uptime monitors;
7. kiểm tra:

```bash
curl -fsS https://<API_HOST>/health/ready
curl -fsS https://<DEMO_HOST>/readyz
```

Khi EC2 dừng, tiền compute ngừng tính nhưng EBS 40 GiB, Elastic IP và S3 vẫn tính. Không chọn
**Terminate instance** để tiết kiệm tạm thời; terminate là xoá máy.

### Checkpoint Phase 17

- [ ] Ba uptime monitors đều green.
- [ ] Alert thử đã tới email.
- [ ] Journal retention được giới hạn.
- [ ] Không có failed systemd unit.
- [ ] Disk dưới 80%.
- [ ] Đã kiểm tra Bills, Credits và Cost Explorer.
- [ ] Biết phân biệt Stop với Terminate.
- [ ] Đã thử stop/start và ba app tự chạy lại bằng systemd.

---

## Phase 18 — Bàn giao staging

Ghi lại trong password manager/runbook nội bộ:

- AWS account ID, region và EC2 instance ID;
- Elastic IP và Security Group;
- EBS volume ID;
- DNS zone;
- các hostname;
- release SHA đang chạy;
- SSH key owner;
- vị trí secret;
- R2 bucket names;
- Resend domain/key owner;
- S3 backup bucket, IAM Role, timer và retention;
- uptime monitor owner;
- ngày restore drill gần nhất.

Không ghi raw password/API secret vào ticket hoặc tài liệu Git.

### Final acceptance checklist

- [ ] EC2 là `t4g.small`, CPU credits Standard và swap 6 GiB active.
- [ ] Local gate thành công trên đúng commit SHA.
- [ ] VM chỉ public 22/80/443.
- [ ] DNS và wildcard TLS hoạt động.
- [ ] PostgreSQL/Redis chỉ listen loopback.
- [ ] DB app roles đã rotate và đúng BYPASSRLS.
- [ ] Cả ba app chạy bằng systemd.
- [ ] API và Storefront readiness đều green.
- [ ] Tenant staging resolve đúng Host.
- [ ] R2 upload + public media hoạt động.
- [ ] Resend gửi email thật.
- [ ] Mock payment tắt; gateway chỉ sandbox.
- [ ] Backup mã hoá, timer và restore drill hoạt động.
- [ ] S3 private; IAM Role không có quyền xoá backup.
- [ ] AWS budget/credit alert hoạt động.
- [ ] Monitoring gửi alert được.
- [ ] Không có production data/credential.

---

## Deploy release tiếp theo

Sau lần đầu, dùng quy trình ngắn:

1. chốt full commit SHA;
2. chạy local lint/typecheck/build/RLS check;
3. `git fetch` trên VM;
4. tạo worktree release mới;
5. symlink `.env`;
6. tạo DB backup;
7. dừng ba app service để giải phóng RAM, chấp nhận downtime staging;
8. install và build tuần tự bằng đúng lệnh giới hạn memory/concurrency ở Phase 9;
9. nếu build lỗi, start lại ba service đang trỏ release cũ rồi sửa lỗi;
10. đọc migration SQL mới;
11. chạy `prisma:deploy`;
12. đổi symlink `current`;
13. start ba services;
14. chạy internal/public health;
15. chạy functional smoke;
16. giữ ít nhất release cũ gần nhất.

Lệnh dừng/start ba app:

```bash
sudo systemctl stop \
  bookingos-api bookingos-storefront bookingos-dashboard

# install/build/migrate/switch release ở giữa

sudo systemctl start \
  bookingos-api bookingos-storefront bookingos-dashboard
```

Lệnh chi tiết và rollback ở
[`staging-deployment-low-cost.md §15–16`](./staging-deployment-low-cost.md#15-quy-trình-deploy-release-tiếp-theo).

## Xử lý lỗi nhanh

| Triệu chứng | Kiểm tra đầu tiên |
| --- | --- |
| Không thấy EC2 | góc phải Console có đúng Singapore không |
| SSH timeout | EC2 running, `2/2`, Elastic IP và Security Group SSH `My IP` |
| SSH `Permission denied` | user là `ubuntu`, đúng file `.pem`, file mode `400` |
| Build rất chậm | swap active và T4g còn CPU credit; Standard có thể throttle |
| API không start | `journalctl -u bookingos-api -n 100` |
| API ready 503 | PostgreSQL, Redis và `ADMIN_DATABASE_URL` |
| NGINX 502 | ba systemd service và port 3100/3101/3102 |
| Storefront không start | env production bắt buộc, secret length, origins |
| Storefront tenant not found | tenant domain, slug, DNS và `Host` |
| Dashboard login loop | Redis, session secret và secure cookie |
| Upload 403 | R2 token, presigned origin, `Content-Type` |
| Upload CORS error | R2 AllowedOrigins và AllowedHeaders |
| Email không đến | Resend domain, quota, `SMTP_HOST`, API journal |
| Payment redirect bị chặn | exact `PAYMENT_REDIRECT_ORIGINS` |
| Webhook không tới | NGINX `/webhooks/`, DNS, gateway callback URL |
| Migration permission lỗi | dùng `MIGRATE_DATABASE_URL`, không dùng app role |
| Tenant query RLS lỗi | `app_user`, `forTenant`, role flags |
| Certificate lỗi | DNS-only record, certificate SAN, renew log |
| S3 `AccessDenied` | IAM Role attach, bucket name/prefix trong inline policy |
| Disk đầy | journal, releases cũ, PostgreSQL, backup local |
