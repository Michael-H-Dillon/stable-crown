import Constants, { ExecutionEnvironment } from 'expo-constants';

import type * as ExpoNotifications from 'expo-notifications';

export const isPushNotificationsSupported =
  Constants.executionEnvironment !== ExecutionEnvironment.StoreClient;

const unavailableMessage =
  'Push notifications are not available in Expo Go. Use a development build to enable them.';

function getNotifications(): typeof ExpoNotifications {
  // Requiring expo-notifications in Expo Go on Android throws while the module
  // is being evaluated, so do not load it until we know this is our own build.
  if (!isPushNotificationsSupported) throw new Error(unavailableMessage);
  return require('expo-notifications') as typeof ExpoNotifications;
}

export function getPermissionsAsync() {
  return getNotifications().getPermissionsAsync();
}

export function requestPermissionsAsync() {
  return getNotifications().requestPermissionsAsync();
}

export function getExpoPushTokenAsync() {
  return getNotifications().getExpoPushTokenAsync();
}

export function getLastNotificationResponseAsync() {
  if (!isPushNotificationsSupported) return Promise.resolve(null);
  return getNotifications().getLastNotificationResponseAsync();
}

export function addNotificationResponseReceivedListener(
  listener: Parameters<
    typeof ExpoNotifications.addNotificationResponseReceivedListener
  >[0],
) {
  if (!isPushNotificationsSupported) return { remove() {} };
  return getNotifications().addNotificationResponseReceivedListener(listener);
}
