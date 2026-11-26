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
          content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover"
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
        <link rel="icon" href="/favicon.ico" sizes="any" />
        <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png" />
        <link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <link rel="manifest" href="/site.webmanifest" />
        <ScrollViewStyleReset />
        <style
          dangerouslySetInnerHTML={{
            __html: `
              :root { color-scheme: dark; background-color: #000000; }
              html, body, #root {
                height: 100%;
                width: 100%;
                max-width: 100%;
                margin: 0;
                padding: 0;
                overflow: hidden;
                overflow-x: hidden !important;
                background: #000000 !important;
                background-color: #000000 !important;
                overscroll-behavior: none;
                color-scheme: dark;
                /* Never use CSS zoom/scale as a layout hack — breaks iPhone Safari. */
                zoom: normal !important;
                -webkit-text-size-adjust: 100%;
                text-size-adjust: 100%;
              }
              /* Pre-JS boot splash — kills empty black load before React mounts. */
              #lumo-boot-splash {
                position: fixed;
                inset: 0;
                z-index: 2147483646;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                background: #000000;
                color: #F3F4F6;
                font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
                pointer-events: none;
              }
              #lumo-boot-splash img {
                width: 168px;
                height: 168px;
                object-fit: contain;
                margin-bottom: 22px;
                animation: lumoBootBounce 1.04s ease-in-out infinite;
              }
              #lumo-boot-splash p {
                margin: 0;
                font-size: 20px;
                font-weight: 600;
                letter-spacing: 0.2px;
                text-align: center;
                padding: 0 28px;
                opacity: 0;
                animation: lumoBootFade 480ms ease-out 180ms forwards;
              }
              @keyframes lumoBootBounce {
                0%, 100% { transform: translateY(0) scale(1); }
                50% { transform: translateY(-18px) scale(1.06); }
              }
              @keyframes lumoBootFade {
                from { opacity: 0; transform: translateY(10px); }
                to { opacity: 1; transform: translateY(0); }
              }
              @media (prefers-reduced-motion: reduce) {
                #lumo-boot-splash img { animation: none; }
                #lumo-boot-splash p { animation: none; opacity: 1; }
              }
              /* Kill Expo Router / RN-web default #f2f2f2 / white stack card flash. */
              #root, #root > div, body > div,
              #root div[style*="background-color: rgb(242, 242, 242)"],
              #root div[style*="background-color:rgb(242, 242, 242)"],
              #root div[style*="background-color: rgb(255, 255, 255)"],
              #root div[style*="background-color:rgb(255, 255, 255)"],
              #root div[style*="background-color: #fff"],
              #root div[style*="background-color:#fff"],
              #root div[style*="background-color: #ffffff"],
              #root div[style*="background-color:#ffffff"] {
                background-color: #000000 !important;
                max-width: 100%;
                overflow-x: hidden;
              }
              #root div[class*="r-position-u8s1d"][class*="r-bottom-1p0dtai"] {
                background-color: #000000 !important;
              }
              /* Extend under notch / home indicator on iOS. */
              body {
                min-height: 100dvh;
                min-height: -webkit-fill-available;
              }
              /* iOS Safari auto-zooms focused inputs under 16px — lock portal fields. */
              input, textarea, select {
                font-size: 16px !important;
              }
              /* Subtle portal enter — disabled when user prefers reduced motion. */
              @keyframes portalFadeIn {
                from { opacity: 0; transform: translateY(6px); }
                to { opacity: 1; transform: translateY(0); }
              }
              @media (prefers-reduced-motion: no-preference) {
                #portal-root {
                  animation: portalFadeIn 280ms ease-out;
                }
              }
              @media (prefers-reduced-motion: reduce) {
                *, *::before, *::after {
                  animation-duration: 0.01ms !important;
                  animation-iteration-count: 1 !important;
                  transition-duration: 0.01ms !important;
                  scroll-behavior: auto !important;
                }
              }
            `,
          }}
        />
      </head>
      <body style={{ backgroundColor: '#000000' }}>
        <div id="lumo-boot-splash" aria-hidden="true">
          <img src="/splash-mascot.png" alt="" width={168} height={168} />
          <p>Welcome to Lumo Edge Pro</p>
        </div>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var p=(location&&location.pathname)||'';var el=document.getElementById('lumo-boot-splash');if(!el)return;if(/^\\/giveaway(\\/|$)/i.test(p)){el.remove();return;}setTimeout(function(){var n=document.getElementById('lumo-boot-splash');if(n)n.remove();},5000);}catch(e){}})();`,
          }}
        />
        {children}
      </body>
    </html>
  );
}
