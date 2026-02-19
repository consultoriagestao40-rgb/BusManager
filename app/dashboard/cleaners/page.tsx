'use client';
import { useState, useEffect } from 'react';
import { Loader2, Plus, Trash2, Edit2, X, Check, AlertTriangle } from 'lucide-react';

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

    // Edit State
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editName, setEditName] = useState('');
    const [updating, setUpdating] = useState(false);

    // Delete State
    const [cleanerToDelete, setCleanerToDelete] = useState<Cleaner | null>(null);
    const [deleting, setDeleting] = useState(false);

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

    const startEdit = (cleaner: Cleaner) => {
        setEditingId(cleaner.id);
        setEditName(cleaner.name);
    };

    const cancelEdit = () => {
        setEditingId(null);
        setEditName('');
    };

    const saveEdit = async () => {
        if (!editName.trim() || !editingId) return;

        setUpdating(true);
        try {
            const res = await fetch('/api/cleaners', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: editingId, name: editName, active: true })
            });

            if (res.ok) {
                setEditingId(null);
                fetchCleaners();
            } else {
                alert('Erro ao atualizar colaborador');
            }
        } catch (error) {
            console.error(error);
        } finally {
            setUpdating(false);
        }
    };

    const confirmDelete = async () => {
        if (!cleanerToDelete) return;

        setDeleting(true);
        try {
            const res = await fetch(`/api/cleaners?id=${cleanerToDelete.id}`, {
                method: 'DELETE'
            });

            if (res.ok) {
                setCleanerToDelete(null);
                fetchCleaners();
            } else {
                alert('Erro ao excluir colaborador');
            }
        } catch (error) {
            console.error(error);
        } finally {
            setDeleting(false);
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
                                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Ações</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {cleaners.map((cleaner) => (
                                <tr key={cleaner.id}>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                        {editingId === cleaner.id ? (
                                            <input
                                                type="text"
                                                value={editName}
                                                onChange={(e) => setEditName(e.target.value)}
                                                className="w-full border rounded p-1"
                                                autoFocus
                                            />
                                        ) : (
                                            cleaner.name
                                        )}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${cleaner.active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                                            {cleaner.active ? 'Ativo' : 'Inativo'}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                        {editingId === cleaner.id ? (
                                            <div className="flex justify-end gap-2">
                                                <button
                                                    onClick={saveEdit}
                                                    disabled={updating}
                                                    className="text-green-600 hover:text-green-900"
                                                >
                                                    <Check size={18} />
                                                </button>
                                                <button
                                                    onClick={cancelEdit}
                                                    disabled={updating}
                                                    className="text-red-600 hover:text-red-900"
                                                >
                                                    <X size={18} />
                                                </button>
                                            </div>
                                        ) : (
                                            <div className="flex justify-end gap-3">
                                                <button
                                                    onClick={() => startEdit(cleaner)}
                                                    className="text-blue-600 hover:text-blue-900"
                                                >
                                                    <Edit2 size={18} />
                                                </button>
                                                <button
                                                    onClick={() => setCleanerToDelete(cleaner)}
                                                    className="text-red-600 hover:text-red-900"
                                                >
                                                    <Trash2 size={18} />
                                                </button>
                                            </div>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            {/* Delete Confirmation Modal */}
            {cleanerToDelete && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-lg p-6 max-w-sm w-full shadow-xl">
                        <h3 className="text-lg font-bold text-gray-900 mb-2 flex items-center gap-2">
                            <AlertTriangle className="text-red-500" />
                            Confirmar Exclusão
                        </h3>
                        <p className="text-gray-600 mb-6">
                            Tem certeza que deseja excluir <strong>{cleanerToDelete.name}</strong>?
                            <br />
                            <span className="text-xs text-gray-500 mt-1 block">
                                Se houver histórico, ele será apenas inativado.
                            </span>
                        </p>
                        <div className="flex justify-end gap-3">
                            <button
                                onClick={() => setCleanerToDelete(null)}
                                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={confirmDelete}
                                disabled={deleting}
                                className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
                            >
                                {deleting ? 'Excluindo...' : 'Excluir'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
