'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Upload, History, Users, Settings, LogOut, TrendingUp, ChevronLeft, ChevronRight } from 'lucide-react';
import { useRouter } from 'next/navigation';

export default function Sidebar() {
    const pathname = usePathname();
    const router = useRouter();
    const [isCollapsed, setIsCollapsed] = useState(true); // Default collapsed
    const [userRole, setUserRole] = useState<string | null>(null);

    useEffect(() => {
        fetch('/api/auth/me')
            .then((res) => {
                if (res.ok) return res.json();
                return null;
            })
            .then((data) => {
                if (data?.user) setUserRole(data.user.role);
            });
    }, []);

    const handleLogout = async () => {
        await fetch('/api/auth/logout', { method: 'POST' });
        router.push('/login');
    };

    const allMenuItems = [
        { name: 'Operação', href: '/dashboard', icon: Home, roles: ['ADMIN', 'OPERATOR', 'MANAGER', 'CLIENT'] },
        { name: 'Importar', href: '/dashboard/import', icon: Upload, roles: ['ADMIN', 'MANAGER'] },
        { name: 'KPIs', href: '/dashboard/kpi', icon: TrendingUp, roles: ['ADMIN', 'OPERATOR', 'MANAGER', 'CLIENT'] },
        { name: 'Histórico', href: '/dashboard/history', icon: History, roles: ['ADMIN', 'MANAGER', 'CLIENT'] },
        { name: 'Colaboradores', href: '/dashboard/cleaners', icon: Users, roles: ['ADMIN', 'OPERATOR', 'MANAGER'] },
        { name: 'Usuários', href: '/dashboard/users', icon: Settings, roles: ['ADMIN'] },
        { name: 'Configurações', href: '/dashboard/settings', icon: Settings, roles: ['ADMIN'] },
    ];

    // Filter menu based on role
    // If role is not loaded yet, show nothing or default (safe to show nothing)
    const menuItems = allMenuItems.filter(item => {
        if (!userRole) return false;
        return item.roles.includes(userRole);
    });

    if (!userRole) return null; // Or a skeleton
    return (
        <>
            {/* Mobile Overlay to close sidebar when clicking outside */}
            {!isCollapsed && (
                <div
                    className="fixed inset-0 bg-black/50 z-40 md:hidden"
                    onClick={() => setIsCollapsed(true)}
                />
            )}
            <div
                className={`relative h-screen flex flex-col bg-gray-900 text-white transition-all duration-300 z-50 ${isCollapsed ? 'w-16' : 'w-56'} ${!isCollapsed ? 'absolute md:relative h-full shadow-2xl md:shadow-none' : ''}`}
            >
                {/* Collapse Toggle Button */}
                <button
                    onClick={() => setIsCollapsed(!isCollapsed)}
                    className="absolute -right-3 top-1/2 transform -translate-y-1/2 bg-blue-600 text-white p-1 rounded-full shadow-lg hover:bg-blue-700 focus:outline-none z-50"
                >
                    {isCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
                </button>

                <div className={`flex items-center justify-center h-16 border-b border-gray-800 ${isCollapsed ? 'px-2' : 'px-4'}`}>
                    {isCollapsed ? (
                        <span className="text-xs font-bold text-center">BM</span>
                    ) : (
                        <img
                            src="https://grupojvsserv.com.br/wp-content/uploads/2023/11/logo-horizontal-300px.png"
                            alt="Grupo JVS"
                            className="h-8 w-auto object-contain"
                        />
                    )}
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
        </>
    );
}
