import type { Metadata } from "next";
import { Geist, Instrument_Serif, JetBrains_Mono } from "next/font/google";
import { Suspense } from "react";

import { AgentLauncher, AgentProvider } from "@/components/AgentDock";
import { Banner } from "@/components/Banner";
import { Sidebar, SidebarFallback } from "@/components/Sidebar";
import { TopBar } from "@/components/TopBar";
import { getBriefing, getQueueStats } from "@/lib/data";
import "./globals.css";

const geist = Geist({ variable: "--font-geist", subsets: ["latin"], weight: ["400", "500", "600"] });
const jetbrains = JetBrains_Mono({ variable: "--font-jetbrains", subsets: ["latin"], weight: ["400", "500"] });
const instrument = Instrument_Serif({ variable: "--font-instrument", subsets: ["latin"], weight: "400", style: ["normal", "italic"] });

export const metadata: Metadata = {
  title: "Signal",
  description: "An AI agent that briefs you on what changed in your operations data, instead of a dashboard. Synthetic data.",
};

// Runs before hydration so the saved (or system) theme applies without a flash.
const themeScript = `(function(){try{var t=localStorage.getItem('signal-theme');if(t!=='light'&&t!=='dark'){t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}document.documentElement.dataset.theme=t}catch(e){}})()`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  const openCount = getQueueStats().open;
  const briefing = getBriefing();
  const chips = [
    briefing.featured?.actions.find((a) => a.ask)?.ask,
    ...briefing.insights.map((i) => i.actions.find((a) => a.ask)?.ask),
  ].filter((q): q is string => !!q).slice(0, 3);
  return (
    <html lang="en" data-theme="light" suppressHydrationWarning className={`${geist.variable} ${jetbrains.variable} ${instrument.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <AgentProvider openTasks={briefing.stats.open} insights={briefing.stats.insights} chips={chips}>
          <Suspense fallback={<SidebarFallback openCount={openCount} stats={briefing.stats} />}>
            <Sidebar openCount={openCount} stats={briefing.stats} />
          </Suspense>
          <main className="flex min-w-0 flex-1 flex-col">
            <TopBar />
            <Banner />
            <div className="w-full max-w-[1400px] px-4 pb-12 pt-6 min-[900px]:px-8">{children}</div>
          </main>
          <Suspense fallback={null}>
            <AgentLauncher insights={briefing.stats.insights} />
          </Suspense>
        </AgentProvider>
      </body>
    </html>
  );
}
