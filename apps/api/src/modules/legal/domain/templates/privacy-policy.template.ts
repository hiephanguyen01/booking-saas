/**
 * Starting draft for `privacy_policy`. `{{tenantName}}` is substituted by
 * `seedDrafts`.
 */
export const privacyPolicyTemplate = {
  vi: {
    title: 'Chính sách bảo mật',
    bodyMd: `## 1. Phạm vi áp dụng

Chính sách này mô tả cách **{{tenantName}}** thu thập, sử dụng, lưu trữ và bảo vệ thông tin cá nhân
của khách hàng, đối tác và cộng tác viên khi sử dụng nền tảng đặt chỗ của {{tenantName}}. Bằng việc
sử dụng nền tảng, bạn đồng ý với cách thức xử lý dữ liệu được mô tả dưới đây.

## 2. Định nghĩa

- **Dữ liệu cá nhân**: mọi thông tin gắn với một cá nhân được xác định hoặc có thể xác định được, ví
  dụ họ tên, số điện thoại, email, địa chỉ, thông tin thanh toán.
- **Xử lý dữ liệu**: bất kỳ hoạt động nào tác động lên dữ liệu cá nhân — thu thập, ghi, lưu trữ, sử
  dụng, chia sẻ, xoá.
- **Bên thứ ba**: tổ chức, cá nhân không phải {{tenantName}} nhưng tham gia cung cấp dịch vụ liên
  quan (cổng thanh toán, dịch vụ email, hạ tầng lưu trữ…).

## 3. Dữ liệu chúng tôi thu thập

- **Thông tin tài khoản**: họ tên, số điện thoại, email, mật khẩu (được mã hoá), ngôn ngữ hiển thị.
- **Thông tin đặt chỗ**: dịch vụ đã đặt, thời gian, giá trị giao dịch, lịch sử huỷ/đổi lịch.
- **Thông tin thanh toán**: phương thức thanh toán, trạng thái giao dịch. {{tenantName}} **không**
  lưu trữ số thẻ ngân hàng đầy đủ — dữ liệu thẻ được xử lý trực tiếp bởi cổng thanh toán đối tác.
- **Dữ liệu kỹ thuật**: địa chỉ IP, loại thiết bị, trình duyệt, thời điểm truy cập, phục vụ mục đích
  bảo mật và cải thiện trải nghiệm.
- **Dữ liệu đối tác/cộng tác viên**: thông tin định danh, giấy tờ xác minh (nếu áp dụng), thông tin
  tài khoản nhận thanh toán.

## 4. Mục đích sử dụng dữ liệu

Chúng tôi sử dụng dữ liệu cá nhân để:

1. Xử lý và xác nhận lượt đặt chỗ, thanh toán, hoàn tiền.
2. Liên hệ hỗ trợ khách hàng, thông báo thay đổi lịch, chính sách hoặc sự cố liên quan đến lượt đặt
   chỗ.
3. Xác minh danh tính đối tác/cộng tác viên theo quy định pháp luật hoặc chính sách nội bộ.
4. Phòng chống gian lận, bảo vệ an toàn hệ thống và người dùng.
5. Cải thiện chất lượng dịch vụ, phân tích xu hướng sử dụng ở mức tổng hợp, không định danh cá nhân.
6. Gửi thông tin khuyến mãi, ưu đãi — chỉ khi bạn đã đồng ý nhận thông tin này và bạn có thể từ chối
   bất cứ lúc nào.

## 5. Chia sẻ dữ liệu với bên thứ ba

{{tenantName}} chỉ chia sẻ dữ liệu cá nhân trong các trường hợp:

- Với **đối tác** cung cấp dịch vụ mà bạn đặt chỗ, ở mức thông tin cần thiết để thực hiện lượt đặt
  chỗ đó (họ tên, số điện thoại, chi tiết đặt chỗ).
- Với **đơn vị trung gian thanh toán** để xử lý giao dịch.
- Với **nhà cung cấp hạ tầng kỹ thuật** (lưu trữ, email, SMS) hoạt động thay mặt {{tenantName}} và
  cam kết bảo mật dữ liệu tương đương.
- Khi có **yêu cầu hợp pháp** từ cơ quan nhà nước có thẩm quyền.

{{tenantName}} không bán dữ liệu cá nhân cho bên thứ ba vì mục đích thương mại của bên đó.

## 6. Lưu trữ và bảo mật dữ liệu

- Dữ liệu được lưu trữ trên hạ tầng có áp dụng các biện pháp bảo mật kỹ thuật và tổ chức phù hợp
  (mã hoá khi truyền tải, kiểm soát truy cập theo vai trò, sao lưu định kỳ).
- Dữ liệu được lưu trữ trong thời gian cần thiết để phục vụ mục đích thu thập và tuân thủ nghĩa vụ
  pháp lý (ví dụ: chứng từ kế toán, hồ sơ giao dịch), sau đó sẽ được xoá hoặc ẩn danh hoá.
- Trong trường hợp xảy ra sự cố ảnh hưởng đến dữ liệu cá nhân, {{tenantName}} sẽ thông báo cho người
  dùng bị ảnh hưởng và cơ quan có thẩm quyền theo quy định pháp luật hiện hành.

## 7. Quyền của người dùng

Bạn có quyền:

1. Yêu cầu truy cập, sao chép dữ liệu cá nhân mà {{tenantName}} đang lưu trữ về bạn.
2. Yêu cầu chỉnh sửa thông tin không chính xác.
3. Yêu cầu xoá dữ liệu, trừ trường hợp {{tenantName}} có nghĩa vụ pháp lý phải tiếp tục lưu trữ.
4. Rút lại sự đồng ý nhận thông tin khuyến mãi bất cứ lúc nào.
5. Khiếu nại về cách xử lý dữ liệu cá nhân theo thông tin liên hệ tại Mục 9.

## 8. Hành vi bị cấm

Người dùng không được cố gắng truy cập trái phép vào dữ liệu của người dùng khác, khai thác lỗ hổng
bảo mật, hoặc sử dụng dữ liệu thu thập được từ nền tảng cho mục đích ngoài phạm vi được {{tenantName}}
cho phép.

## 9. Giới hạn trách nhiệm

{{tenantName}} áp dụng các biện pháp bảo mật hợp lý theo tiêu chuẩn ngành nhưng không thể đảm bảo an
toàn tuyệt đối trước mọi hình thức tấn công mạng. {{tenantName}} không chịu trách nhiệm cho thiệt hại
phát sinh từ hành vi truy cập trái phép nằm ngoài khả năng kiểm soát hợp lý, sau khi đã áp dụng đầy
đủ các biện pháp bảo mật cần thiết.

## 10. Thay đổi chính sách và liên hệ

Chính sách này có thể được cập nhật để phản ánh thay đổi về dịch vụ hoặc quy định pháp luật; thay đổi
mang tính nội dung sẽ yêu cầu đồng ý lại. Mọi câu hỏi về chính sách bảo mật vui lòng liên hệ
**{{tenantName}}** qua thông tin liên hệ được công bố trên nền tảng.`,
  },
  en: {
    title: 'Privacy Policy',
    bodyMd: `## 1. Scope

This policy describes how **{{tenantName}}** collects, uses, stores and protects the personal data of
customers, partners and affiliates who use {{tenantName}}'s booking platform. By using the platform,
you agree to the data handling practices described below.

## 2. Definitions

- **Personal data**: any information relating to an identified or identifiable individual, such as
  name, phone number, email, address, payment information.
- **Data processing**: any operation performed on personal data — collecting, recording, storing,
  using, sharing, deleting.
- **Third party**: an organization or individual other than {{tenantName}} that takes part in
  providing a related service (payment gateway, email service, hosting infrastructure, etc.).

## 3. Data we collect

- **Account information**: name, phone number, email, password (encrypted), display language.
- **Booking information**: booked service, time, transaction value, cancellation/reschedule history.
- **Payment information**: payment method, transaction status. {{tenantName}} does **not** store full
  card numbers — card data is processed directly by the partner payment gateway.
- **Technical data**: IP address, device type, browser, access time, used for security and to improve
  the user experience.
- **Partner/affiliate data**: identity information, verification documents (where applicable), payout
  account information.

## 4. How we use data

We use personal data to:

1. Process and confirm bookings, payments and refunds.
2. Contact you for customer support, and notify you of schedule changes, policy updates or issues
   related to a booking.
3. Verify partner/affiliate identity as required by law or internal policy.
4. Prevent fraud and protect the safety of the system and its users.
5. Improve service quality and analyze usage trends in aggregate, non-identifying form.
6. Send promotional information — only if you have opted in, and you may opt out at any time.

## 5. Sharing data with third parties

{{tenantName}} shares personal data only in the following cases:

- With the **partner** providing the service you booked, limited to the information needed to fulfil
  that booking (name, phone number, booking details).
- With the **payment intermediary** to process transactions.
- With **technical infrastructure providers** (hosting, email, SMS) acting on {{tenantName}}'s behalf
  under an equivalent commitment to data protection.
- When required by a **lawful request** from a competent authority.

{{tenantName}} does not sell personal data to third parties for their own commercial purposes.

## 6. Data storage and security

- Data is stored on infrastructure that applies appropriate technical and organizational security
  measures (encryption in transit, role-based access control, periodic backups).
- Data is retained for as long as needed to fulfil the purpose it was collected for and to comply
  with legal obligations (e.g. accounting records, transaction history), after which it is deleted or
  anonymized.
- In the event of an incident affecting personal data, {{tenantName}} will notify affected users and
  the competent authority as required by applicable law.

## 7. Your rights

You have the right to:

1. Request access to and a copy of the personal data {{tenantName}} holds about you.
2. Request correction of inaccurate information.
3. Request deletion of your data, except where {{tenantName}} has a legal obligation to keep it.
4. Withdraw consent to receive promotional information at any time.
5. Raise a complaint about how your personal data is handled using the contact details in Section 9.

## 8. Prohibited use

Users must not attempt to gain unauthorized access to other users' data, exploit security
vulnerabilities, or use data obtained from the platform for purposes outside what {{tenantName}}
permits.

## 9. Limitation of liability

{{tenantName}} applies reasonable, industry-standard security measures but cannot guarantee absolute
protection against every form of cyberattack. {{tenantName}} is not liable for damage arising from
unauthorized access that falls outside its reasonable control, once it has applied the necessary
security measures.

## 10. Changes to this policy and contact

This policy may be updated to reflect changes in our services or in applicable law; material changes
require re-acceptance. For any question about this privacy policy, please contact **{{tenantName}}**
using the contact details published on the platform.`,
  },
} as const;
