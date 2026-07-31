/**
 * Starting draft for `affiliate_terms` — accepted by a person applying to
 * become a referral affiliate ("cộng tác viên"). `{{tenantName}}` is
 * substituted by `seedDrafts`.
 */
export const affiliateTermsTemplate = {
  vi: {
    title: 'Điều khoản chương trình cộng tác viên',
    bodyMd: `## 1. Phạm vi áp dụng

Điều khoản này áp dụng cho mọi cá nhân đăng ký tham gia chương trình cộng tác viên (CTV) giới thiệu
khách hàng của **{{tenantName}}**. Khi nộp hồ sơ đăng ký CTV, bạn xác nhận đã đọc, hiểu và đồng ý bị
ràng buộc bởi các điều khoản dưới đây.

## 2. Định nghĩa

- **Liên kết giới thiệu**: đường dẫn hoặc mã giới thiệu duy nhất được cấp cho CTV để gắn nguồn giới
  thiệu vào lượt truy cập, đăng ký hoặc đặt chỗ của khách hàng.
- **Lượt giới thiệu hợp lệ**: một lượt đặt chỗ hoàn tất thanh toán, được ghi nhận đến từ liên kết giới
  thiệu của CTV theo cơ chế đo lường của {{tenantName}} (cửa sổ ghi nhận, cookie, hoặc mã giới thiệu
  nhập tại thời điểm đặt chỗ).
- **Hoa hồng CTV**: khoản tiền {{tenantName}} trả cho CTV trên mỗi lượt giới thiệu hợp lệ, theo mức
  hoa hồng hiện hành được công bố trong tài khoản CTV.

## 3. Điều kiện tham gia

- CTV cam kết cung cấp thông tin đăng ký chính xác, bao gồm thông tin tài khoản nhận thanh toán hợp
  lệ đứng tên CTV hoặc người được CTV uỷ quyền hợp pháp.
- {{tenantName}} có quyền xét duyệt, từ chối hồ sơ hoặc tạm ngưng tư cách CTV nếu phát hiện thông tin
  sai lệch hoặc dấu hiệu gian lận.

## 4. Cách thức giới thiệu hợp lệ

- CTV chỉ được sử dụng các kênh giới thiệu hợp pháp: mạng xã hội, blog, nội dung cá nhân, giới thiệu
  trực tiếp — và phải nêu rõ đây là liên kết có hoa hồng khi kênh yêu cầu công bố minh bạch (ví dụ
  quảng cáo trả phí, bài đăng có tài trợ).
- CTV không được mạo danh {{tenantName}} hoặc đối tác, không được đưa ra cam kết, cam đoan về dịch vụ
  vượt quá nội dung được {{tenantName}} công bố chính thức.

## 5. Hoa hồng và thanh toán

- Hoa hồng được tính trên lượt giới thiệu hợp lệ theo mức phần trăm hoặc số tiền cố định được công bố
  tại thời điểm phát sinh, hiển thị trong tài khoản CTV.
- Hoa hồng chỉ được ghi nhận **chính thức** sau khi lượt đặt chỗ liên quan hoàn tất và không bị huỷ,
  hoàn tiền trong thời hạn chính sách huỷ áp dụng cho lượt đặt chỗ đó.
- {{tenantName}} chi trả hoa hồng đã ghi nhận chính thức theo chu kỳ thanh toán được công bố, vào tài
  khoản nhận thanh toán do CTV đăng ký, sau khi trừ các khoản thuế, phí theo quy định pháp luật (nếu
  có).

## 6. Hành vi bị cấm

CTV không được:

1. Tự đặt chỗ cho chính mình hoặc dàn dựng giao dịch giả để trục lợi hoa hồng.
2. Sử dụng quảng cáo trả phí trên tên thương hiệu của {{tenantName}} (brand bidding) khi không được
   cho phép bằng văn bản.
3. Spam, gửi liên kết giới thiệu qua các kênh không được sự đồng ý của người nhận, hoặc sử dụng thủ
   đoạn gây hiểu nhầm để dẫn dụ nhấp vào liên kết.
4. Chia sẻ, bán lại liên kết/mã giới thiệu cho bên thứ ba không phải là chính CTV.

Vi phạm các hành vi trên có thể dẫn đến việc huỷ hoa hồng liên quan, tạm ngưng hoặc chấm dứt tư cách
CTV mà không được thanh toán các khoản hoa hồng đang tranh chấp.

## 7. Giới hạn trách nhiệm

{{tenantName}} không đảm bảo mức thu nhập cụ thể nào từ chương trình CTV; hoa hồng phụ thuộc hoàn
toàn vào số lượng và giá trị lượt giới thiệu hợp lệ thực tế. {{tenantName}} có quyền điều chỉnh mức
hoa hồng, cơ chế đo lường lượt giới thiệu cho các giao dịch phát sinh sau thời điểm thay đổi có hiệu
lực.

## 8. Chấm dứt tư cách CTV

CTV có thể ngừng tham gia bất cứ lúc nào qua tài khoản CTV. {{tenantName}} có quyền chấm dứt tư cách
CTV vi phạm nghiêm trọng hoặc lặp lại điều khoản này. Hoa hồng đã ghi nhận chính thức trước thời điểm
chấm dứt vẫn được thanh toán theo chu kỳ thông thường, trừ trường hợp phát sinh từ hành vi gian lận.

## 9. Thay đổi điều khoản và liên hệ

Thay đổi mang tính nội dung đối với điều khoản này sẽ được công bố và yêu cầu CTV đồng ý lại trước khi
tiếp tục tạo lượt giới thiệu mới. Mọi thắc mắc vui lòng liên hệ **{{tenantName}}** qua kênh hỗ trợ CTV
trên nền tảng.`,
  },
  en: {
    title: 'Affiliate Program Terms',
    bodyMd: `## 1. Scope

These terms apply to every individual who registers for **{{tenantName}}**'s customer-referral
affiliate program. By submitting an affiliate application, you confirm that you have read, understood
and agree to be bound by the terms below.

## 2. Definitions

- **Referral link**: the unique link or code issued to an affiliate to attribute a customer's visit,
  registration or booking to that affiliate.
- **Valid referral**: a booking that completes payment and is attributed to an affiliate's referral
  link under {{tenantName}}'s tracking mechanism (attribution window, cookie, or a referral code
  entered at booking time).
- **Affiliate commission**: the amount {{tenantName}} pays an affiliate for each valid referral, at
  the current commission rate shown in the affiliate's account.

## 3. Eligibility

- Affiliates must provide accurate registration information, including valid payout account details
  in the affiliate's own name or that of a person the affiliate has lawfully authorized.
- {{tenantName}} may review, reject an application, or suspend affiliate status if it finds inaccurate
  information or signs of fraud.

## 4. Acceptable referral practices

- Affiliates may only use lawful referral channels: social media, blogs, personal content, direct
  referral — and must clearly disclose the link carries a commission where the channel requires
  transparent disclosure (e.g. paid ads, sponsored posts).
- Affiliates must not impersonate {{tenantName}} or a partner, and must not make claims or guarantees
  about the service beyond what {{tenantName}} has officially published.

## 5. Commission and payouts

- Commission is calculated on valid referrals at the percentage or fixed amount published at the time
  the referral occurs, shown in the affiliate's account.
- Commission is only **confirmed** after the related booking is completed and is not cancelled or
  refunded within the cancellation-policy window that applies to that booking.
- {{tenantName}} pays confirmed commission on the published payout cycle, to the payout account the
  affiliate has registered, net of any taxes or fees required by law.

## 6. Prohibited conduct

Affiliates must not:

1. Book for themselves, or stage fake transactions, to earn commission.
2. Bid on paid ads using {{tenantName}}'s brand name (brand bidding) without written permission.
3. Send referral links via spam or channels the recipient has not consented to, or use misleading
   tactics to induce clicks.
4. Share or resell their referral link/code to a third party who is not the affiliate themself.

Violating the above may result in cancellation of the related commission, and suspension or
termination of affiliate status without payment of any disputed commission.

## 7. Limitation of liability

{{tenantName}} does not guarantee any specific level of income from the affiliate program;
commission depends entirely on the actual number and value of valid referrals. {{tenantName}} may
adjust the commission rate or the referral-tracking mechanism for transactions that occur after the
change takes effect.

## 8. Ending affiliate status

An affiliate may stop participating at any time through their affiliate account. {{tenantName}} may
terminate an affiliate who seriously or repeatedly violates these terms. Commission already confirmed
before termination is still paid on the normal cycle, except where it arose from fraud.

## 9. Changes to these terms and contact

A material change to these terms will be published and affiliates will be asked to re-accept it
before generating new referrals. For questions, please contact **{{tenantName}}** through the
affiliate support channel on the platform.`,
  },
} as const;
