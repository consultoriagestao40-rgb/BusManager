'use client';

import { useEffect, useState } from 'react';

export default function Header() {
    const [user, setUser] = useState<{ name: string; role: string } | null>(null);

    useEffect(() => {
        fetch('/api/auth/me')
            .then((res) => {
                if (res.ok) return res.json();
                return null;
            })
            .then((data) => {
                if (data?.user) setUser(data.user);
            });
    }, []);

    return (
        <header className="flex justify-between items-center py-4 px-6 bg-white border-b-4 border-blue-600 shadow-sm">
            <div className="flex items-center">
                {/* Breadcrumb or Title Stub */}
            </div>
            <div className="flex items-center space-x-4">
                {user ? (
                    <div className="text-right">
                        <div className="text-sm font-medium text-gray-900">{user.name}</div>
                        <div className="text-xs text-gray-500 uppercase">{user.role}</div>
                    </div>
                ) : (
                    <div className="h-8 w-32 bg-gray-200 rounded animate-pulse"></div>
                )}
                <div className="h-8 w-8 rounded-full bg-blue-500 text-white flex items-center justify-center font-bold">
                    {user?.name?.charAt(0) || 'U'}
                </div>
            </div>
        </header>
    );
}
