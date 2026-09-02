type SpeechRecognitionPackage = typeof import('expo-speech-recognition');

let speechRecognition: SpeechRecognitionPackage | null = null;
try {
  // Expo Go and an old development build do not contain this native module.
  // Catching the native-proxy error keeps the rest of the app usable until the
  // user installs a freshly rebuilt development client.
  speechRecognition = require('expo-speech-recognition') as SpeechRecognitionPackage;
} catch {
  speechRecognition = null;
}

const unavailableModule = {
  abort() {},
  stop() {},
  start() {},
  isRecognitionAvailable() { return false; },
  async requestPermissionsAsync() {
    return { granted: false, status: 'denied', canAskAgain: false, expires: 'never' };
  },
};

export const isSpeechRecognitionModuleAvailable = speechRecognition !== null;
export const ExpoSpeechRecognitionModule = speechRecognition?.ExpoSpeechRecognitionModule || unavailableModule;
export const useSpeechRecognitionEvent: SpeechRecognitionPackage['useSpeechRecognitionEvent'] =
  speechRecognition?.useSpeechRecognitionEvent || (() => {});
