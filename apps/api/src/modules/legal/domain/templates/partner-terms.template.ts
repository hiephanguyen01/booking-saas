/**
 * Starting draft for `partner_terms` — accepted by a partner when they apply to
 * list on the tenant's marketplace. `{{tenantName}}` is substituted by
 * `seedDrafts`.
 */
export const partnerTermsTemplate = {
  vi: {
    title: 'Điều khoản dành cho đối tác',
    bodyMd: `## 1. Phạm vi áp dụng

Điều khoản này áp dụng cho mọi cá nhân, hộ kinh doanh hoặc doanh nghiệp ("đối tác") đăng ký cung cấp
dịch vụ, không gian hoặc tài nguyên có thể đặt chỗ trên nền tảng của **{{tenantName}}**. Khi nộp hồ sơ
đăng ký đối tác, bạn xác nhận đã đọc, hiểu và đồng ý bị ràng buộc bởi các điều khoản dưới đây, cùng
với biểu phí hoa hồng hiện hành được công bố riêng.

## 2. Định nghĩa

- **Gian hàng/Danh mục**: trang mô tả dịch vụ hoặc tài nguyên do đối tác đăng tải trên nền tảng.
- **Lượt đặt chỗ**: giao dịch giữa khách hàng và đối tác được thực hiện qua nền tảng của
  {{tenantName}}.
- **Hoa hồng**: khoản phí {{tenantName}} được hưởng trên mỗi lượt đặt chỗ hoàn tất thành công, theo
  biểu phí đã công bố cho đối tác trước khi lượt đặt chỗ diễn ra.

## 3. Điều kiện trở thành đối tác

- Đối tác cam kết cung cấp thông tin đăng ký chính xác, đầy đủ và cập nhật khi có thay đổi, bao gồm
  giấy tờ định danh hoặc đăng ký kinh doanh khi được {{tenantName}} yêu cầu để xác minh.
- {{tenantName}} có quyền xét duyệt, từ chối hoặc yêu cầu bổ sung hồ sơ trước khi kích hoạt tài khoản
  đối tác, và có quyền đình chỉ tài khoản nếu phát hiện thông tin sai lệch.

## 4. Đăng tải và vận hành gian hàng

- Đối tác chịu trách nhiệm về tính chính xác, hợp pháp của nội dung đăng tải (mô tả, giá, hình ảnh,
  lịch trống) và cam kết không đăng nội dung vi phạm pháp luật, xâm phạm quyền sở hữu trí tuệ của bên
  thứ ba, hoặc gây hiểu nhầm cho khách hàng.
- Đối tác phải giữ lịch trống, giá và chính sách huỷ được cập nhật chính xác trên nền tảng; sai lệch
  giữa thông tin đăng tải và thực tế phục vụ có thể dẫn đến khiếu nại từ khách hàng mà đối tác chịu
  trách nhiệm xử lý.
- {{tenantName}} có quyền kiểm duyệt, tạm ẩn hoặc gỡ nội dung vi phạm điều khoản này hoặc chính sách
  nội dung của nền tảng, và sẽ thông báo lý do cho đối tác khi có thể.

## 5. Hoa hồng và thanh toán

- {{tenantName}} thu hoa hồng trên mỗi lượt đặt chỗ hoàn tất theo biểu phí đã công bố cho đối tác;
  biểu phí có thể khác nhau theo loại dịch vụ hoặc chương trình hợp tác cụ thể.
- Doanh thu sau khi trừ hoa hồng được đối soát và chi trả cho đối tác theo chu kỳ thanh toán được nêu
  trong chính sách chi trả của {{tenantName}}, vào tài khoản nhận thanh toán do đối tác đăng ký.
- Trường hợp phát sinh hoàn tiền cho khách hàng theo chính sách huỷ, khoản hoàn tiền được khấu trừ
  tương ứng vào doanh thu của đối tác trước khi chi trả.

## 6. Nghĩa vụ của đối tác đối với khách hàng

- Đối tác cam kết cung cấp dịch vụ đúng như mô tả, đúng thời gian, chất lượng đã cam kết cho khách
  hàng đặt chỗ thành công qua nền tảng.
- Đối tác áp dụng chính sách huỷ đã công bố một cách nhất quán cho mọi khách hàng, không được tự ý
  huỷ lượt đặt chỗ đã xác nhận trừ trường hợp bất khả kháng, và phải thông báo sớm nhất có thể cho
  khách hàng lẫn {{tenantName}} khi xảy ra sự cố ảnh hưởng đến lượt đặt chỗ.

## 7. Hành vi bị cấm

Đối tác không được:

1. Yêu cầu khách hàng thanh toán ngoài nền tảng để né tránh hoa hồng cho lượt đặt chỗ phát sinh từ
   nền tảng của {{tenantName}}.
2. Tạo lượt đặt chỗ giả, thông đồng để trục lợi từ chương trình khuyến mãi hoặc chỉ số xếp hạng.
3. Sử dụng dữ liệu khách hàng thu được qua nền tảng cho mục đích ngoài phạm vi thực hiện lượt đặt chỗ
   đã xác nhận.
4. Đăng tải nội dung phân biệt đối xử, phản cảm hoặc vi phạm pháp luật hiện hành.

## 8. Giới hạn trách nhiệm

{{tenantName}} đóng vai trò vận hành nền tảng kết nối và không phải là bên trực tiếp cung cấp dịch vụ
của đối tác. Trách nhiệm về chất lượng, an toàn của dịch vụ thuộc về đối tác. {{tenantName}} không
chịu trách nhiệm cho thiệt hại phát sinh trực tiếp từ việc đối tác không thực hiện đúng cam kết với
khách hàng, nhưng có thể áp dụng biện pháp xử lý nội bộ (cảnh cáo, tạm ngưng, chấm dứt hợp tác) khi
tiếp nhận khiếu nại có căn cứ.

## 9. Chấm dứt hợp tác

Đối tác có thể ngừng hợp tác bất cứ lúc nào bằng cách gỡ toàn bộ gian hàng khỏi nền tảng, với điều
kiện đã hoàn tất mọi lượt đặt chỗ đã xác nhận trước đó. {{tenantName}} có quyền tạm ngưng hoặc chấm
dứt hợp tác với đối tác vi phạm nghiêm trọng hoặc lặp lại điều khoản này, sau khi đã thông báo trừ
trường hợp vi phạm nghiêm trọng cần xử lý ngay để bảo vệ khách hàng.

## 10. Thay đổi điều khoản và liên hệ

Thay đổi mang tính nội dung đối với điều khoản này hoặc biểu phí hoa hồng sẽ được công bố và yêu cầu
đối tác đồng ý lại trước khi tiếp tục nhận lượt đặt chỗ mới. Mọi thắc mắc vui lòng liên hệ
**{{tenantName}}** qua kênh hỗ trợ đối tác trên nền tảng.`,
  },
  en: {
    title: 'Partner Terms',
    bodyMd: `## 1. Scope

These terms apply to every individual, household business or company ("partner") that registers to
offer a bookable service, space or resource on **{{tenantName}}**'s platform. By submitting a partner
application, you confirm that you have read, understood and agree to be bound by the terms below,
together with the current commission schedule published separately.

## 2. Definitions

- **Listing**: the page describing a service or resource a partner posts on the platform.
- **Booking**: a transaction between a customer and a partner made through {{tenantName}}'s platform.
- **Commission**: the fee {{tenantName}} earns on every successfully completed booking, per the
  schedule published to the partner before the booking takes place.

## 3. Becoming a partner

- Partners must provide accurate, complete registration information and keep it current, including
  identity or business-registration documents when {{tenantName}} requests them for verification.
- {{tenantName}} may review, reject, or request additional documentation before activating a partner
  account, and may suspend an account if it finds the information provided to be false.

## 4. Listing content and operations

- Partners are responsible for the accuracy and legality of the content they post (description,
  price, images, availability) and must not post content that violates the law, infringes a third
  party's intellectual property, or misleads customers.
- Partners must keep availability, pricing and cancellation policy accurate and current on the
  platform; a mismatch between listed information and what is actually delivered may lead to customer
  complaints, which the partner is responsible for resolving.
- {{tenantName}} may moderate, hide or remove content that violates these terms or the platform's
  content policy, and will state the reason to the partner where possible.

## 5. Commission and payouts

- {{tenantName}} charges a commission on every completed booking per the schedule published to the
  partner; the schedule may vary by service type or specific partnership program.
- Revenue net of commission is reconciled and paid out to the partner on the cycle described in
  {{tenantName}}'s payout policy, to the payout account the partner has registered.
- Where a refund is issued to a customer under the cancellation policy, the refunded amount is
  deducted from the partner's revenue accordingly before payout.

## 6. Partner obligations to customers

- Partners must deliver the service as described, at the committed time and quality, to every
  customer who successfully books through the platform.
- Partners must apply their published cancellation policy consistently to every customer, must not
  unilaterally cancel a confirmed booking except in cases of force majeure, and must notify both the
  customer and {{tenantName}} as soon as possible when an issue affects a booking.

## 7. Prohibited conduct

Partners must not:

1. Ask a customer to pay outside the platform to avoid commission on a booking that originated on
   {{tenantName}}'s platform.
2. Create fake bookings, or collude to profit from a promotion or ranking metric.
3. Use customer data obtained through the platform for any purpose beyond fulfilling the confirmed
   booking.
4. Post discriminatory, offensive content, or content that violates applicable law.

## 8. Limitation of liability

{{tenantName}} operates the connecting platform and is not the direct provider of a partner's
service. Responsibility for the quality and safety of the service rests with the partner.
{{tenantName}} is not liable for damage arising directly from a partner's failure to honor their
commitment to a customer, but may take internal action (warning, suspension, termination) upon
receiving a substantiated complaint.

## 9. Ending the partnership

A partner may stop working with {{tenantName}} at any time by removing all listings from the
platform, provided every previously confirmed booking has been fulfilled. {{tenantName}} may suspend
or terminate a partner who seriously or repeatedly violates these terms, after notice, except where
an immediate response is needed to protect customers.

## 10. Changes to these terms and contact

A material change to these terms or to the commission schedule will be published and partners will be
asked to re-accept it before receiving new bookings. For questions, please contact **{{tenantName}}**
through the partner support channel on the platform.`,
  },
} as const;
