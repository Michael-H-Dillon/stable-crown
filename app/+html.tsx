import { ScrollViewStyleReset } from 'expo-router/html';
import type { PropsWithChildren } from 'react';

export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />
        <ScrollViewStyleReset />
        <style dangerouslySetInnerHTML={{ __html: `
          html, body, * {
            scrollbar-width: thin;
            scrollbar-color: #6f5d38 #111518;
          }
          *::-webkit-scrollbar {
            width: 10px;
            height: 10px;
          }
          *::-webkit-scrollbar-track {
            background: #111518;
            border-left: 1px solid #30383c;
          }
          *::-webkit-scrollbar-thumb {
            background: #6f5d38;
            border: 2px solid #111518;
            border-radius: 0;
          }
          *::-webkit-scrollbar-thumb:hover {
            background: #c6a25a;
          }
          *::-webkit-scrollbar-corner {
            background: #111518;
          }
          textarea {
            scrollbar-width: none !important;
            -ms-overflow-style: none !important;
          }
          textarea::-webkit-scrollbar {
            display: none !important;
            width: 0 !important;
            height: 0 !important;
          }
        ` }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
