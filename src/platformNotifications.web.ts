type NotificationResponse = {
  notification: { request: { content: { data?: Record<string, unknown> } } };
};

const granted = { status: 'granted' as const };

export const isPushNotificationsSupported = false;

export async function getPermissionsAsync() {
  return granted;
}

export async function requestPermissionsAsync() {
  return granted;
}

export async function getExpoPushTokenAsync() {
  return { data: '' };
}

export async function getLastNotificationResponseAsync(): Promise<NotificationResponse | null> {
  return null;
}

export function addNotificationResponseReceivedListener(
  _listener: (response: NotificationResponse) => void,
) {
  return { remove() {} };
}
