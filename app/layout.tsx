import type { Metadata } from "next";
import { Geist, JetBrains_Mono } from "next/font/google";
import { Suspense } from "react";

import { Banner } from "@/components/Banner";
import { Sidebar, SidebarFallback } from "@/components/Sidebar";
import { TopBar, TopBarFallback } from "@/components/TopBar";
import { getFilterOptions, getQueueStats } from "@/lib/data";
import "./globals.css";

const geist = Geist({ variable: "--font-geist", subsets: ["latin"], weight: ["400", "500", "600"] });
const jetbrains = JetBrains_Mono({ variable: "--font-jetbrains", subsets: ["latin"], weight: ["400", "500"] });

export const metadata: Metadata = {
  title: "Relay",
  description: "Predicts where a stuck task goes next and how similar issues were solved. Synthetic data.",
};

// Runs before hydration so the saved (or system) theme applies without a flash.
const themeScript = `(function(){try{var t=localStorage.getItem('relay-theme');if(t!=='light'&&t!=='dark'){t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}document.documentElement.dataset.theme=t}catch(e){}})()`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  const options = getFilterOptions();
  const openCount = getQueueStats().open;
  return (
    <html lang="en" data-theme="light" suppressHydrationWarning className={`${geist.variable} ${jetbrains.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <div className="flex min-h-screen flex-col bg-bg text-ink min-[900px]:flex-row">
          <Suspense fallback={<SidebarFallback openCount={openCount} />}>
            <Sidebar openCount={openCount} />
          </Suspense>
          <main className="flex min-w-0 flex-1 flex-col">
            <Suspense fallback={<TopBarFallback />}>
              <TopBar options={options} />
            </Suspense>
            <Banner />
            <div className="w-full max-w-[1400px] px-4 pb-12 pt-6 min-[900px]:px-8">{children}</div>
          </main>
        </div>
      </body>
    </html>
  );
}
