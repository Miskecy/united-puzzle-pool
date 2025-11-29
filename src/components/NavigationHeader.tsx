'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState, useCallback } from 'react';
import { Menu, X, Home, BarChart3, BookOpen, Grid3X3, Calculator, ChevronDown, GitBranch, Terminal, GpuIcon } from 'lucide-react';

export default function NavigationHeader() {
	const [isMenuOpen, setIsMenuOpen] = useState(false);
	const [isDocsOpen, setIsDocsOpen] = useState(false);

	const pathname = usePathname();

	const docsRef = useRef<HTMLDivElement | null>(null);
	const hoverTimerRef = useRef<NodeJS.Timeout | null>(null);

	// Módulos de Documentação
	const docItems = [
		{ href: '/docs/api', label: 'API Endpoints', icon: Terminal },
		{ href: '/docs/shared', label: 'Shared Pool API', icon: GitBranch },
		{ href: '/docs/gpu-script', label: 'GPU Script Guide', icon: GpuIcon },
	];

	// Navegação Principal
	const navItems = [
		{ href: '/', label: 'Home', icon: Home },
		{ href: '/dashboard', label: 'Dashboard', icon: BarChart3 },
		{ href: '/overview', label: 'Overview', icon: Grid3X3 },
		{ href: '/calc', label: 'Calculator', icon: Calculator },
	];

	const toggleMenu = useCallback(() => {
		setIsMenuOpen(v => !v);
		// Garante que o menu de Docs feche se o menu principal abrir
		if (!isMenuOpen) setIsDocsOpen(false);
	}, [isMenuOpen]);

	// --- Lógica de Dropdown Desktop Aprimorada (Hover Controlado) ---

	// Função para fechar o dropdown após um pequeno atraso
	const handleMouseLeave = useCallback(() => {
		if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
		hoverTimerRef.current = setTimeout(() => {
			setIsDocsOpen(false);
		}, 150); // Delay de 150ms antes de fechar
	}, []);

	// Função para abrir o dropdown imediatamente e limpar o timer de fechamento
	const handleMouseEnter = useCallback(() => {
		if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
		setIsDocsOpen(true);
	}, []);

	// Efeito para fechar o dropdown ao clicar fora
	useEffect(() => {
		function onDocClick(e: MouseEvent) {
			const el = docsRef.current;
			if (!el || !(e.target instanceof Node)) return;

			// Fecha se o clique foi fora do dropdown (e não foi o botão de toggle móvel)
			if (isDocsOpen && !el.contains(e.target)) {
				setIsDocsOpen(false);
			}
		}
		document.addEventListener('mousedown', onDocClick);
		return () => {
			document.removeEventListener('mousedown', onDocClick);
			if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
		};
	}, [isDocsOpen]);


	// --- Helpers ---
	const isActive = useCallback((href: string) => {
		if (!pathname) return false;
		if (href === '/dashboard') {
			if (pathname === '/history' || pathname.startsWith('/history/')) return true;
		}
		if (href === '/overview') {
			if (pathname.startsWith('/block/')) return true;
		}
		return pathname === href || pathname.startsWith(href + '/');
	}, [pathname]);

	const docsActive = pathname?.startsWith('/docs') ?? false;

	// --- Renderização ---
	return (
		<header className="bg-white border-b border-gray-200 shadow-lg sticky top-0 z-50">
			<div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
				<div className="flex justify-between items-center py-4">

					{/* Logo (Design mais limpo) */}
					<Link href="/" className="flex items-center space-x-3 group">
						<div className="w-9 h-9 bg-blue-600 rounded-lg flex items-center justify-center transform group-hover:scale-105 transition-transform duration-300">
							<span className="text-white font-extrabold text-xl">₿</span>
						</div>
						<span className="text-gray-900 text-xl font-bold group-hover:text-blue-600 transition-colors duration-300">
							United Puzzle Pool
						</span>
					</Link>

					{/* Navegação Desktop */}
					<nav className="hidden md:flex space-x-1 items-center">
						{navItems.map((item) => {
							const Icon = item.icon;
							const active = isActive(item.href);
							const linkClass = active
								? 'flex items-center space-x-2 px-3 py-2.5 rounded-lg text-sm font-semibold bg-blue-50 text-blue-700 hover:bg-blue-100 transition-all duration-200'
								: 'flex items-center space-x-2 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-700 hover:text-blue-600 hover:bg-blue-50 transition-all duration-200';
							const iconClass = active ? 'text-blue-700' : 'text-blue-500';
							return (
								<Link
									key={item.href}
									href={item.href}
									className={linkClass}
								>
									<Icon size={18} className={iconClass} />
									<span>{item.label}</span>
								</Link>
							);
						})}

						{/* Dropdown de Documentação */}
						<div
							ref={docsRef}
							className="relative"
							onMouseEnter={handleMouseEnter}
							onMouseLeave={handleMouseLeave}
						>
							<button
								type="button"
								className={`${docsActive ? 'bg-blue-50 text-blue-700 font-semibold hover:bg-blue-100' : 'text-gray-700 hover:text-blue-600 hover:bg-blue-50 font-medium'} flex items-center space-x-2 px-3 py-2.5 rounded-lg text-sm transition-all duration-200`}
								onClick={() => setIsDocsOpen((v) => !v)}
							>
								<BookOpen size={18} className={docsActive ? 'text-blue-700' : 'text-blue-500'} />
								<span>Docs</span>
								<ChevronDown size={16} className={`transition-transform duration-300 ${isDocsOpen ? 'rotate-180' : ''} text-gray-500`} />
							</button>
							{/* Menu Dropdown com Transição */}
							<div
								className={`absolute right-0 mt-2 w-64 bg-white border border-gray-200 rounded-xl shadow-2xl py-2 z-50 transform origin-top-right transition-all duration-300 ease-in-out
                                ${isDocsOpen ? 'opacity-100 scale-100 visible' : 'opacity-0 scale-95 pointer-events-none'}`}
							>
								<div className='p-2'>
									{docItems.map((doc) => {
										const DocIcon = doc.icon;
										const docActive = isActive(doc.href);
										return (
											<Link
												key={doc.href}
												href={doc.href}
												className={`flex items-center gap-3 px-3 py-2 text-sm rounded-lg transition-colors duration-200 ${docActive ? 'bg-blue-50 text-blue-700 font-semibold' : 'text-gray-800 hover:bg-gray-100'}`}
												onClick={() => { setIsDocsOpen(false); }}
											>
												<DocIcon size={16} className={docActive ? 'text-blue-700' : 'text-blue-600'} />
												<span className='font-medium'>{doc.label}</span>
											</Link>
										)
									})}
								</div>
							</div>
						</div>
					</nav>

					{/* Mobile Menu Button */}
					<button
						onClick={toggleMenu}
						className="md:hidden p-2 rounded-md text-gray-700 hover:text-blue-600 hover:bg-gray-100 transition-colors duration-200"
					>
						{isMenuOpen ? <X size={24} /> : <Menu size={24} />}
					</button>
				</div>

				{/* Mobile Navigation (Slide Down) */}
				{/* Oculta o menu de Docs se o menu principal mobile estiver fechado */}
				{isMenuOpen && (
					<div className="md:hidden pb-4 transition-all duration-300 ease-in-out">
						<div className="flex flex-col space-y-2">
							{navItems.map((item) => {
								const Icon = item.icon;
								return (
									<Link
										key={item.href}
										href={item.href}
										className={`${isActive(item.href) ? 'bg-blue-50 text-blue-700 font-semibold hover:bg-blue-100' : 'text-gray-700 hover:text-blue-600 hover:bg-gray-100 font-medium'} flex items-center space-x-3 px-3 py-2 rounded-lg text-sm transition-colors duration-200`}
										onClick={toggleMenu}
									>
										<Icon size={18} className={isActive(item.href) ? 'text-blue-700' : 'text-blue-500'} />
										<span>{item.label}</span>
									</Link>
								);
							})}

							<div className="border-t border-gray-200 my-2" />

							{/* Itens de Documentação no Menu Mobile */}
							<div className="pt-1">
								<span className='text-xs font-semibold text-gray-500 px-3 pb-1 block'>Documentation</span>
								{docItems.map((doc) => {
									const DocIcon = doc.icon;
									return (
										<Link
											key={doc.href}
											href={doc.href}
											className="flex items-center space-x-3 text-gray-700 hover:text-blue-600 px-3 py-2 rounded-lg text-sm font-medium transition-colors duration-200 hover:bg-gray-100"
											onClick={toggleMenu}
										>
											<DocIcon size={18} className="text-blue-500" />
											<span>{doc.label}</span>
										</Link>
									)
								})}
							</div>

						</div>
					</div>
				)}
			</div>
		</header>
	);
}
