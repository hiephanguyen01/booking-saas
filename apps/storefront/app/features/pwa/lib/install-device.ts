export type ManualInstallMode =
  | 'ios-safari'
  | 'ios-browser'
  | 'android-chrome'
  | 'android-browser';

export interface InstallDeviceProfile {
  isMobile: boolean;
  manualMode: ManualInstallMode | null;
}

const IOS_ALTERNATE_BROWSER =
  /CriOS|FxiOS|EdgiOS|OPiOS|DuckDuckGo|GSA|FBAN|FBAV|Instagram|Line|Zalo/i;
const ANDROID_ALTERNATE_BROWSER =
  /EdgA|OPR\/|SamsungBrowser|DuckDuckGo|FBAN|FBAV|Instagram|Line|Zalo|; wv\)|\bwv\b/i;

export function detectInstallDevice(navigatorValue: Navigator): InstallDeviceProfile {
  const userAgent = navigatorValue.userAgent;
  const isIpadOs = navigatorValue.platform === 'MacIntel' && navigatorValue.maxTouchPoints > 1;
  const isIos = /iPad|iPhone|iPod/i.test(userAgent) || isIpadOs;
  const isAndroid = /Android/i.test(userAgent);
  const userAgentData = (navigatorValue as Navigator & { userAgentData?: { mobile?: boolean } })
    .userAgentData;
  const reportsMobile =
    typeof userAgentData?.mobile === 'boolean' ? userAgentData.mobile : isIos || isAndroid;

  if (!reportsMobile || (!isIos && !isAndroid)) {
    return { isMobile: false, manualMode: null };
  }

  if (isIos) {
    const isSafari = /Safari/i.test(userAgent) && !IOS_ALTERNATE_BROWSER.test(userAgent);
    return { isMobile: true, manualMode: isSafari ? 'ios-safari' : 'ios-browser' };
  }

  const isChrome = /Chrome\//i.test(userAgent) && !ANDROID_ALTERNATE_BROWSER.test(userAgent);
  return { isMobile: true, manualMode: isChrome ? 'android-chrome' : 'android-browser' };
}
