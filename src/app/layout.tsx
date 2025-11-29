import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import 'prismjs/themes/prism-tomorrow.css';
import NavigationHeader from "@/components/NavigationHeader";
import PuzzleBanner from "@/components/PuzzleBanner";
import Footer from "@/components/Footer";

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
				<NavigationHeader />
				<PuzzleBanner />
				<main className="min-h-screen bg-white">
					{children}
				</main>
				<Footer />
			</body>
		</html>
	);
}
