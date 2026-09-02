// TypeScript fallback and native implementation. Metro selects the platform-
// specific file where one exists, keeping expo-notifications out of web builds.
export {
  addNotificationResponseReceivedListener,
  getExpoPushTokenAsync,
  getLastNotificationResponseAsync,
  getPermissionsAsync,
  requestPermissionsAsync,
} from 'expo-notifications';
