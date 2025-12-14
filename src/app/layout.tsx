import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import 'prismjs/themes/prism-tomorrow.css';
import NavigationHeader from "@/components/NavigationHeader";
import PuzzleBanner from "@/components/PuzzleBanner";
import Footer from "@/components/Footer";
import ClientInit from "@/components/ClientInit";
import Script from "next/script";

const geistSans = Geist({
	variable: "--font-geist-sans",
	subsets: ["latin"],
});

const geistMono = Geist_Mono({
	variable: "--font-geist-mono",
	subsets: ["latin"],
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
		<html lang="en">
			<body
				className={`${geistSans.variable} ${geistMono.variable} antialiased bg-white text-black`}
			>
				<Script id="perf-measure-patch" strategy="beforeInteractive">
					{`(function(){try{var p=window.performance;if(!p||!p.measure)return;var orig=p.measure.bind(p);p.measure=function(name,startOrOptions,endMark){try{return orig(name,startOrOptions,endMark);}catch(e){var msg=e&&e.message?String(e.message):String(e||'');if(msg.includes('negative time stamp')||msg.includes("Failed to execute 'measure'")){return;}throw e;}}}catch(_){}})();`}
				</Script>
				<ClientInit />
				<NavigationHeader />
				<PuzzleBanner />
				<main className="min-h-screen bg-white overflow-x-hidden">
					{children}
				</main>
				<Footer />
			</body>
		</html>
	);
}
