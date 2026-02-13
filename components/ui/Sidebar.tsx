'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Upload, History, Users, Settings, LogOut, TrendingUp, ChevronLeft, ChevronRight } from 'lucide-react';
import { useRouter } from 'next/navigation';

export default function Sidebar() {
    const pathname = usePathname();
    const router = useRouter();
    const [isCollapsed, setIsCollapsed] = useState(false);

    const handleLogout = async () => {
        await fetch('/api/auth/logout', { method: 'POST' });
        router.push('/login');
    };

    const menuItems = [
        { name: 'Operação', href: '/dashboard', icon: Home },
        { name: 'Importar', href: '/dashboard/import', icon: Upload },
        { name: 'KPIs', href: '/dashboard/kpi', icon: TrendingUp },
        { name: 'Histórico', href: '/dashboard/history', icon: History },
        { name: 'Colaboradores', href: '/dashboard/cleaners', icon: Users },
        { name: 'Usuários', href: '/dashboard/users', icon: Settings },
        { name: 'Configurações', href: '/dashboard/settings', icon: Settings },
    ];

    return (
        <div
            className={`relative flex flex-col bg-gray-900 text-white transition-all duration-300 ${isCollapsed ? 'w-16' : 'w-56'}`}
        >
            {/* Collapse Toggle Button */}
            <button
                onClick={() => setIsCollapsed(!isCollapsed)}
                className="absolute -right-3 top-1/2 transform -translate-y-1/2 bg-blue-600 text-white p-1 rounded-full shadow-lg hover:bg-blue-700 focus:outline-none z-10"
            >
                {isCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
            </button>

            <div className={`flex items-center justify-center h-16 border-b border-gray-800 ${isCollapsed ? 'px-2' : ''}`}>
                <span className={`font-bold transition-all duration-300 ${isCollapsed ? 'text-xs text-center' : 'text-xl'}`}>
                    {isCollapsed ? 'BM' : 'BusManager'}
                </span>
            </div>

            <nav className="flex-1 px-2 py-4 space-y-2 overflow-y-auto">
                {menuItems.map((item) => {
                    const Icon = item.icon;
                    const isActive = pathname === item.href;
                    return (
                        <Link
                            key={item.name}
                            href={item.href}
                            title={isCollapsed ? item.name : ''}
                            className={`flex items-center px-4 py-2 text-sm font-medium rounded-md transition-colors ${isActive
                                ? 'bg-gray-800 text-white'
                                : 'text-gray-300 hover:bg-gray-800 hover:text-white'
                                } ${isCollapsed ? 'justify-center' : ''}`}
                        >
                            <Icon className={`${isCollapsed ? 'h-6 w-6' : 'mr-3 h-5 w-5'}`} />
                            {!isCollapsed && <span>{item.name}</span>}
                        </Link>
                    );
                })}
            </nav>

            <div className="p-4 border-t border-gray-800">
                <button
                    onClick={handleLogout}
                    title={isCollapsed ? 'Sair' : ''}
                    className={`flex w-full items-center px-4 py-2 text-sm font-medium text-gray-300 hover:bg-gray-800 hover:text-white rounded-md ${isCollapsed ? 'justify-center' : ''}`}
                >
                    <LogOut className={`${isCollapsed ? 'h-6 w-6' : 'mr-3 h-5 w-5'}`} />
                    {!isCollapsed && <span>Sair</span>}
                </button>
            </div>
        </div>
    );
}
