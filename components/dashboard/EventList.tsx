import { useState, useEffect } from 'react';
import { format, differenceInMinutes } from 'date-fns';
import { Bus, Search, Play, Check, RefreshCw, UserPlus } from 'lucide-react';

interface Event {
    id: string;
    vehicle: { client_vehicle_number: string; prefix?: string };
    hora_viagem: string;
    saida_programada_at: string;
    liberar_ate_at: string;
    status: string;
    swaps: any[];
    cleaner?: { name: string };
}

interface EventListProps {
    events: Event[];
}

export default function EventList({ events }: EventListProps) {
    const [now, setNow] = useState(new Date());
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('Todos');
    const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
    const [showMenu, setShowMenu] = useState<string | null>(null);
    const [processing, setProcessing] = useState(false);

    // Modal states
    const [startModalOpen, setStartModalOpen] = useState(false);
    const [finishModalOpen, setFinishModalOpen] = useState(false);
    const [swapModalOpen, setSwapModalOpen] = useState(false);
    const [colaboradorModalOpen, setColaboradorModalOpen] = useState(false);

    // Lists for modals
    const [cleaners, setCleaners] = useState<any[]>([]);
    const [selectedCleaner, setSelectedCleaner] = useState('');

    // State for actions
    const [swapVehicle, setSwapVehicle] = useState('');
    const [swapReason, setSwapReason] = useState('QUEBRA');
    const [swapObs, setSwapObs] = useState('');
    const [checkInterno, setCheckInterno] = useState(false);
    const [checkExterno, setCheckExterno] = useState(false);
    const [checkPneus, setCheckPneus] = useState(false);
    const [finishObs, setFinishObs] = useState('');

    useEffect(() => {
        const timer = setInterval(() => setNow(new Date()), 60000); // Update every minute
        fetchCleaners();
        return () => clearInterval(timer);
    }, []);

    const fetchCleaners = async () => {
        try {
            const res = await fetch('/api/cleaners');
            if (res.ok) {
                const data = await res.json();
                setCleaners(data.cleaners);
            }
        } catch (e) {
            console.error(e);
        }
    };

    const handleActionTrigger = (event: Event, action: string) => {
        setSelectedEvent(event);
        setShowMenu(null);
        if (action === 'start') setStartModalOpen(true);
        if (action === 'finish') {
            setCheckInterno(false);
            setCheckExterno(false);
            setCheckPneus(false);
            setFinishObs('');
            setFinishModalOpen(true);
        }
        if (action === 'swap') {
            setSwapVehicle('');
            setSwapReason('QUEBRA');
            setSwapObs('');
            setSwapModalOpen(true);
        }
        if (action === 'addColaborador') setColaboradorModalOpen(true);
    };

    const handleActionExecute = async (action: string, data?: any) => {
        if (!selectedEvent || processing) return;
        setProcessing(true);

        try {
            let url = `/api/events/${selectedEvent.id}/${action}`;
            let method = 'POST';
            let body = data ? JSON.stringify(data) : undefined;

            const res = await fetch(url, {
                method,
                headers: body ? { 'Content-Type': 'application/json' } : undefined,
                body
            });

            if (res.ok) {
                window.location.reload();
            } else {
                alert('Erro ao processar ação');
            }
        } catch (e) {
            console.error(e);
            alert('Erro de conexão');
        } finally {
            setProcessing(false);
        }
    };

    const getSlaStatus = (event: Event): 'expired' | 'critical' | 'warning' | 'normal' => {
        if (event.status === 'CONCLUIDO') return 'normal';
        const diff = differenceInMinutes(new Date(event.liberar_ate_at), now);
        if (diff < 0) return 'expired';
        if (diff < 15) return 'critical';
        if (diff < 30) return 'warning';
        return 'normal';
    };

    const filteredEvents = events.filter((event) => {
        const matchesSearch = event.vehicle.client_vehicle_number.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesStatus = statusFilter === 'Todos' || event.status === statusFilter;
        return matchesSearch && matchesStatus;
    });

    return (
        <div className="flex flex-col min-h-screen bg-gray-50">
            {/* Header Dark */}
            <header className="bg-[#1A1A1A] text-white py-4 px-6 md:py-6 shadow-md sticky top-0 z-40">
                <h1 className="text-xl md:text-2xl font-bold text-center tracking-widest uppercase">
                    Escala de Limpeza
                </h1>
            </header>

            {/* Sticky Filters Section */}
            <div className="sticky top-[60px] md:top-[80px] z-30 bg-white border-b border-gray-200 px-4 py-3 shadow-sm">
                <div className="max-w-4xl mx-auto flex flex-col md:flex-row gap-3">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                        <input
                            type="text"
                            placeholder="Pesquisar..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                    </div>
                    <select
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                        className="px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-[140px]"
                    >
                        <option value="Todos">Todos</option>
                        <option value="PREVISTO">Previsto</option>
                        <option value="EM_ANDAMENTO">Em Andamento</option>
                        <option value="CONCLUIDO">Concluído</option>
                        <option value="CANCELADO">Cancelado</option>
                    </select>
                </div>
            </div>

            {/* Table Content */}
            <div className="flex-1 overflow-x-auto">
                <table className="w-full border-collapse bg-white">
                    <thead className="bg-gray-100 border-b border-gray-200 sticky top-[120px] md:top-[140px] z-20">
                        <tr>
                            <th className="px-4 py-3 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">Número do Carro</th>
                            <th className="px-4 py-3 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">Hora de Saída</th>
                            <th className="px-4 py-3 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">Meta H-1</th>
                            <th className="px-4 py-3 text-center text-xs font-bold text-gray-600 uppercase tracking-wider">Ações</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {filteredEvents.map((event) => {
                            const sla = getSlaStatus(event);
                            const isCancelled = event.status === 'CANCELADO';
                            const isCompleted = event.status === 'CONCLUIDO';
                            const isInProgress = event.status === 'EM_ANDAMENTO';

                            return (
                                <tr key={event.id} className={`hover:bg-gray-50 transition-colors ${isCancelled ? 'opacity-60' : ''}`}>
                                    <td className="px-4 py-4">
                                        <div className="flex flex-col">
                                            <span className={`font-semibold text-gray-900 ${isCancelled ? 'line-through' : ''}`}>
                                                {event.vehicle.client_vehicle_number}
                                            </span>
                                            {event.vehicle.prefix && (
                                                <span className="text-[10px] text-gray-500 font-medium uppercase">{event.vehicle.prefix}</span>
                                            )}
                                        </div>
                                    </td>
                                    <td className="px-4 py-4">
                                        <span className="text-sm font-medium text-gray-700">
                                            {format(new Date(event.saida_programada_at), 'HH:mm')}
                                        </span>
                                    </td>
                                    <td className="px-4 py-4 uppercase">
                                        <div className="flex flex-col">
                                            <span className="text-sm font-bold text-gray-800">
                                                {format(new Date(event.liberar_ate_at), 'HH:mm')}
                                            </span>
                                            {!isCompleted && !isCancelled && sla === 'expired' && (
                                                <span className="text-[10px] text-red-600 font-extrabold mt-0.5">ESTOURADO</span>
                                            )}
                                        </div>
                                    </td>
                                    <td className="px-4 py-4 text-center">
                                        {!isCancelled && (
                                            <div className="relative inline-block">
                                                <button
                                                    onClick={() => setShowMenu(showMenu === event.id ? null : event.id)}
                                                    className={`p-2 rounded-full transition-all ${showMenu === event.id ? 'bg-blue-600 text-white shadow-md scale-110' : 'text-blue-600 hover:bg-blue-50'}`}
                                                >
                                                    <Bus className="w-6 h-6" />
                                                </button>

                                                {/* Action Popover */}
                                                {showMenu === event.id && (
                                                    <div className="absolute right-0 bottom-full mb-3 md:top-full md:mt-2 w-56 bg-white rounded-xl shadow-2xl border border-gray-100 z-50 overflow-hidden animate-in fade-in zoom-in duration-200 origin-bottom-right">
                                                        <div className="p-1">
                                                            {event.status === 'PREVISTO' && (
                                                                <button
                                                                    onClick={() => handleActionTrigger(event, 'start')}
                                                                    className="w-full text-left px-4 py-3 hover:bg-blue-50 flex items-center gap-3 rounded-lg text-sm font-semibold text-gray-700 transition-colors"
                                                                >
                                                                    <Play className="w-4 h-4 text-blue-600" /> Iniciar Limpeza
                                                                </button>
                                                            )}
                                                            {isInProgress && (
                                                                <button
                                                                    onClick={() => handleActionTrigger(event, 'finish')}
                                                                    className="w-full text-left px-4 py-3 hover:bg-green-50 flex items-center gap-3 rounded-lg text-sm font-semibold text-gray-700 transition-colors"
                                                                >
                                                                    <Check className="w-4 h-4 text-green-600" /> Finalizar Limpeza
                                                                </button>
                                                            )}
                                                            {!isCompleted && (
                                                                <>
                                                                    <button
                                                                        onClick={() => handleActionTrigger(event, 'swap')}
                                                                        className="w-full text-left px-4 py-3 hover:bg-orange-50 flex items-center gap-3 rounded-lg text-sm font-semibold text-gray-700 transition-colors"
                                                                    >
                                                                        <RefreshCw className="w-4 h-4 text-orange-600" /> Fazer Troca
                                                                    </button>
                                                                    <button
                                                                        onClick={() => handleActionTrigger(event, 'addColaborador')}
                                                                        className="w-full text-left px-4 py-3 hover:bg-purple-50 flex items-center gap-3 rounded-lg text-sm font-semibold text-gray-700 transition-colors"
                                                                    >
                                                                        <UserPlus className="w-4 h-4 text-purple-600" /> Colaboradores
                                                                    </button>
                                                                </>
                                                            )}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            {/* Modals Section */}
            {startModalOpen && selectedEvent && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-[100] animate-in fade-in duration-300">
                    <div className="bg-white rounded-2xl p-6 md:p-8 max-w-md w-full shadow-2xl max-h-[90vh] overflow-y-auto">
                        <h3 className="text-xl font-bold mb-2 text-gray-900">Iniciar Limpeza</h3>
                        <p className="text-gray-500 mb-6 text-sm">Selecione o encarregado para o carro <span className="font-bold text-blue-600">{selectedEvent.vehicle.client_vehicle_number}</span>.</p>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5">Encarregado</label>
                                <select
                                    value={selectedCleaner}
                                    onChange={(e) => setSelectedCleaner(e.target.value)}
                                    className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                                >
                                    <option value="">Selecione um encarregado</option>
                                    {cleaners.map(c => (
                                        <option key={c.id} value={c.id}>{c.name}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        <div className="flex gap-3 mt-8">
                            <button
                                onClick={() => setStartModalOpen(false)}
                                className="flex-1 py-3 text-gray-500 font-bold hover:bg-gray-50 rounded-xl transition-colors"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={() => handleActionExecute('start', { cleanerId: selectedCleaner })}
                                disabled={!selectedCleaner || processing}
                                className="flex-[2] py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 disabled:opacity-50 shadow-lg shadow-blue-200"
                            >
                                {processing ? 'Processando...' : 'Confirmar'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {swapModalOpen && selectedEvent && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-[100] animate-in fade-in duration-300">
                    <div className="bg-white rounded-2xl p-6 md:p-8 max-w-md w-full shadow-2xl max-h-[90vh] overflow-y-auto">
                        <h3 className="text-xl font-bold mb-6 text-gray-900">Trocar Veículo</h3>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5">Novo Número</label>
                                <input
                                    type="text"
                                    value={swapVehicle}
                                    onChange={(e) => setSwapVehicle(e.target.value)}
                                    placeholder="Ex: 62005"
                                    className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5">Motivo</label>
                                <select
                                    value={swapReason}
                                    onChange={(e) => setSwapReason(e.target.value)}
                                    className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                                >
                                    <option value="QUEBRA">Quebra</option>
                                    <option value="RODIZIO">Rodízio</option>
                                    <option value="RESERVA">Carro Reserva</option>
                                    <option value="OUTRO">Outro</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5">Observações</label>
                                <textarea
                                    value={swapObs}
                                    onChange={(e) => setSwapObs(e.target.value)}
                                    rows={3}
                                    className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none resize-none"
                                />
                            </div>
                        </div>

                        <div className="flex gap-3 mt-8">
                            <button
                                onClick={() => setSwapModalOpen(false)}
                                className="flex-1 py-3 text-gray-500 font-bold hover:bg-gray-50 rounded-xl transition-colors"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={() => handleActionExecute('swap', { replacementVehicle: swapVehicle, reason: swapReason, observation: swapObs })}
                                disabled={!swapVehicle || processing}
                                className="flex-[2] py-3 bg-orange-600 text-white font-bold rounded-xl hover:bg-orange-700 disabled:opacity-50 shadow-lg shadow-orange-200"
                            >
                                {processing ? 'Trocando...' : 'Trocar Carro'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {finishModalOpen && selectedEvent && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-[100] animate-in fade-in duration-300">
                    <div className="bg-white rounded-2xl p-6 md:p-8 max-w-md w-full shadow-2xl max-h-[90vh] overflow-y-auto">
                        <h3 className="text-xl font-bold mb-4 text-gray-900">Finalizar Limpeza</h3>

                        <div className="space-y-4">
                            <label className="flex items-center gap-3 p-4 bg-gray-50 rounded-xl cursor-pointer hover:bg-gray-100 transition-colors">
                                <input type="checkbox" checked={checkInterno} onChange={(e) => setCheckInterno(e.target.checked)} className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                                <span className="text-sm font-semibold text-gray-700">Limpeza Interna OK</span>
                            </label>
                            <label className="flex items-center gap-3 p-4 bg-gray-50 rounded-xl cursor-pointer hover:bg-gray-100 transition-colors">
                                <input type="checkbox" checked={checkExterno} onChange={(e) => setCheckExterno(e.target.checked)} className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                                <span className="text-sm font-semibold text-gray-700">Limpeza Externa OK</span>
                            </label>
                            <label className="flex items-center gap-3 p-4 bg-gray-50 rounded-xl cursor-pointer hover:bg-gray-100 transition-colors">
                                <input type="checkbox" checked={checkPneus} onChange={(e) => setCheckPneus(e.target.checked)} className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                                <span className="text-sm font-semibold text-gray-700">Calibragem Pneus OK</span>
                            </label>

                            <div>
                                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5 mt-2">Observações Adicionais</label>
                                <textarea
                                    value={finishObs}
                                    onChange={(e) => setFinishObs(e.target.value)}
                                    placeholder="Caso falte algo, descreva aqui..."
                                    rows={2}
                                    className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none resize-none"
                                />
                            </div>
                        </div>

                        <div className="flex gap-3 mt-8">
                            <button
                                onClick={() => setFinishModalOpen(false)}
                                className="flex-1 py-3 text-gray-500 font-bold hover:bg-gray-50 rounded-xl transition-colors"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={() => handleActionExecute('finish', { observation: finishObs })}
                                disabled={processing}
                                className="flex-[2] py-3 bg-green-600 text-white font-bold rounded-xl hover:bg-green-700 disabled:opacity-50 shadow-lg shadow-green-200"
                            >
                                {processing ? 'Finalizando...' : 'Finalizar'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {colaboradorModalOpen && selectedEvent && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-[100] animate-in fade-in duration-300">
                    <div className="bg-white rounded-2xl p-6 md:p-8 max-w-md w-full shadow-2xl max-h-[90vh] overflow-y-auto">
                        <h3 className="text-xl font-bold mb-6 text-gray-900">Adicionar Colaborador</h3>
                        <p className="text-sm text-gray-500 mb-4">Recurso em desenvolvimento...</p>
                        <button
                            onClick={() => setColaboradorModalOpen(false)}
                            className="w-full py-3 bg-gray-100 text-gray-700 font-bold rounded-xl hover:bg-gray-200 transition-colors"
                        >
                            Fechar
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
