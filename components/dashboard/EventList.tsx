import { useState, useEffect } from 'react';
import { format, differenceInMinutes } from 'date-fns';
import { Bus, Search, Play, Check, RefreshCw, UserPlus, LogOut } from 'lucide-react';
import { useRouter } from 'next/navigation';

interface Event {
    id: string;
    vehicle: { client_vehicle_number: string; prefix?: string };
    hora_viagem: string;
    saida_programada_at: string;
    liberar_ate_at: string;
    status: string;
    swaps: any[];
    cleaner?: { name: string };
    at_yard: boolean;
    revisar?: boolean;
    observacao_operacao?: string;
    event_business_key?: string;
}

interface EventListProps {
    events: Event[];
    userRole?: string;
    hasYardLock?: boolean;
    criticalYardEventId?: string | null;
}

export default function EventDashboardList({ 
    events, 
    userRole,
    hasYardLock = false,
    criticalYardEventId = null
}: EventListProps) {
    const router = useRouter();
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
    const [yardItems, setYardItems] = useState<any[]>([]);
    const [selectedCleaner, setSelectedCleaner] = useState('');
    const [showYardModal, setShowYardModal] = useState(false);

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
        fetchYardItems();
        return () => clearInterval(timer);
    }, []);

    const fetchYardItems = async () => {
        try {
            const res = await fetch('/api/yard');
            if (res.ok) {
                const data = await res.json();
                setYardItems(data.yardItems);
            }
        } catch (e) {
            console.error(e);
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
        if (action === 'at-yard') handleActionExecute('at-yard', { at_yard: !event.at_yard });
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
                alert('Ação registrada com sucesso!');
                window.location.reload();
            } else {
                const errorData = await res.json().catch(() => ({}));
                alert(errorData.error || 'Erro ao processar ação');
            }
        } catch (e) {
            console.error(e);
            alert('Erro de conexão');
        } finally {
            setProcessing(false);
        }
    };

    const handleManualProgram = async (vehicleId: string) => {
        setProcessing(true);
        try {
            const res = await fetch('/api/events/manual', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ vehicle_id: vehicleId })
            });

            if (res.ok) {
                alert('Reforço solicitado do pátio com sucesso!');
                window.location.reload();
            } else {
                const errorData = await res.json().catch(() => ({}));
                alert(errorData.error || 'Erro ao programar');
            }
        } catch (e) {
            console.error(e);
            alert('Erro de conexão');
        } finally {
            setProcessing(false);
        }
    };

    const handleLogout = async () => {
        if (!confirm('Deseja realmente sair?')) return;
        try {
            await fetch('/api/auth/logout', { method: 'POST' });
            router.push('/login');
        } catch (e) {
            console.error(e);
            alert('Erro ao sair');
        }
    };

    const formatSafe = (dateStr: string | undefined | null, formatStr: string) => {
        if (!dateStr) return '--:--';
        try {
            const d = new Date(dateStr);
            if (isNaN(d.getTime())) return '--:--';
            return format(d, formatStr);
        } catch (e) {
            return '--:--';
        }
    };

    const getSlaStatus = (event: Event): 'expired' | 'critical' | 'warning' | 'normal' => {
        if (!event || event.status === 'CONCLUIDO') return 'normal';
        if (!event.liberar_ate_at) return 'normal';

        try {
            const limitDate = new Date(event.liberar_ate_at);
            if (isNaN(limitDate.getTime())) return 'normal';

            const diff = differenceInMinutes(limitDate, now);
            if (diff < 0) return 'expired';
            if (diff < 15) return 'critical';
            if (diff < 30) return 'warning';
            return 'normal';
        } catch (e) {
            return 'normal';
        }
    };

    const filteredEvents = events.filter((event) => {
        const matchesSearch = event.vehicle.client_vehicle_number.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesStatus = statusFilter === 'Todos' || event.status === statusFilter;
        return matchesSearch && matchesStatus;
    });

    return (
        // Added negative margins to counteract the padding from DashboardLayout
        // Added pt-[180px] to account for the fixed header height on mobile
        <div className="flex flex-col min-h-screen bg-gray-100 -m-2 sm:-m-4 md:m-0 pt-[180px] md:pt-0">
            {/* Header Dark - MOBILE ONLY */}
            <header className="bg-[#1e293b] text-white py-6 px-6 md:hidden shadow-lg fixed top-0 left-0 right-0 z-50 w-full">
                <div className="flex flex-col items-center justify-center max-w-7xl mx-auto w-full space-y-4">
                    <div className="flex items-center justify-between w-full">
                        <div className="w-8"></div> {/* Spacer to center title */}
                        <h1 className="text-xl font-bold tracking-wider uppercase text-center">
                            ESCALA DE LIMPEZA <span className="text-[10px] text-gray-400">v2.1</span>
                        </h1>
                        <button
                            onClick={handleLogout}
                            className="p-2 hover:bg-white/10 rounded-full transition-colors text-red-400"
                        >
                            <LogOut className="w-6 h-6" />
                        </button>
                    </div>

                    {/* NEW: Add from Yard Button */}
                    <button
                        onClick={() => { if (!hasYardLock) setShowYardModal(true); }}
                        disabled={hasYardLock}
                        className={`w-full p-3 rounded-xl flex items-center justify-center gap-2 font-black text-sm transition-all ${hasYardLock ? 'bg-gray-600 text-gray-400 cursor-not-allowed opacity-40' : 'bg-blue-600 text-white shadow-lg shadow-blue-500/20 active:scale-95'}`}
                        title={hasYardLock ? "Bloqueado: pátio crítico pendente" : "PROGRAMAR DO PÁTIO"}
                    >
                        <RefreshCw className="w-4 h-4 animate-spin-slow" />
                        PROGRAMAR DO PÁTIO {hasYardLock && <span className="text-xs font-black text-red-400">(BLOQUEADO)</span>}
                    </button>

                    {/* Search & Filter Container (Floating Look) */}
                    <div className="w-full bg-gray-200/20 p-2 rounded-2xl backdrop-blur-sm flex gap-2">
                        <div className="relative flex-1 bg-white rounded-xl shadow-sm">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                            <input
                                type="text"
                                placeholder="Pesquisar..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-full pl-10 pr-4 py-2.5 bg-transparent rounded-xl text-sm font-medium text-gray-700 placeholder-gray-400 focus:outline-none"
                            />
                        </div>
                        <div className="relative bg-white rounded-xl shadow-sm min-w-[100px]">
                            <select
                                value={statusFilter}
                                onChange={(e) => setStatusFilter(e.target.value)}
                                className="w-full h-full px-4 py-2 bg-transparent rounded-xl text-sm font-bold text-gray-600 focus:outline-none appearance-none"
                            >
                                <option value="Todos">Status</option>
                                <option value="PREVISTO">Previsto</option>
                                <option value="EM_ANDAMENTO">Andamento</option>
                                <option value="CONCLUIDO">Concluído</option>
                                <option value="CANCELADO">Cancelado</option>
                            </select>
                            <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                                <svg className="w-3 h-3 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                            </div>
                        </div>
                    </div>
                </div>
            </header>

            {/* Table Content */}
            <div className="flex-1 px-4 py-4 pb-20">
                <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
                    {/* Table Header */}
                    <div className="grid grid-cols-[1fr_1fr_1fr_1fr_auto] gap-2 p-4 bg-gray-50 border-b border-gray-100 items-center">
                        <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Número do Carro</div>
                        <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Hora de Saída</div>
                        <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Meta H-1</div>
                        <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider text-center">Pátio</div>
                        <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider text-right">Ações</div>
                    </div>

                    <div className="divide-y divide-gray-100">
                        {filteredEvents.map((event) => {
                            if (!event || !event.vehicle) return null; // Safety check

                            const sla = getSlaStatus(event);
                            const isCancelled = event.status === 'CANCELADO';
                            const isCompleted = event.status === 'CONCLUIDO';
                            const isInProgress = event.status === 'EM_ANDAMENTO';

                             // Determine Row Background Color
                            let rowBgClass = 'bg-white hover:bg-gray-50'; // Default
                            if (event.id === criticalYardEventId) rowBgClass = 'border-l-8 border-red-600 bg-red-500/25 text-red-900 animate-pulse font-extrabold';
                            else if (isCompleted) rowBgClass = 'bg-green-50/80 border-green-100';
                            else if (sla === 'expired' && !isCancelled) rowBgClass = 'bg-red-50/80 border-red-100';
                            else if (sla === 'critical' && !isCancelled) rowBgClass = 'bg-orange-50/80 border-orange-100';
                            else if (sla === 'warning' && !isCancelled) rowBgClass = 'bg-yellow-50/80 border-yellow-100';

                            const isPlayDisabled = hasYardLock;
                            const isSwapDisabled = hasYardLock && event.id !== criticalYardEventId;
                            const isEditOrFinishDisabled = hasYardLock;
                            const isYardCheckboxDisabled = userRole === 'CLIENT' || (hasYardLock && event.id !== criticalYardEventId);

                            return (
                                <div key={event.id} id={`event-row-${event.id}`} className={`grid grid-cols-[1fr_1fr_1fr_1fr_auto] gap-2 p-4 items-center transition-colors border-b border-gray-100 last:border-0 ${rowBgClass} ${isCancelled ? 'opacity-60 grayscale bg-gray-50' : ''}`}>
                                    {/* Carro */}
                                    <div className="flex flex-col">
                                        <span className="text-sm font-bold text-gray-900">
                                            {event.vehicle.client_vehicle_number || '-'}
                                        </span>
                                    </div>

                                    {/* Hora Saída */}
                                    <div className="text-sm font-medium text-gray-900">
                                        {!event.event_business_key?.startsWith('MANUAL-') && formatSafe(event.saida_programada_at, 'HH:mm')}
                                    </div>

                                    {/* Meta H-1 */}
                                    <div className="flex flex-col">
                                        <span className="text-sm font-bold text-gray-700">
                                            {formatSafe(event.liberar_ate_at, 'HH:mm')}
                                        </span>
                                        {!isCompleted && !isCancelled && sla === 'expired' && (
                                            <span className="text-[9px] text-red-600 font-black tracking-tighter uppercase mt-0.5 animate-pulse">
                                                ESTOURADO
                                            </span>
                                        )}
                                    </div>

                                    {/* Pátio Checkbox - Mobile View */}
                                    <div className="flex items-center justify-center">
                                        <input
                                            type="checkbox"
                                            checked={event.at_yard}
                                            onChange={(e) => {
                                                if (isYardCheckboxDisabled) return;
                                                e.stopPropagation();
                                                handleActionTrigger(event, 'at-yard');
                                            }}
                                            className={`w-6 h-6 rounded-lg border-gray-300 text-blue-600 focus:ring-blue-500 ${isYardCheckboxDisabled ? 'cursor-not-allowed opacity-40' : 'cursor-pointer'}`}
                                            disabled={isYardCheckboxDisabled}
                                            title={isYardCheckboxDisabled && hasYardLock ? "Bloqueado: pátio crítico pendente" : "Confirmar presença no pátio"}
                                        />
                                    </div>

                                    {/* Ações */}
                                    <div className="text-right">
                                        {!isCancelled && userRole !== 'CLIENT' && (
                                            <div className="relative inline-block">
                                                <button
                                                    onClick={() => setShowMenu(showMenu === event.id ? null : event.id)}
                                                    className={`p-2 rounded-xl transition-all ${showMenu === event.id ? 'bg-blue-600 text-white shadow-lg shadow-blue-200' : 'text-blue-600 bg-blue-50'}`}
                                                >
                                                    <Bus className="w-5 h-5" />
                                                </button>

                                                {/* Action Popover */}
                                                {showMenu === event.id && (
                                                    <div className="fixed inset-0 z-[60] flex items-end sm:items-center sm:justify-center bg-black/40 backdrop-blur-sm transition-opacity" onClick={() => setShowMenu(null)}>
                                                        <div className="bg-white w-full max-w-sm mx-auto sm:rounded-2xl rounded-t-2xl shadow-2xl overflow-hidden animate-in slide-in-from-bottom-5 duration-200" onClick={e => e.stopPropagation()}>
                                                            <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                                                                <span className="font-bold text-gray-900">Ações - {event.vehicle.client_vehicle_number}</span>
                                                                <button onClick={() => setShowMenu(null)} className="text-gray-400 p-2 hover:bg-gray-200 rounded-full transition-colors">&times;</button>
                                                            </div>
                                                            <div className="p-3 space-y-2">
                                                                {event.status === 'PREVISTO' && (
                                                                    <button
                                                                        onClick={() => { if (!isPlayDisabled) handleActionTrigger(event, 'start'); }}
                                                                        disabled={isPlayDisabled}
                                                                        className={`w-full text-left px-4 py-3.5 flex items-center gap-4 rounded-xl text-sm font-bold transition-colors ${isPlayDisabled ? 'opacity-40 cursor-not-allowed text-gray-400 bg-gray-50' : 'hover:bg-blue-50 text-gray-700'}`}
                                                                        title={isPlayDisabled ? "Bloqueado: pátio crítico pendente" : "Iniciar Limpeza"}
                                                                    >
                                                                        <div className={`p-2 rounded-lg ${isPlayDisabled ? 'bg-gray-200 text-gray-400' : 'bg-blue-100 text-blue-600'}`}><Play className="w-5 h-5" /></div>
                                                                        Iniciar Limpeza {isPlayDisabled && <span className="text-[10px] text-red-500 font-bold ml-auto">(Bloqueado)</span>}
                                                                    </button>
                                                                )}
                                                                {isInProgress && (
                                                                    <button
                                                                        onClick={() => { if (!isEditOrFinishDisabled) handleActionTrigger(event, 'finish'); }}
                                                                        disabled={isEditOrFinishDisabled}
                                                                        className={`w-full text-left px-4 py-3.5 flex items-center gap-4 rounded-xl text-sm font-bold transition-colors ${isEditOrFinishDisabled ? 'opacity-40 cursor-not-allowed text-gray-400 bg-gray-50' : 'hover:bg-green-50 text-gray-700'}`}
                                                                        title={isEditOrFinishDisabled ? "Bloqueado: pátio crítico pendente" : "Finalizar Limpeza"}
                                                                    >
                                                                        <div className={`p-2 rounded-lg ${isEditOrFinishDisabled ? 'bg-gray-200 text-gray-400' : 'bg-green-100 text-green-600'}`}><Check className="w-5 h-5" /></div>
                                                                        Finalizar Limpeza {isEditOrFinishDisabled && <span className="text-[10px] text-red-500 font-bold ml-auto">(Bloqueado)</span>}
                                                                    </button>
                                                                )}
                                                                {!isCompleted && (
                                                                    <>
                                                                        <button
                                                                            onClick={() => { if (!isSwapDisabled) handleActionTrigger(event, 'swap'); }}
                                                                            disabled={isSwapDisabled}
                                                                            className={`w-full text-left px-4 py-3.5 flex items-center gap-4 rounded-xl text-sm font-bold transition-colors ${isSwapDisabled ? 'opacity-40 cursor-not-allowed text-gray-400 bg-gray-50' : 'hover:bg-orange-50 text-gray-700'}`}
                                                                            title={isSwapDisabled ? "Bloqueado: pátio crítico pendente" : "Fazer Troca"}
                                                                        >
                                                                            <div className={`p-2 rounded-lg ${isSwapDisabled ? 'bg-gray-200 text-gray-400' : 'bg-orange-100 text-orange-600'}`}><RefreshCw className="w-5 h-5" /></div>
                                                                            Fazer Troca {isSwapDisabled && <span className="text-[10px] text-red-500 font-bold ml-auto">(Bloqueado)</span>}
                                                                        </button>
                                                                        <button
                                                                            onClick={() => { if (!isEditOrFinishDisabled) handleActionTrigger(event, 'addColaborador'); }}
                                                                            disabled={isEditOrFinishDisabled}
                                                                            className={`w-full text-left px-4 py-3.5 flex items-center gap-4 rounded-xl text-sm font-bold transition-colors ${isEditOrFinishDisabled ? 'opacity-40 cursor-not-allowed text-gray-400 bg-gray-50' : 'hover:bg-purple-50 text-gray-700'}`}
                                                                            title={isEditOrFinishDisabled ? "Bloqueado: pátio crítico pendente" : "Colaboradores"}
                                                                        >
                                                                            <div className={`p-2 rounded-lg ${isEditOrFinishDisabled ? 'bg-gray-200 text-gray-400' : 'bg-purple-100 text-purple-600'}`}><UserPlus className="w-5 h-5" /></div>
                                                                            Colaboradores {isEditOrFinishDisabled && <span className="text-[10px] text-red-500 font-bold ml-auto">(Bloqueado)</span>}
                                                                        </button>
                                                                    </>
                                                                )}
                                                            </div>
                                                            <div className="p-4 bg-gray-50 border-t border-gray-100 sm:hidden">
                                                                <button onClick={() => setShowMenu(null)} className="w-full py-3 bg-gray-200 text-gray-700 rounded-xl font-bold">Cancelar</button>
                                                            </div>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* Modals Section */}
            {startModalOpen && selectedEvent && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-[100] animate-in fade-in duration-300" onClick={() => setStartModalOpen(false)}>
                    <div className="bg-white rounded-2xl p-6 md:p-8 max-w-md w-full shadow-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
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
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-[100] animate-in fade-in duration-300" onClick={() => setSwapModalOpen(false)}>
                    <div className="bg-white rounded-2xl p-6 md:p-8 max-w-md w-full shadow-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                        <h3 className="text-xl font-bold mb-6 text-gray-900">Trocar Veículo</h3>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5">Selecionar do Pátio</label>
                                <select
                                    className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none mb-3"
                                    onChange={(e) => setSwapVehicle(e.target.value)}
                                    value={swapVehicle}
                                >
                                    <option value="">-- Manual ou Selecione --</option>
                                    {yardItems.map(item => (
                                        <option key={item.id} value={item.vehicle.client_vehicle_number}>
                                            {item.vehicle.client_vehicle_number} ({item.status})
                                        </option>
                                    ))}
                                </select>
                                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5">Ou Digite o Número</label>
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
                                    <option value="CARRO_NAO_ESTA_NO_PATIO">Carro não está no pátio</option>
                                    <option value="ATRAZO">Atrazo</option>
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
                                onClick={() => handleActionExecute('swap', {
                                    replacementVehicleNumber: swapVehicle,
                                    motivo: swapReason,
                                    observacao: swapObs
                                })}
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
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-[100] animate-in fade-in duration-300" onClick={() => setFinishModalOpen(false)}>
                    <div className="bg-white rounded-2xl p-6 md:p-8 max-w-md w-full shadow-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                        <h3 className="text-xl font-bold mb-4 text-gray-900">Finalizar Limpeza</h3>

                        {selectedEvent.revisar && (
                            <div className="mb-4 p-4 bg-orange-50 border border-orange-200 rounded-xl">
                                <p className="text-xs font-black text-orange-800 uppercase flex items-center gap-2">
                                    <RefreshCw className="w-4 h-4 animate-spin" /> Conferência Necessária
                                </p>
                                <p className="text-xs text-orange-700 mt-1.5 font-bold italic leading-relaxed">
                                    Carro do pátio, precisa revisar
                                </p>
                            </div>
                        )}

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
                                <span className="text-sm font-semibold text-gray-700">Pretinho Pneus Aplicado OK</span>
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
                                onClick={() => handleActionExecute('finish', {
                                    check_interno: checkInterno,
                                    check_externo: checkExterno,
                                    check_pneus: checkPneus,
                                    observacao_operacao: finishObs
                                })}
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
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-[100] animate-in fade-in duration-300" onClick={() => setColaboradorModalOpen(false)}>
                    <div className="bg-white rounded-2xl p-6 md:p-8 max-w-md w-full shadow-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
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

            {/* Yard Selection Modal (Manual Programming) */}
            {showYardModal && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-[100] animate-in fade-in duration-300" onClick={() => setShowYardModal(false)}>
                    <div className="bg-white rounded-2xl p-6 md:p-8 max-w-md w-full shadow-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                        <h3 className="text-xl font-bold mb-4 text-gray-900">Programar do Pátio</h3>
                        <p className="text-sm text-gray-500 mb-6">Selecione um carro que está no estoque do pátio para adicionar à escala de hoje.</p>

                        <div className="space-y-3">
                            {yardItems.length === 0 ? (
                                <p className="text-center py-8 text-gray-400 font-medium">Nenhum carro no pátio.</p>
                            ) : (
                                yardItems.map(item => (
                                    <button
                                        key={item.id}
                                        onClick={() => handleManualProgram(item.vehicle.id)}
                                        disabled={processing}
                                        className="w-full p-4 bg-gray-50 hover:bg-blue-50 border border-gray-100 rounded-2xl flex justify-between items-center transition-all group"
                                    >
                                        <div className="flex flex-col items-start">
                                            <span className="text-lg font-black text-gray-800 group-hover:text-blue-700">{item.vehicle.client_vehicle_number}</span>
                                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${item.status === 'LIMPO' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                                                {item.status}
                                            </span>
                                        </div>
                                        <div className="p-2 bg-blue-100 text-blue-600 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity">
                                            <Play className="w-5 h-5 fill-current" />
                                        </div>
                                    </button>
                                ))
                            )}
                        </div>

                        <button
                            onClick={() => setShowYardModal(false)}
                            className="w-full mt-6 py-3 bg-gray-100 text-gray-700 font-bold rounded-xl hover:bg-gray-200 transition-colors"
                        >
                            Fechar
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
