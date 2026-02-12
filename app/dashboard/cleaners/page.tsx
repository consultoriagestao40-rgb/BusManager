'use client';
import { useState, useEffect } from 'react';
import { Loader2, Plus, Trash2 } from 'lucide-react';

interface Cleaner {
    id: string;
    name: string;
    active: boolean;
}

export default function CleanersPage() {
    const [cleaners, setCleaners] = useState<Cleaner[]>([]);
    const [loading, setLoading] = useState(true);
    const [newName, setNewName] = useState('');
    const [adding, setAdding] = useState(false);

    const fetchCleaners = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/cleaners');
            if (res.ok) {
                const data = await res.json();
                setCleaners(data.cleaners);
            }
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchCleaners();
    }, []);

    const handleAdd = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newName.trim()) return;

        setAdding(true);
        try {
            const res = await fetch('/api/cleaners', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: newName })
            });

            if (res.ok) {
                setNewName('');
                fetchCleaners();
            } else {
                alert('Erro ao adicionar colaborador');
            }
        } catch (error) {
            console.error(error);
        } finally {
            setAdding(false);
        }
    };

    return (
        <div className="space-y-6">
            <h1 className="text-2xl font-bold text-gray-800">Colaboradores</h1>

            <div className="bg-white rounded shadow p-6">
                <form onSubmit={handleAdd} className="flex gap-4 mb-8">
                    <input
                        type="text"
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        placeholder="Nome do colaborador"
                        className="flex-1 rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 border p-2"
                    />
                    <button
                        type="submit"
                        disabled={adding || !newName.trim()}
                        className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
                    >
                        {adding ? <Loader2 className="animate-spin w-4 h-4" /> : <Plus className="w-4 h-4" />}
                        Adicionar
                    </button>
                </form>

                {loading ? (
                    <div className="flex justify-center p-8">
                        <Loader2 className="animate-spin h-8 w-8 text-blue-600" />
                    </div>
                ) : cleaners.length === 0 ? (
                    <p className="text-gray-500 text-center">Nenhum colaborador cadastrado.</p>
                ) : (
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead>
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nome</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                                {/* <th className="px-6 py-3 text-right">Ações</th> */}
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {cleaners.map((cleaner) => (
                                <tr key={cleaner.id}>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{cleaner.name}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${cleaner.active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                                            {cleaner.active ? 'Ativo' : 'Inativo'}
                                        </span>
                                    </td>
                                    {/* Actions like delete/deactivate can be added here */}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
}
