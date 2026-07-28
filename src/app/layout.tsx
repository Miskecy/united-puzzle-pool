import type { Metadata } from "next";
import { Inter, Space_Grotesk, Geist_Mono } from "next/font/google";
import "./globals.css";
import 'prismjs/themes/prism-tomorrow.css';
import NavigationHeader from "@/components/NavigationHeader";
import PuzzleBanner from "@/components/PuzzleBanner";
import Footer from "@/components/Footer";
import ClientInit from "@/components/ClientInit";
import { NavigationProgress } from "@/components/NavigationProgress";
import { LanguageProvider } from "@/contexts/LanguageContext";
import Script from "next/script";

const inter = Inter({
	variable: "--font-inter",
	subsets: ["latin"],
	display: "swap",
});

const spaceGrotesk = Space_Grotesk({
	variable: "--font-space-grotesk",
	subsets: ["latin"],
	display: "swap",
});

const geistMono = Geist_Mono({
	variable: "--font-geist-mono",
	subsets: ["latin"],
	display: "swap",
});

export const metadata: Metadata = {
	title: "United Puzzle Pool",
	description: "Collaborative puzzle mining pool",
	icons: {
		icon: "/favicon.svg",
	},
};

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<html lang="en" className={`${inter.variable} ${spaceGrotesk.variable} ${geistMono.variable}`}>
			<body className="antialiased bg-volt-bg text-volt-text">
				<Script id="perf-measure-patch" strategy="beforeInteractive">
					{`(function(){try{var p=window.performance;if(!p||!p.measure)return;var orig=p.measure.bind(p);p.measure=function(name,startOrOptions,endMark){try{return orig(name,startOrOptions,endMark);}catch(e){var msg=e&&e.message?String(e.message):String(e||'');if(msg.includes('negative time stamp')||msg.includes("Failed to execute 'measure'")){return;}throw e;}}}catch(_){}})();`}
				</Script>
				<LanguageProvider>
					<NavigationProgress />
					<ClientInit />
					<NavigationHeader />
					<PuzzleBanner />
					<main className="min-h-screen bg-volt-bg overflow-x-hidden">
						{children}
					</main>
					<Footer />
				</LanguageProvider>
			</body>
		</html>
	);
}
