'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useCallback } from 'react';
import { useState } from 'react';
import { Menu, X, Home, BarChart3, Grid3X3, BookOpen, ChevronDown, Terminal, Code2Icon } from 'lucide-react';
import { useTranslation } from '@/contexts/LanguageContext';
import type { Lang } from '@/contexts/LanguageContext';

export default function NavigationHeader() {
	const [isMenuOpen, setIsMenuOpen] = useState(false);
	const [isDocsOpen, setIsDocsOpen] = useState(false);
	const pathname = usePathname();
	const docsRef = useRef<HTMLDivElement | null>(null);
	const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const { t, lang, setLang } = useTranslation();

	const navItems = [
		{ href: '/', label: t('nav.home'), icon: Home },
		{ href: '/dashboard', label: t('nav.dashboard'), icon: BarChart3 },
		{ href: '/overview', label: t('nav.overview'), icon: Grid3X3 },
	];

	const docItems = [
		{ href: '/docs/api', label: t('nav.apiEndpoints'), icon: Terminal },
		{ href: '/docs/gpu-script', label: t('nav.gpuScriptGuide'), icon: Code2Icon },
	];

	const isActive = useCallback((href: string) => {
		if (!pathname) return false;
		if (href === '/dashboard') return pathname === '/dashboard' || pathname === '/history' || pathname.startsWith('/history/') || pathname.startsWith('/dashboard/');
		if (href === '/overview') return pathname === '/overview' || pathname.startsWith('/block/') || pathname.startsWith('/overview/');
		return pathname === href;
	}, [pathname]);

	const docsActive = pathname?.startsWith('/docs') ?? false;

	const handleDocsEnter = useCallback(() => {
		if (hoverTimer.current) clearTimeout(hoverTimer.current);
		setIsDocsOpen(true);
	}, []);

	const handleDocsLeave = useCallback(() => {
		if (hoverTimer.current) clearTimeout(hoverTimer.current);
		hoverTimer.current = setTimeout(() => setIsDocsOpen(false), 150);
	}, []);

	useEffect(() => {
		function onOutsideClick(e: MouseEvent) {
			if (docsRef.current && e.target instanceof Node && !docsRef.current.contains(e.target)) {
				setIsDocsOpen(false);
			}
		}
		document.addEventListener('mousedown', onOutsideClick);
		return () => {
			document.removeEventListener('mousedown', onOutsideClick);
			if (hoverTimer.current) clearTimeout(hoverTimer.current);
		};
	}, []);

	const toggleMenu = useCallback(() => {
		setIsMenuOpen(v => !v);
		setIsDocsOpen(false);
	}, []);

	const toggleLang = useCallback(() => {
		setLang(lang === 'en' ? 'pt-BR' : 'en');
	}, [lang, setLang]);

	return (
		<header
			className="sticky top-0 z-30"
			style={{
				background: '#000000',
				borderBottom: '1px solid #262624',
				boxShadow: '0 4px 20px rgba(0,0,0,0.35)',
			}}
		>
			<div className="max-w-7xl mx-auto px-4 sm:px-7">
				<div className="flex justify-between items-center py-3">

					{/* Brand */}
					<Link href="/" className="flex items-center gap-2.5 group">
						<div
							className="w-8 h-8 rounded-lg flex items-center justify-center"
							style={{ background: 'linear-gradient(135deg, #fc5c04, #ff7226)' }}
						>
							<span className="text-volt-bg font-extrabold text-base leading-none">₿</span>
						</div>
						<span
							className="text-base font-bold transition-colors duration-150"
							style={{ fontFamily: 'var(--font-space-grotesk)', color: '#f4f3ee' }}
						>
							United Puzzle Pool
						</span>
					</Link>

					{/* Desktop Nav */}
					<nav className="hidden md:flex items-center gap-1">
						{navItems.map(({ href, label, icon: Icon }) => {
							const active = isActive(href);
							return (
								<Link
									key={href}
									href={href}
									className="flex items-center gap-2 px-3.5 py-2.5 rounded-[10px] text-[13px] font-semibold transition-all duration-150"
									style={active
										? { background: 'linear-gradient(135deg, #fc5c04, #ff7226)', color: '#0a0a0a' }
										: { color: '#9a9892' }
									}
									onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.cssText += 'color:#f4f3ee;background:#212121;'; }}
									onMouseLeave={e => { if (!active) { (e.currentTarget as HTMLElement).style.color = '#9a9892'; (e.currentTarget as HTMLElement).style.background = 'transparent'; } }}
								>
									<Icon size={16} />
									<span>{label}</span>
								</Link>
							);
						})}

						{/* Docs dropdown */}
						<div
							ref={docsRef}
							className="relative"
							onMouseEnter={handleDocsEnter}
							onMouseLeave={handleDocsLeave}
						>
							<button
								type="button"
								onClick={() => setIsDocsOpen(v => !v)}
								className="flex items-center gap-2 px-3.5 py-2.5 rounded-[10px] text-[13px] font-semibold transition-all duration-150"
								style={docsActive
									? { background: 'linear-gradient(135deg, #fc5c04, #ff7226)', color: '#0a0a0a' }
									: { color: '#9a9892' }
								}
							>
								<BookOpen size={16} />
								<span>{t('nav.docs')}</span>
								<ChevronDown
									size={14}
									className="transition-transform duration-200"
									style={{ transform: isDocsOpen ? 'rotate(180deg)' : 'rotate(0deg)', color: docsActive ? '#0a0a0a' : '#5c5a55' }}
								/>
							</button>

							<div
								className="absolute right-0 mt-2 w-56 z-50 transition-all duration-100"
								style={{
									background: '#131313',
									border: '1px solid #262624',
									borderRadius: '12px',
									padding: '6px',
									boxShadow: '0 12px 32px rgba(0,0,0,0.5)',
									transformOrigin: 'top right',
									opacity: isDocsOpen ? 1 : 0,
									transform: isDocsOpen ? 'scale(1)' : 'scale(0.95)',
									pointerEvents: isDocsOpen ? 'auto' : 'none',
								}}
							>
								{docItems.map(({ href, label, icon: Icon }) => {
									const active = isActive(href);
									return (
										<Link
											key={href}
											href={href}
											onClick={() => setIsDocsOpen(false)}
											className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13.5px] font-medium transition-colors duration-100"
											style={{ color: active ? '#fc5c04' : '#f4f3ee' }}
											onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.background = '#212121'; }}
											onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
										>
											<Icon size={15} style={{ color: active ? '#fc5c04' : '#9a9892' }} />
											<span>{label}</span>
										</Link>
									);
								})}
							</div>
						</div>

						{/* Language toggle */}
						<button
							onClick={toggleLang}
							className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[12px] font-bold transition-all duration-150 ml-1"
							style={{ border: '1px solid #262624', color: '#9a9892' }}
							onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = '#fc5c04'; (e.currentTarget as HTMLElement).style.color = '#fc5c04'; }}
							onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = '#262624'; (e.currentTarget as HTMLElement).style.color = '#9a9892'; }}
							title="Switch language"
						>
							<span style={{ color: lang === 'en' ? '#fc5c04' : '#5c5a55' }}>EN</span>
							<span style={{ color: '#3a3835' }}>|</span>
							<span style={{ color: lang === 'pt-BR' ? '#fc5c04' : '#5c5a55' }}>PT</span>
						</button>
					</nav>

					{/* Mobile toggle */}
					<div className="md:hidden flex items-center gap-2">
						{/* Mobile language toggle */}
						<button
							onClick={toggleLang}
							className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-bold"
							style={{ border: '1px solid #262624', color: '#9a9892' }}
						>
							<span style={{ color: lang === 'en' ? '#fc5c04' : '#5c5a55' }}>EN</span>
							<span style={{ color: '#3a3835' }}>|</span>
							<span style={{ color: lang === 'pt-BR' ? '#fc5c04' : '#5c5a55' }}>PT</span>
						</button>
						<button
							onClick={toggleMenu}
							className="p-2 rounded-lg transition-colors duration-150"
							style={{ color: '#9a9892' }}
							onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#212121'; (e.currentTarget as HTMLElement).style.color = '#f4f3ee'; }}
							onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = '#9a9892'; }}
						>
							{isMenuOpen ? <X size={22} /> : <Menu size={22} />}
						</button>
					</div>
				</div>

				{/* Mobile menu */}
				{isMenuOpen && (
					<div className="md:hidden pb-4 volt-fade-in">
						<div className="flex flex-col gap-1 pt-1">
							{navItems.map(({ href, label, icon: Icon }) => {
								const active = isActive(href);
								return (
									<Link
										key={href}
										href={href}
										onClick={toggleMenu}
										className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-[10px] text-[13px] font-semibold transition-colors duration-150"
										style={active
											? { background: 'linear-gradient(135deg, #fc5c04, #ff7226)', color: '#0a0a0a' }
											: { color: '#9a9892' }
										}
									>
										<Icon size={16} />
										<span>{label}</span>
									</Link>
								);
							})}

							<div style={{ height: 1, background: '#262624', margin: '6px 0' }} />

							<span className="px-3.5 text-[10.5px] font-bold uppercase tracking-widest" style={{ color: '#5c5a55' }}>{t('nav.documentation')}</span>
							{docItems.map(({ href, label, icon: Icon }) => (
								<Link
									key={href}
									href={href}
									onClick={toggleMenu}
									className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-[10px] text-[13px] font-semibold transition-colors duration-150"
									style={{ color: '#9a9892' }}
								>
									<Icon size={16} />
									<span>{label}</span>
								</Link>
							))}
						</div>
					</div>
				)}
			</div>
		</header>
	);
}
