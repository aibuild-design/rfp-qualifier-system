import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "RFP Bid Desk | Caravann",
  description:
    "Qualifies incoming solicitations against Caravann's eligibility profile - go/no-go verdicts, gap lists, and compliance checklists before a single hour goes into a response.",
  icons: {
    icon: [
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/apple-icon.png",
  },
  // Invite-only internal tool - keep it out of search results.
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // suppressHydrationWarning because the script below mutates <html> before
    // React hydrates, which React would otherwise flag as a mismatch.
    <html lang="en" className={`${inter.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        {/* Applies the theme before first paint. Without it a dark-mode user
            gets a full-white flash on every navigation, because the stylesheet
            only learns the choice once React has mounted. Inline and blocking on
            purpose: it is two lines and it has to run first.

            Dark is the default rather than the operating system's preference.
            Caravann's brand is black and gold, the rail is black in both themes,
            and on a light desktop the app opened as a white field with a black
            bar down the side. Following the OS is still one click away in the
            rail, and an explicit choice always wins over this. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem("rfp-theme");document.documentElement.setAttribute("data-theme",t==="light"||t==="dark"?t:(t==="system"?(matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"):"dark"))}catch(e){document.documentElement.setAttribute("data-theme","dark")}`,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col bg-rfp-page text-rfp-ink">
        {children}
      </body>
    </html>
  );
}
