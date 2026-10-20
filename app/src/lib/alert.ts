import { Alert, Platform, type AlertButton } from 'react-native';

/**
 * Alert.alert와 같은 사용법의 경고창.
 * React Native의 Alert는 웹에서 아무것도 표시하지 않으므로, 웹에서는 브라우저 기본 대화상자로 대신한다.
 *  - 버튼이 하나 이하면 확인창(alert) 뒤에 그 버튼의 onPress를 실행한다.
 *  - 버튼이 둘 이상이면 confirm으로 묻고, 확인이면 마지막 버튼(cancel 스타일 제외), 취소면 cancel 버튼의 onPress를 실행한다.
 */
export function showAlert(title: string, message?: string, buttons?: AlertButton[]): void {
  if (Platform.OS !== 'web') {
    Alert.alert(title, message, buttons);
    return;
  }

  const text = message ? `${title}\n\n${message}` : title;
  const list = buttons ?? [];

  if (list.length <= 1) {
    window.alert(text);
    list[0]?.onPress?.();
    return;
  }

  const cancelButton = list.find((button) => button.style === 'cancel');
  const actionButton = [...list].reverse().find((button) => button.style !== 'cancel') ?? list[list.length - 1];
  if (window.confirm(text)) actionButton.onPress?.();
  else cancelButton?.onPress?.();
}
