import React, { useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Platform, SafeAreaView, StatusBar, StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import Constants from 'expo-constants';

/**
 * Thin React Native shell around the web WHAT CONF client.
 * WebRTC works inside WebView on Android with media permissions granted.
 * Set expo.extra.webAppUrl (or EXPO_PUBLIC_WEB_URL) to your deployed site.
 */
const DEFAULT_URL = 'https://example.com';

export default function App() {
  const webUrl =
    process.env.EXPO_PUBLIC_WEB_URL ||
    (Constants.expoConfig?.extra as any)?.webAppUrl ||
    DEFAULT_URL;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<WebView>(null);

  const source = useMemo(() => ({ uri: webUrl }), [webUrl]);

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor="#09090b" />
      {error ? (
        <View style={styles.center}>
          <Text style={styles.errorTitle}>Не удалось загрузить</Text>
          <Text style={styles.errorText}>{error}</Text>
          <Text style={styles.hint}>URL: {webUrl}</Text>
        </View>
      ) : (
        <>
          {loading && (
            <View style={styles.loader}>
              <ActivityIndicator color="#f4f4f5" size="large" />
            </View>
          )}
          <WebView
            ref={ref}
            source={source}
            style={styles.webview}
            onLoadEnd={() => setLoading(false)}
            onError={(e) => setError(e.nativeEvent.description || 'WebView error')}
            mediaPlaybackRequiresUserAction={false}
            allowsInlineMediaPlayback
            javaScriptEnabled
            domStorageEnabled
            mediaCapturePermissionGrantType="grant"
            {...(Platform.OS === 'android'
              ? {
                  // @ts-expect-error android-only prop in RN WebView
                  mixedContentMode: 'compatibility',
                }
              : {})}
          />
        </>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#09090b' },
  webview: { flex: 1, backgroundColor: '#09090b' },
  loader: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
    backgroundColor: '#09090b',
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  errorTitle: { color: '#fafafa', fontSize: 18, fontWeight: '700', marginBottom: 8 },
  errorText: { color: '#a1a1aa', textAlign: 'center' },
  hint: { color: '#71717a', marginTop: 12, fontSize: 12 },
});
