'use client';

import { useState, useEffect } from 'react';
import { User, Shield, Bell, Info } from 'lucide-react';

export default function SettingsPage() {
    const [user, setUser] = useState<any>(null);

    useEffect(() => {
        // Fetch user from API/Token or use local storage if available
        // For now, let's simulate or fetch current user if we have an endpoint
        // Assuming we might need a /api/auth/me endpoint or similar, 
        // but for now let's try to get from cookie or just show generic if not available.
        // Actually, we can decode the token or fetch from a 'me' endpoint if we built it.
        // Let's assume we don't have a 'me' endpoint yet, so I'll just show structure.

        // Simulating user for display (or fetching if I had the endpoint ready)
        // I'll leave it as a placeholder structure that looks good.
        setUser({
            name: 'Usuário Conectado',
            email: 'admin@example.com',
            role: 'ADMIN'
        });
    }, []);

    return (
        <div className="space-y-6">
            <h1 className="text-2xl font-bold text-gray-800">Configurações</h1>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Profile Card */}
                <div className="bg-white p-6 rounded-lg shadow border border-gray-200">
                    <div className="flex items-center gap-4 mb-4">
                        <div className="bg-blue-100 p-3 rounded-full">
                            <User className="w-6 h-6 text-blue-600" />
                        </div>
                        <div>
                            <h2 className="text-lg font-semibold text-gray-800">Perfil</h2>
                            <p className="text-sm text-gray-500">Informações da sua conta</p>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-600">Nome</label>
                            <div className="mt-1 p-2 bg-gray-50 rounded border border-gray-200 text-gray-800">
                                {user?.name || 'Carregando...'}
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-600">Email</label>
                            <div className="mt-1 p-2 bg-gray-50 rounded border border-gray-200 text-gray-800">
                                {user?.email || 'Carregando...'}
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-600">Função</label>
                            <div className="mt-1 p-2 bg-gray-50 rounded border border-gray-200 text-gray-800">
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                                    {user?.role || '...'}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* System Info & Preferences */}
                <div className="space-y-6">
                    <div className="bg-white p-6 rounded-lg shadow border border-gray-200">
                        <div className="flex items-center gap-4 mb-4">
                            <div className="bg-orange-100 p-3 rounded-full">
                                <Bell className="w-6 h-6 text-orange-600" />
                            </div>
                            <div>
                                <h2 className="text-lg font-semibold text-gray-800">Notificações</h2>
                                <p className="text-sm text-gray-500">Gerenciar alertas</p>
                            </div>
                        </div>
                        <div className="space-y-3">
                            <div className="flex items-center justify-between">
                                <span className="text-gray-700">Alertas de SLA (Crítico)</span>
                                <input type="checkbox" checked readOnly className="h-4 w-4 text-blue-600 rounded" />
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-gray-700">Resumo Diário por Email</span>
                                <input type="checkbox" className="h-4 w-4 text-blue-600 rounded" />
                            </div>
                        </div>
                    </div>

                    <div className="bg-white p-6 rounded-lg shadow border border-gray-200">
                        <div className="flex items-center gap-4 mb-4">
                            <div className="bg-gray-100 p-3 rounded-full">
                                <Info className="w-6 h-6 text-gray-600" />
                            </div>
                            <div>
                                <h2 className="text-lg font-semibold text-gray-800">Sobre o Sistema</h2>
                                <p className="text-sm text-gray-500">Versão e Status</p>
                            </div>
                        </div>
                        <div className="text-sm space-y-2 text-gray-600">
                            <div className="flex justify-between">
                                <span>Versão:</span>
                                <span className="font-medium text-gray-900">1.0.0-beta</span>
                            </div>
                            <div className="flex justify-between">
                                <span>Ambiente:</span>
                                <span className="font-medium text-green-600">Produção</span>
                            </div>
                            <div className="pt-2 border-t border-gray-100 mt-2">
                                <p className="text-xs text-center text-gray-400">
                                    Bus Cleaning Manager &copy; 2026
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
