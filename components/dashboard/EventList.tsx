import { useState, useEffect } from 'react';
import { format, differenceInMinutes } from 'date-fns';
import { Bus, Search } from 'lucide-react';

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
    const [cleaners, setCleaners] = useState<any[]>([]);
    const [selectedCleaner, setSelectedCleaner] = useState('');

    // Finish modal
    const [checkInterno, setCheckInterno] = useState(false);
    const [checkExterno, setCheckExterno] = useState(false);
    const [checkPneus, setCheckPneus] = useState(false);
    const [finishObs, setFinishObs] = useState('');

    // Swap modal
    const [swapVehicle, setSwapVehicle] = useState('');
    const [swapReason, setSwapReason] = useState('QUEBRA');
    const [swapObs, setSwapObs] = useState('');

    useEffect(() => {
        const timer = setInterval(() => setNow(new Date()), 60000);
        fetchCleaners();
        requestNotificationPermission();
        return () => clearInterval(timer);
    }, []);

    useEffect(() => {
        // Check for overdue events and send notifications
        events.forEach(event => {
            const sla = getSlaStatus(event);
            if (sla === 'expired' && event.status !== 'CONCLUIDO' && event.status !== 'CANCELADO') {
                sendOverdueNotification(event);
            }
        });
    }, [events]);

    const requestNotificationPermission = async () => {
        if ('Notification' in window && Notification.permission === 'default') {
            await Notification.requestPermission();
        }
    };

    const sendOverdueNotification = async (event: Event) => {
        if ('Notification' in window && Notification.permission === 'granted') {
            try {
                const registration = await navigator.serviceWorker.ready;
                registration.showNotification('⚠️ SLA Estourado!', {
                    body: `Veículo ${event.vehicle.client_vehicle_number} está atrasado`,
                    icon: '/icons/icon-192x192.png',
                    badge: '/icons/icon-192x192.png',
                    tag: `overdue-${event.id}`,
                    requireInteraction: true,
                    data: { eventId: event.id }
                });
            } catch (error) {
                console.error('Push notification error:', error);
            }
        }
    };

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

    const getSlaStatus = (event: Event): 'expired' | 'critical' | 'warning' | 'normal' | 'completed' => {
        if (event.status === 'CONCLUIDO') return 'completed';
        const diff = differenceInMinutes(new Date(event.liberar_ate_at), now);
        if (diff < 0) return 'expired';
        if (diff < 15) return 'critical';
        if (diff < 30) return 'warning';
        return 'normal';
    };

    const getRowBackgroundColor = (sla: string, status: string) => {
        if (status === 'CANCELADO') return 'bg-gray-50 opacity-60';
        if (status === 'CONCLUIDO') return 'bg-green-50';
        if (status === 'EM_ANDAMENTO') return 'bg-blue-50';
        if (sla === 'expired') return 'bg-red-50 border-l-4 border-red-500';
        if (sla === 'critical') return 'bg-orange-50 border-l-4 border-orange-500';
        if (sla === 'warning') return 'bg-yellow-50 border-l-4 border-yellow-400';
        return 'bg-white hover:bg-gray-50';
    };

    const getStatusBadge = (status: string) => {
        const styles = {
            'CONCLUIDO': 'bg-green-100 text-green-800',
            'EM_ANDAMENTO': 'bg-blue-100 text-blue-800',
            'CANCELADO': 'bg-gray-100 text-gray-500 line-through',
            'PREVISTO': 'bg-gray-100 text-gray-700'
        };
        return styles[status as keyof typeof styles] || 'bg-gray-100 text-gray-700';
    };

    const handleAction = async (event: Event, action: 'start' | 'finish' | 'swap' | 'addColaborador') => {
        setSelectedEvent(event);
        setShowMenu(null);

        switch (action) {
            case 'start':
                setStartModalOpen(true);
                break;
            case 'finish':
                setFinishModalOpen(true);
                break;
            case 'swap':
                setSwapModalOpen(true);
                break;
            case 'addColaborador':
                // Open collaborator modal (same as start for now)
                setStartModalOpen(true);
                break;
        }
    };

    const handleStartSubmit = async () => {
        if (!selectedEvent || !selectedCleaner) return;
        setProcessing(true);
        try {
            const res = await fetch(`/api/events/${selectedEvent.id}/start`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ cleaner_id: selectedCleaner })
            });
            if (res.ok) {
                setStartModalOpen(false);
                setSelectedEvent(null);
                setSelectedCleaner('');
                window.location.reload();
            }
        } catch (e) {
            console.error(e);
        }
        setProcessing(false);
    };

    const handleFinishSubmit = async () => {
        if (!selectedEvent) return;
        if (!checkInterno || !checkExterno || !checkPneus) {
            if (!finishObs.trim()) {
                alert('Por favor, justifique o item não realizado');
                return;
            }
        }
        setProcessing(true);
        try {
            const res = await fetch(`/api/events/${selectedEvent.id}/finish`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    check_interno: checkInterno,
                    check_externo: checkExterno,
                    check_pneus: checkPneus,
                    observacao: finishObs
                })
            });
            if (res.ok) {
                setFinishModalOpen(false);
                setSelectedEvent(null);
                setCheckInterno(false);
                setCheckExterno(false);
                setCheckPneus(false);
                setFinishObs('');
                window.location.reload();
            }
        } catch (e) {
            console.error(e);
        }
        setProcessing(false);
    };

    const handleSwapSubmit = async () => {
        if (!selectedEvent || !swapVehicle) return;
        setProcessing(true);
        try {
            const res = await fetch(`/api/events/${selectedEvent.id}/swap`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    new_vehicle: swapVehicle,
                    reason: swapReason,
                    observacao: swapObs
                })
            });
            if (res.ok) {
                setSwapModalOpen(false);
                setSelectedEvent(null);
                setSwapVehicle('');
                setSwapObs('');
                window.location.reload();
            }
        } catch (e) {
            console.error(e);
        }
        setProcessing(false);
    };

    // Filter events
    const filteredEvents = events.filter(event => {
        const matchesSearch = event.vehicle.client_vehicle_number.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesStatus = statusFilter === 'Todos' || event.status === statusFilter;
        return matchesSearch && matchesStatus;
    });

    return (
        <>
            {/* Dark Header - Sticky */}
            <div className="sticky top-0 z-50 bg-[#1A1A1A] text-white py-4 px-4 shadow-lg">
                <h1 className="text-xl md:text-2xl font-bold text-center tracking-wide">ESCALA DE LIMPEZA</h1>
            </div>

            {/* Filters Section */}
            <div className="bg-white border-b border-gray-200 p-3 md:p-4 sticky top-[60px] z-40 shadow-sm">
                <div className="flex flex-col md:flex-row gap-3">
                    {/* Search */}
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                        <input
                            type="search"
                            placeholder="Pesquisar..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                    </div>
                    {/* Status Filter */}
                    <select
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                        className="px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white min-w-[150px]"
                    >
                        <option>Todos</option>
                        <option>PREVISTO</option>
                        <option>EM_ANDAMENTO</option>
                        <option>CONCLUIDO</option>
                        <option>CANCELADO</option>
                    </select>
                </div>
            </div>

            {/* Table Container */}
            <div className="overflow-x-auto">
                <table className="w-full min-w-full border-collapse">
                    {/* Simplified Header - 4 columns */}
                    <thead className="bg-gray-50 border-b-2 border-gray-200">
                        <tr>
                            <th className="py-3 px-3 md:px-4 text-left text-xs md:text-sm font-bold text-gray-700 uppercase">Número do Carro</th>
                            <th className="py-3 px-3 md:px-4 text-left text-xs md:text-sm font-bold text-gray-700 uppercase">Hora de Saída</th>
                            <th className="py-3 px-3 md:px-4 text-left text-xs md:text-sm font-bold text-gray-700 uppercase">Meta H-1</th>
                            <th className="py-3 px-3 md:px-4 text-center text-xs md:text-sm font-bold text-gray-700 uppercase">Ações</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredEvents.map((event) => {
                            const sla = getSlaStatus(event);
                            return (
                                <tr
                                    key={event.id}
                                    className={`${getRowBackgroundColor(sla, event.status)} transition-colors border-b`}
                                >
                                    {/* Número do Carro */}
                                    <td className="py-4 px-3 md:px-4">
                                        <div className="flex flex-col">
                                            <span className={`text-base md:text-lg font-bold ${event.status === 'CANCELADO' ? 'line-through text-gray-400' : 'text-gray-900'}`}>
                                                {event.vehicle.client_vehicle_number}
                                            </span>
                                            {event.vehicle.prefix && (
                                                <span className="text-xs text-gray-500 mt-1">{event.vehicle.prefix}</span>
                                            )}
                                        </div>
                                    </td>

                                    {/* Hora de Saída */}
                                    <td className="py-4 px-3 md:px-4">
                                        <span className="text-sm md:text-base text-gray-700 font-medium">
                                            {format(new Date(event.saida_programada_at), 'HH:mm')}
                                        </span>
                                    </td>

                                    {/* Meta H-1 */}
                                    <td className="py-4 px-3 md:px-4">
                                        <div className="flex flex-col">
                                            <span className="text-sm md:text-base text-gray-700 font-medium">
                                                {format(new Date(event.liberar_ate_at), 'HH:mm')}
                                            </span>
                                            {sla === 'expired' && event.status !== 'CONCLUIDO' && (
                                                <span className="text-xs text-red-600 font-bold mt-1">ESTOURADO</span>
                                            )}
                                        </div>
                                    </td>

                                    {/* Ações - Bus Icon with Popover */}
                                    <td className="py-4 px-3 md:px-4 text-center relative">
                                        {event.status !== 'CANCELADO' && (
                                            <div className="relative inline-block">
                                                <button
                                                    onClick={() => setShowMenu(showMenu === event.id ? null : event.id)}
                                                    className="p-2 hover:bg-blue-100 rounded-lg transition-colors"
                                                    title="Ações"
                                                >
                                                    <Bus className="w-6 h-6 md:w-7 md:h-7 text-blue-600" />
                                                </button>

                                                {/* Popover Menu */}
                                                {showMenu === event.id && (
                                                    <div className="absolute right-0 mt-2 w-56 bg-white rounded-lg shadow-xl border border-gray-200 z-50">
                                                        <div className="py-2">
                                                            {event.status === 'PREVISTO' && (
                                                                <button
                                                                    onClick={() => handleAction(event, 'start')}
                                                                    className="w-full text-left px-4 py-3 hover:bg-blue-50 text-sm font-medium text-gray-700 flex items-center gap-2"
                                                                >
                                                                    <span className="text-blue-600">▶</span> Iniciar
                                                                </button>
                                                            )}
                                                            {event.status === 'EM_ANDAMENTO' && (
                                                                <button
                                                                    onClick={() => handleAction(event, 'finish')}
                                                                    className="w-full text-left px-4 py-3 hover:bg-green-50 text-sm font-medium text-gray-700 flex items-center gap-2"
                                                                >
                                                                    <span className="text-green-600">✓</span> Finalizar
                                                                </button>
                                                            )}
                                                            {event.status !== 'CONCLUIDO' && (
                                                                <>
                                                                    <button
                                                                        onClick={() => handleAction(event, 'swap')}
                                                                        className="w-full text-left px-4 py-3 hover:bg-orange-50 text-sm font-medium text-gray-700 flex items-center gap-2"
                                                                    >
                                                                        <span className="text-orange-600">⇄</span> Fazer Troca
                                                                    </button>
                                                                    <button
                                                                        onClick={() => handleAction(event, 'addColaborador')}
                                                                        className="w-full text-left px-4 py-3 hover:bg-purple-50 text-sm font-medium text-gray-700 flex items-center gap-2"
                                                                    >
                                                                        <span className="text-purple-600">+</span> Adicionar Colaboradores
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

            {/* Modals - Start */}
            {startModalOpen && selectedEvent && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50 overflow-y-auto">
                    <div className="bg-white rounded-lg p-4 md:p-6 max-w-md w-full my-4 max-h-[90vh] overflow-y-auto">
                        <h3 className="text-lg font-bold mb-4">Iniciar Limpeza</h3>
                        <p className="mb-4">Selecione o Colaborador para o veículo <span className="font-bold">{selectedEvent.vehicle.client_vehicle_number}</span></p>

                        <div className="mb-6">
                            <label className="block text-sm font-medium text-gray-700 mb-2">Colaborador</label>
                            <select
                                className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 border p-2"
                                value={selectedCleaner}
                                onChange={(e) => setSelectedCleaner(e.target.value)}
                            >
                                <option value="">Selecione...</option>
                                {cleaners.map((c) => (
                                    <option key={c.id} value={c.id}>{c.name}</option>
                                ))}
                            </select>
                        </div>

                        <div className="flex justify-end space-x-3">
                            <button
                                onClick={() => setStartModalOpen(false)}
                                className="px-4 py-2 border rounded text-gray-600 hover:bg-gray-50"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleStartSubmit}
                                disabled={processing || !selectedCleaner}
                                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                            >
                                {processing ? 'Iniciando...' : 'Confirmar Início'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal - Swap */}
            {swapModalOpen && selectedEvent && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50 overflow-y-auto">
                    <div className="bg-white rounded-lg p-4 md:p-6 max-w-md w-full my-4 max-h-[90vh] overflow-y-auto">
                        <h3 className="text-lg font-bold mb-4">Trocar Veículo</h3>
                        <p className="mb-4">Veículo Atual: <span className="font-bold">{selectedEvent.vehicle.client_vehicle_number}</span></p>

                        <div className="space-y-4 mb-6">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Novo Veículo</label>
                                <input
                                    type="text"
                                    className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 border p-2"
                                    value={swapVehicle}
                                    onChange={(e) => setSwapVehicle(e.target.value)}
                                    placeholder="Ex: 1234"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Motivo</label>
                                <select
                                    className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 border p-2"
                                    value={swapReason}
                                    onChange={(e) => setSwapReason(e.target.value)}
                                >
                                    <option value="QUEBRA">Quebra</option>
                                    <option value="MANUT">Manutenção</option>
                                    <option value="OUTROS">Outros</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Observação</label>
                                <textarea
                                    className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 border p-2"
                                    rows={3}
                                    value={swapObs}
                                    onChange={(e) => setSwapObs(e.target.value)}
                                />
                            </div>
                        </div>

                        <div className="flex justify-end space-x-3">
                            <button
                                onClick={() => setSwapModalOpen(false)}
                                className="px-4 py-2 border rounded text-gray-600 hover:bg-gray-50"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleSwapSubmit}
                                disabled={processing || !swapVehicle}
                                className="px-4 py-2 bg-orange-600 text-white rounded hover:bg-orange-700 disabled:opacity-50"
                            >
                                {processing ? 'Trocando...' : 'Confirmar Troca'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal - Finish */}
            {finishModalOpen && selectedEvent && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50 overflow-y-auto">
                    <div className="bg-white rounded-lg p-4 md:p-6 max-w-md w-full my-4 max-h-[90vh] overflow-y-auto">
                        <h3 className="text-lg font-bold mb-4">Finalizar Limpeza</h3>
                        <p className="mb-4">Confirme os itens realizados no veículo <span className="font-bold">{selectedEvent.vehicle.client_vehicle_number}</span></p>

                        <div className="space-y-4 mb-6">
                            <div className="flex items-center space-x-3 p-3 border rounded hover:bg-gray-50 cursor-pointer" onClick={() => setCheckExterno(!checkExterno)}>
                                <div className={`w-6 h-6 rounded border flex items-center justify-center ${checkExterno ? 'bg-green-500 border-green-500 text-white' : 'border-gray-300'}`}>
                                    {checkExterno && '✓'}
                                </div>
                                <span className="text-gray-700 font-medium select-none">Limpeza Externa</span>
                            </div>

                            <div className="flex items-center space-x-3 p-3 border rounded hover:bg-gray-50 cursor-pointer" onClick={() => setCheckInterno(!checkInterno)}>
                                <div className={`w-6 h-6 rounded border flex items-center justify-center ${checkInterno ? 'bg-green-500 border-green-500 text-white' : 'border-gray-300'}`}>
                                    {checkInterno && '✓'}
                                </div>
                                <span className="text-gray-700 font-medium select-none">Limpeza Interna</span>
                            </div>

                            <div className="flex items-center space-x-3 p-3 border rounded hover:bg-gray-50 cursor-pointer" onClick={() => setCheckPneus(!checkPneus)}>
                                <div className={`w-6 h-6 rounded border flex items-center justify-center ${checkPneus ? 'bg-green-500 border-green-500 text-white' : 'border-gray-300'}`}>
                                    {checkPneus && '✓'}
                                </div>
                                <span className="text-gray-700 font-medium select-none">Pretinho nos Pneus</span>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Observação {(checkInterno && checkExterno && checkPneus) ? '(Opcional)' : <span className="text-red-600 font-bold">(Obrigatório)</span>}
                                </label>
                                <textarea
                                    className={`w-full rounded-md shadow-sm p-2 border ${(!checkInterno || !checkExterno || !checkPneus) && !finishObs.trim() ? 'border-red-300 ring-1 ring-red-300' : 'border-gray-300'}`}
                                    rows={3}
                                    placeholder={(!checkInterno || !checkExterno || !checkPneus) ? "Justifique o item não realizado..." : "Alguma observação adicional?"}
                                    value={finishObs}
                                    onChange={(e) => setFinishObs(e.target.value)}
                                />
                            </div>
                        </div>

                        <div className="flex justify-end space-x-3">
                            <button
                                onClick={() => setFinishModalOpen(false)}
                                className="px-4 py-2 border rounded text-gray-600 hover:bg-gray-50"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleFinishSubmit}
                                disabled={processing}
                                className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
                            >
                                {processing ? 'Salvando...' : 'Concluir Serviço'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
