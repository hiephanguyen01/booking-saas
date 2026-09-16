/**
 * VietQR / NAPAS 24/7 EMVCo Specification Implementation & Bank Directory.
 *
 * Implements the standard EMVCo Merchant-Presented / Consumer QR specification
 * used by NAPAS and all Vietnamese banking apps (MB, VCB, TCB, VPB, Agribank, etc.).
 * Generates the QR data string client-side without sending financial PII to any third party.
 */

export interface VietnamBank {
  bin: string;
  code: string;
  shortName: string;
  name: string;
}

export const VIETNAM_BANKS: readonly VietnamBank[] = [
  {
    bin: '970405',
    code: 'VBA',
    shortName: 'Agribank',
    name: 'Ngân hàng Nông nghiệp và Phát triển Nông thôn Việt Nam',
  },
  {
    bin: '970436',
    code: 'VCB',
    shortName: 'Vietcombank',
    name: 'Ngân hàng TMCP Ngoại thương Việt Nam',
  },
  { bin: '970422', code: 'MB', shortName: 'MB Bank', name: 'Ngân hàng TMCP Quân đội' },
  {
    bin: '970407',
    code: 'TCB',
    shortName: 'Techcombank',
    name: 'Ngân hàng TMCP Kỹ thương Việt Nam',
  },
  {
    bin: '970415',
    code: 'CTG',
    shortName: 'VietinBank',
    name: 'Ngân hàng TMCP Công thương Việt Nam',
  },
  {
    bin: '970418',
    code: 'BIDV',
    shortName: 'BIDV',
    name: 'Ngân hàng TMCP Đầu tư và Phát triển Việt Nam',
  },
  { bin: '970432', code: 'VPB', shortName: 'VPBank', name: 'Ngân hàng TMCP Việt Nam Thịnh Vượng' },
  { bin: '970416', code: 'ACB', shortName: 'ACB', name: 'Ngân hàng TMCP Á Châu' },
  { bin: '970423', code: 'TPB', shortName: 'TPBank', name: 'Ngân hàng TMCP Tiên Phong' },
  { bin: '970403', code: 'STB', shortName: 'Sacombank', name: 'Ngân hàng TMCP Sài Gòn Thương Tín' },
  { bin: '970437', code: 'HDB', shortName: 'HDBank', name: 'Ngân hàng TMCP Phát triển TP.HCM' },
  { bin: '970441', code: 'VIB', shortName: 'VIB', name: 'Ngân hàng TMCP Quốc tế Việt Nam' },
  { bin: '970443', code: 'SHB', shortName: 'SHB', name: 'Ngân hàng TMCP Sài Gòn - Hà Nội' },
  { bin: '970440', code: 'SSB', shortName: 'SeABank', name: 'Ngân hàng TMCP Đông Nam Á' },
  { bin: '970426', code: 'MSB', shortName: 'MSB', name: 'Ngân hàng TMCP Hàng Hải' },
  { bin: '970449', code: 'LPB', shortName: 'LPBank', name: 'Ngân hàng TMCP Lộc Phát Việt Nam' },
  { bin: '970448', code: 'OCB', shortName: 'OCB', name: 'Ngân hàng TMCP Phương Đông' },
  { bin: '970429', code: 'SCB', shortName: 'SCB', name: 'Ngân hàng TMCP Sài Gòn' },
  { bin: '970409', code: 'BAB', shortName: 'BacABank', name: 'Ngân hàng TMCP Bắc Á' },
  { bin: '970425', code: 'ABB', shortName: 'AnBinhBank', name: 'Ngân hàng TMCP An Bình' },
  { bin: '970428', code: 'NAB', shortName: 'NamABank', name: 'Ngân hàng TMCP Nam Á' },
  { bin: '970427', code: 'VAB', shortName: 'VietABank', name: 'Ngân hàng TMCP Việt Á' },
  { bin: '970419', code: 'NVB', shortName: 'NCB', name: 'Ngân hàng TMCP Quốc Dân' },
  { bin: '970438', code: 'BVB', shortName: 'BaoVietBank', name: 'Ngân hàng TMCP Bảo Việt' },
  { bin: '970452', code: 'KLB', shortName: 'KienLongBank', name: 'Ngân hàng TMCP Kiên Long' },
  {
    bin: '970439',
    code: 'PBVN',
    shortName: 'PublicBank',
    name: 'Ngân hàng TNHH MTV Public Việt Nam',
  },
  {
    bin: '970400',
    code: 'SGICB',
    shortName: 'SaigonBank',
    name: 'Ngân hàng TMCP Sài Gòn Công Thương',
  },
  {
    bin: '970430',
    code: 'PGB',
    shortName: 'PGBank',
    name: 'Ngân hàng TMCP Thịnh vượng và Phát triển',
  },
  {
    bin: '970446',
    code: 'COOPBANK',
    shortName: 'Co-opBank',
    name: 'Ngân hàng Hợp tác xã Việt Nam',
  },
  {
    bin: '970414',
    code: 'OJB',
    shortName: 'OceanBank',
    name: 'Ngân hàng Thương mại TNHH MTV Đại Dương',
  },
  {
    bin: '970408',
    code: 'GPB',
    shortName: 'GPBank',
    name: 'Ngân hàng Thương mại TNHH MTV Dầu Khí Toàn Cầu',
  },
  {
    bin: '970444',
    code: 'CBB',
    shortName: 'CBBank',
    name: 'Ngân hàng Thương mại TNHH MTV Xây dựng Việt Nam',
  },
  {
    bin: '970424',
    code: 'SHBVN',
    shortName: 'ShinhanBank',
    name: 'Ngân hàng TNHH MTV Shinhan Việt Nam',
  },
  {
    bin: '970431',
    code: 'EIB',
    shortName: 'Eximbank',
    name: 'Ngân hàng TMCP Xuất Nhập khẩu Việt Nam',
  },
  { bin: '970457', code: 'WVN', shortName: 'WooriBank', name: 'Ngân hàng TNHH MTV Woori Việt Nam' },
] as const;

export function getBankByBinOrCode(identifier: string): VietnamBank | undefined {
  const clean = identifier.trim().toUpperCase();
  return VIETNAM_BANKS.find(
    (b) => b.bin === clean || b.code === clean || b.shortName.toUpperCase() === clean,
  );
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

function tlv(tag: string, value: string): string {
  return `${tag}${pad2(value.length)}${value}`;
}

/**
 * Calculates 16-bit CRC with polynomial 0x1021 and initial value 0xFFFF (CRC16-CCITT).
 */
export function crc16Ccitt(str: string): string {
  let crc = 0xffff;
  for (let i = 0; i < str.length; i++) {
    crc ^= str.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      if ((crc & 0x8000) !== 0) {
        crc = ((crc << 1) ^ 0x1021) & 0xffff;
      } else {
        crc = (crc << 1) & 0xffff;
      }
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

export interface GenerateVietQrInput {
  /** Bank 6-digit BIN or short code (e.g. '970422' or 'MB') */
  bankCodeOrBin: string;
  /** Beneficiary bank account number */
  accountNumber: string;
  /** Amount in VND */
  amountVnd?: bigint | number | string;
  /** Transfer memo / description */
  memo?: string;
}

/**
 * Constructs a NAPAS 24/7 VietQR compliant EMVCo payload string.
 * Completely offline and secure - no external HTTP requests.
 */
export function generateVietQrPayload(input: GenerateVietQrInput): string {
  const bank = getBankByBinOrCode(input.bankCodeOrBin);
  const bin = bank ? bank.bin : input.bankCodeOrBin.trim();
  const acc = input.accountNumber.trim();

  // Sub-tag 00: Beneficiary Bank BIN
  const subSub00 = tlv('00', bin);
  // Sub-tag 01: Beneficiary Account Number
  const subSub01 = tlv('01', acc);
  // Sub-tag 01 inside Tag 38
  const sub01 = tlv('01', `${subSub00}${subSub01}`);
  // Sub-tag 00 inside Tag 38: NAPAS AID
  const sub00 = tlv('00', 'A000000727');
  // Sub-tag 02 inside Tag 38: Service Code (QRIBFTTA = Fast transfer to account)
  const sub02 = tlv('02', 'QRIBFTTA');
  // Tag 38: Merchant Account Information
  const tag38 = tlv('38', `${sub00}${sub01}${sub02}`);

  let raw = '';
  // Tag 00: Payload Format Indicator
  raw += tlv('00', '01');
  // Tag 01: Point of Initiation Method (12 = Dynamic, 11 = Static)
  raw += tlv('01', '12');
  // Tag 38
  raw += tag38;
  // Tag 53: Transaction Currency (704 = VND)
  raw += tlv('53', '704');

  // Tag 54: Transaction Amount
  if (input.amountVnd !== undefined && input.amountVnd !== null) {
    const amt = BigInt(input.amountVnd.toString());
    if (amt > 0n) {
      raw += tlv('54', amt.toString());
    }
  }

  // Tag 58: Country Code (VN)
  raw += tlv('58', 'VN');

  // Tag 62: Additional Data Field Template
  if (input.memo && input.memo.trim().length > 0) {
    const cleanMemo = input.memo.trim().slice(0, 50);
    const sub08 = tlv('08', cleanMemo);
    raw += tlv('62', sub08);
  }

  // Tag 63: CRC
  raw += '6304';
  const checksum = crc16Ccitt(raw);
  return `${raw}${checksum}`;
}
