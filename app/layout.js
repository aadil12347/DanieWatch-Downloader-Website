import './globals.css';

export const metadata = {
  title: 'DanieWatch — Movie & TV Search & Download',
  description: 'Search, browse, and download movies, TV shows, and anime in high quality.',
  icons: {
    icon: '/logo.png',
    shortcut: '/logo.png',
    apple: '/logo.png',
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="manifest" href="/manifest.json" />
        <link rel="icon" href="/logo.png" type="image/png" />
        <link rel="shortcut icon" href="/logo.png" type="image/png" />
        <link rel="apple-touch-icon" href="/logo.png" />
        <meta name="theme-color" content="#e50914" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="DanieWatch" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=Poppins:wght@400;600;700;800;900&display=swap" rel="stylesheet" />
        {/* Lenis Scroll Smooth */}
        <script src="https://unpkg.com/@studio-freight/lenis@1.0.33/dist/lenis.min.js" defer></script>
        {/* GSAP and ScrollTrigger */}
        <script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js" defer></script>
        <script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/ScrollTrigger.min.js" defer></script>
        {/* Splitting.js */}
        <link rel="stylesheet" href="https://unpkg.com/splitting/dist/splitting.css" />
        <link rel="stylesheet" href="https://unpkg.com/splitting/dist/splitting-cells.css" />
        <script src="https://unpkg.com/splitting/dist/splitting.min.js" defer></script>
      </head>
      <body>{children}</body>
    </html>
  );
}
