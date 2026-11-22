import { ScrollViewStyleReset } from 'expo-router/html';
import type { PropsWithChildren } from 'react';

/**
 * Web document shell — dark, edge-to-edge under the iOS notch / status bar.
 * viewport-fit=cover + black-translucent + theme-color so Safari does not
 * paint a white status-bar strip above the app (see AN-78).
 */
export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en" style={{ backgroundColor: '#000000' }}>
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover"
        />
        <meta name="theme-color" content="#000000" />
        <meta name="color-scheme" content="dark" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta
          name="apple-mobile-web-app-status-bar-style"
          content="black-translucent"
        />
        <meta name="apple-mobile-web-app-title" content="Edges" />
        <ScrollViewStyleReset />
        <style
          dangerouslySetInnerHTML={{
            __html: `
              :root { color-scheme: dark; background-color: #000000; }
              html, body, #root {
                height: 100%;
                width: 100%;
                margin: 0;
                padding: 0;
                overflow: hidden;
                background: #000000 !important;
                background-color: #000000 !important;
                overscroll-behavior: none;
                color-scheme: dark;
              }
              /* Kill Expo Router / RN-web default #f2f2f2 stack card (white top strip). */
              #root, #root > div, body > div,
              #root div[style*="background-color: rgb(242, 242, 242)"],
              #root div[style*="background-color:rgb(242, 242, 242)"] {
                background-color: #000000 !important;
              }
              #root div[class*="r-position-u8s1d"][class*="r-bottom-1p0dtai"] {
                background-color: #000000 !important;
              }
              /* Extend under notch / home indicator on iOS. */
              body {
                min-height: 100dvh;
                min-height: -webkit-fill-available;
              }
            `,
          }}
        />
      </head>
      <body style={{ backgroundColor: '#000000' }}>{children}</body>
    </html>
  );
}
