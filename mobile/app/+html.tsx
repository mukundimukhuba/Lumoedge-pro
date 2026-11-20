import { ScrollViewStyleReset } from 'expo-router/html';
import type { PropsWithChildren } from 'react';

/**
 * Web document shell — viewport-fit=cover so SafeAreaInsets / bottom dock
 * clear the iOS Safari home indicator.
 */
export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover"
        />
        <ScrollViewStyleReset />
        <style
          dangerouslySetInnerHTML={{
            __html: `
              html, body, #root {
                height: 100%;
                width: 100%;
                margin: 0;
                padding: 0;
                overflow: hidden;
                background: #000000;
                overscroll-behavior: none;
                color-scheme: dark;
              }
              /* Kill Expo Router / RN-web default #f2f2f2 stack card (white top strip). */
              #root, #root > div, body > div {
                background-color: #000000 !important;
              }
              #root div[class*="r-position-u8s1d"][class*="r-bottom-1p0dtai"] {
                background-color: #000000 !important;
              }
            `,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
