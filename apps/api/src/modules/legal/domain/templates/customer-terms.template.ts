/**
 * Starting draft for `customer_terms` — the terms a customer accepts when they
 * book through a tenant's storefront. `{{tenantName}}` is substituted by
 * `seedDrafts`; everything else is a real starting point a tenant edits before
 * publishing, not a placeholder.
 */
export const customerTermsTemplate = {
  vi: {
    title: 'Điều khoản sử dụng dịch vụ đặt chỗ',
    bodyMd: `## 1. Phạm vi áp dụng

Điều khoản này áp dụng cho mọi khách hàng sử dụng nền tảng đặt chỗ trực tuyến của **{{tenantName}}**
("chúng tôi", "{{tenantName}}") để tìm hiểu, đặt giữ chỗ và thanh toán cho các dịch vụ, không gian
hoặc tài nguyên được đăng tải trên hệ thống. Khi bấm "Đặt chỗ" hoặc hoàn tất thanh toán, bạn ("khách
hàng") xác nhận đã đọc, hiểu và đồng ý bị ràng buộc bởi các điều khoản dưới đây.

Nếu bạn không đồng ý với bất kỳ nội dung nào trong điều khoản này, vui lòng không tiếp tục sử dụng
dịch vụ đặt chỗ của **{{tenantName}}**.

## 2. Định nghĩa

- **Đối tác**: cá nhân hoặc tổ chức đăng tải và cung cấp dịch vụ/không gian/tài nguyên có thể đặt chỗ
  thông qua nền tảng của {{tenantName}}.
- **Lượt đặt chỗ**: một giao dịch giữ chỗ đã được xác nhận giữa khách hàng và đối tác cho một khung
  giờ, ngày hoặc gói dịch vụ cụ thể.
- **Nền tảng**: website, ứng dụng và mọi kênh trực tuyến khác do {{tenantName}} vận hành để phục vụ
  việc đặt chỗ.

{{tenantName}} là bên vận hành nền tảng và, tuỳ mô hình kinh doanh, có thể đồng thời là bên cung cấp
dịch vụ hoặc chỉ đóng vai trò trung gian kết nối khách hàng với đối tác. Vai trò cụ thể trong từng
lượt đặt chỗ được thể hiện tại trang chi tiết dịch vụ tương ứng.

## 3. Đặt chỗ và xác nhận

- Một lượt đặt chỗ chỉ được coi là **đã xác nhận** khi hệ thống phát hành mã đặt chỗ và trạng thái
  chuyển sang "đã xác nhận", thường sau khi thanh toán (toàn phần hoặc đặt cọc) được ghi nhận thành
  công.
- Thông tin hiển thị tại thời điểm đặt chỗ (giá, khung giờ, chính sách huỷ) là thông tin có hiệu lực
  cho giao dịch đó, kể cả khi thông tin này thay đổi sau đó trên nền tảng.
- Khách hàng có trách nhiệm kiểm tra kỹ thông tin (ngày giờ, số lượng, dịch vụ đi kèm) trước khi xác
  nhận thanh toán. {{tenantName}} không chịu trách nhiệm cho sai sót phát sinh từ việc khách hàng nhập
  sai thông tin.
- Khách hàng cần có mặt hoặc sử dụng dịch vụ đúng khung giờ đã đặt. Trường hợp đến trễ có thể bị rút
  ngắn thời lượng sử dụng mà không được hoàn tiền phần thời gian đã mất, tuỳ theo chính sách của từng
  đối tác/dịch vụ được hiển thị công khai.

## 4. Huỷ và đổi lịch

- Mỗi dịch vụ/đối tác có thể áp dụng **chính sách huỷ** riêng, được hiển thị công khai trước khi
  khách hàng xác nhận đặt chỗ. Chính sách này là một phần không tách rời của điều khoản này đối với
  lượt đặt chỗ tương ứng.
- Việc huỷ hoặc đổi lịch được thực hiện qua chức năng tương ứng trên nền tảng hoặc bằng cách liên hệ
  {{tenantName}}/đối tác theo thông tin được cung cấp trong xác nhận đặt chỗ.
- Huỷ trong thời hạn cho phép của chính sách huỷ sẽ được hoàn tiền theo tỷ lệ quy định tại chính sách
  đó; huỷ ngoài thời hạn hoặc không đến (no-show) có thể không được hoàn tiền.
- {{tenantName}} có quyền huỷ hoặc dời lịch đặt chỗ trong trường hợp bất khả kháng (thiên tai, sự cố
  kỹ thuật nghiêm trọng, yêu cầu của cơ quan nhà nước…) và sẽ hoàn lại toàn bộ số tiền đã thanh toán
  cho lượt đặt chỗ bị ảnh hưởng, trừ khi hai bên có thoả thuận khác.

## 5. Thanh toán

- Giá hiển thị trên nền tảng là giá đã bao gồm các loại thuế, phí áp dụng theo quy định, trừ khi có
  ghi chú khác.
- {{tenantName}} chấp nhận các phương thức thanh toán được hiển thị tại bước thanh toán (chuyển
  khoản, ví điện tử, cổng thanh toán trực tuyến…). Mọi giao dịch thanh toán được xử lý bởi đơn vị
  cung cấp cổng thanh toán hợp tác với {{tenantName}} và tuân thủ quy định bảo mật dữ liệu thẻ hiện
  hành.
- Trường hợp phát sinh khiếu nại liên quan đến thanh toán (trừ tiền sai, trừ tiền hai lần…), khách
  hàng liên hệ {{tenantName}} trong vòng 07 ngày kể từ ngày phát sinh giao dịch để được xử lý.
- Hoàn tiền (nếu có) được thực hiện về phương thức thanh toán gốc trong thời hạn hợp lý theo quy định
  của đơn vị trung gian thanh toán, thông thường 5–10 ngày làm việc.

## 6. Hành vi bị cấm

Khi sử dụng nền tảng, khách hàng không được:

1. Cung cấp thông tin sai sự thật, giả mạo danh tính hoặc sử dụng thông tin thanh toán không hợp
   pháp.
2. Đặt chỗ với mục đích quấy rối, gây rối trật tự, hoặc cản trở hoạt động bình thường của đối tác và
   khách hàng khác.
3. Sao chép, khai thác dữ liệu, hình ảnh hoặc nội dung trên nền tảng cho mục đích thương mại khác mà
   không được {{tenantName}} chấp thuận bằng văn bản.
4. Thực hiện các hành vi gian lận nhằm trục lợi từ chương trình khuyến mãi, hoàn tiền hoặc chính sách
   ưu đãi của {{tenantName}}.

{{tenantName}} có quyền tạm khoá hoặc chấm dứt tài khoản vi phạm mà không cần báo trước, đồng thời có
quyền từ chối phục vụ đối với các lượt đặt chỗ liên quan.

## 7. Giới hạn trách nhiệm

- {{tenantName}} nỗ lực đảm bảo thông tin trên nền tảng chính xác, cập nhật nhưng không đảm bảo tuyệt
  đối không có sai sót và không chịu trách nhiệm cho thiệt hại gián tiếp, ngẫu nhiên hoặc phát sinh từ
  việc sử dụng hoặc không thể sử dụng dịch vụ, ngoại trừ trường hợp pháp luật có quy định khác.
- Đối với các dịch vụ do đối tác trực tiếp cung cấp, trách nhiệm về chất lượng dịch vụ thuộc về đối
  tác đó; {{tenantName}} hỗ trợ tiếp nhận và điều phối khiếu nại giữa khách hàng và đối tác trên tinh
  thần thiện chí.
- Không nội dung nào trong điều khoản này loại trừ trách nhiệm mà pháp luật Việt Nam không cho phép
  loại trừ.

## 8. Thay đổi điều khoản

{{tenantName}} có thể cập nhật điều khoản này theo thời gian để phản ánh thay đổi về dịch vụ hoặc quy
định pháp luật. Với thay đổi mang tính chất **nội dung** (ảnh hưởng quyền, nghĩa vụ của khách hàng),
phiên bản mới sẽ được công bố và khách hàng cần đồng ý lại ở lượt tương tác tiếp theo cần đến sự đồng
ý đó. Các bản sửa lỗi chính tả, trình bày không làm phát sinh yêu cầu đồng ý lại.

## 9. Liên hệ

Mọi thắc mắc, khiếu nại liên quan đến điều khoản này vui lòng liên hệ **{{tenantName}}** qua thông tin
liên hệ được công bố trên nền tảng đặt chỗ.`,
  },
  en: {
    title: 'Customer Terms of Service',
    bodyMd: `## 1. Scope

These terms apply to every customer who uses **{{tenantName}}**'s ("we", "{{tenantName}}") online
booking platform to browse, reserve and pay for the services, spaces or resources listed on the
system. By clicking "Book" or completing payment, you (the "customer") confirm that you have read,
understood and agree to be bound by the terms below.

If you do not agree with any part of these terms, please do not continue using
**{{tenantName}}**'s booking service.

## 2. Definitions

- **Partner**: the individual or organization that lists and provides a bookable service, space or
  resource through {{tenantName}}'s platform.
- **Booking**: a confirmed reservation between a customer and a partner for a specific time slot,
  date or package.
- **Platform**: the website, app and any other online channel operated by {{tenantName}} to support
  bookings.

{{tenantName}} operates the platform and, depending on the business model, may also be the direct
service provider or act purely as an intermediary connecting customers with partners. The exact role
for each booking is shown on the relevant listing page.

## 3. Booking and confirmation

- A booking is only considered **confirmed** once the system issues a booking code and the status
  changes to "confirmed", typically after payment (in full or as a deposit) has been recorded.
- Information shown at the time of booking (price, time slot, cancellation policy) governs that
  transaction, even if the information later changes on the platform.
- Customers are responsible for checking the booking details (date, time, quantity, add-ons) before
  confirming payment. {{tenantName}} is not responsible for errors arising from information the
  customer entered incorrectly.
- Customers must arrive or use the service at the booked time. Late arrival may shorten the usable
  duration without a refund for the time lost, subject to the specific service/partner policy shown
  publicly.

## 4. Cancellation and rescheduling

- Each service/partner may apply its own **cancellation policy**, shown publicly before the customer
  confirms a booking. That policy is an integral part of these terms for the corresponding booking.
- Cancellations and reschedules are made through the corresponding feature on the platform, or by
  contacting {{tenantName}}/the partner using the contact details provided in the booking
  confirmation.
- Cancelling within the window allowed by the cancellation policy is refunded at the rate specified
  in that policy; cancelling outside the window, or not showing up, may not be refunded.
- {{tenantName}} may cancel or reschedule a booking in cases of force majeure (natural disaster,
  serious technical failure, a government order, etc.) and will refund the full amount paid for the
  affected booking, unless the parties agree otherwise.

## 5. Payment

- Prices shown on the platform include applicable taxes and fees unless noted otherwise.
- {{tenantName}} accepts the payment methods shown at checkout (bank transfer, e-wallet, online
  payment gateway, etc.). All payment transactions are processed by the payment gateway partnered
  with {{tenantName}} and comply with applicable card-data security standards.
- For payment-related complaints (incorrect charge, duplicate charge, etc.), customers should contact
  {{tenantName}} within 7 days of the transaction date for resolution.
- Refunds, where applicable, are returned to the original payment method within a reasonable period
  set by the payment intermediary, typically 5–10 business days.

## 6. Prohibited use

While using the platform, customers must not:

1. Provide false information, impersonate another person, or use unlawfully obtained payment
   information.
2. Book with intent to harass, disrupt, or interfere with the normal operation of a partner or other
   customers.
3. Copy or exploit the platform's data, images or content for other commercial purposes without
   {{tenantName}}'s prior written consent.
4. Commit fraud to profit from a promotion, refund or discount policy operated by {{tenantName}}.

{{tenantName}} may suspend or terminate a violating account without prior notice, and may refuse
service for any related bookings.

## 7. Limitation of liability

- {{tenantName}} makes reasonable efforts to keep information on the platform accurate and current
  but does not guarantee it is free of errors, and is not liable for indirect, incidental or
  consequential damages arising from use or inability to use the service, except where applicable law
  provides otherwise.
- For services provided directly by a partner, responsibility for service quality rests with that
  partner; {{tenantName}} assists in receiving and coordinating complaints between the customer and
  the partner in good faith.
- Nothing in these terms excludes liability that cannot be excluded under Vietnamese law.

## 8. Changes to these terms

{{tenantName}} may update these terms from time to time to reflect changes in its services or in
applicable law. For a **material** change (one that affects a customer's rights or obligations), the
new version will be published and the customer will be asked to re-accept it at the next interaction
that requires that consent. Typo or formatting fixes do not require re-acceptance.

## 9. Contact

For any question or complaint about these terms, please contact **{{tenantName}}** using the contact
details published on the booking platform.`,
  },
} as const;
