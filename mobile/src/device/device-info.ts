import { Platform } from 'react-native';
import * as Application from 'expo-application';
import * as Device from 'expo-device';
import { getLocales } from 'expo-localization';
import type { RegisterDevicePayload } from '../api/endpoints';

/** Static facts about this installation, sent at registration and heartbeat. */
export function appVersion(): string {
  return Application.nativeApplicationVersion ?? '0.0.0';
}

export function devicePayload(): RegisterDevicePayload {
  return {
    platform: Platform.OS === 'ios' ? 'IOS' : 'ANDROID',
    appVersion: appVersion(),
    osVersion: String(Platform.Version),
    model: Device.modelName ?? undefined,
    locale: getLocales()[0]?.languageTag ?? undefined,
  };
}
