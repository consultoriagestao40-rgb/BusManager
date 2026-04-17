import { useState, useEffect } from 'react';
import { format, differenceInMinutes } from 'date-fns';
import { Clock, CheckCircle, Play, RefreshCw } from 'lucide-react';

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

export default function WebEventList({ events, autoOpenEventId, userRole }: { events: Event[], autoOpenEventId?: string | null, userRole?: string }) {
    const [now, setNow] = useState(new Date());
    const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
    const [processing, setProcessing] = useState(false);

    // Modal states
    const [startModalOpen, setStartModalOpen] = useState(false);
    const [finishModalOpen, setFinishModalOpen] = useState(false);
    const [swapModalOpen, setSwapModalOpen] = useState(false);
    const [cleaners, setCleaners] = useState<any[]>([]);
    const [yardItems, setYardItems] = useState<any[]>([]);
    const [selectedCleaner, setSelectedCleaner] = useState('');
    const [swapVehicle, setSwapVehicle] = useState('');
    const [swapReason, setSwapReason] = useState('QUEBRA');
    const [swapObs, setSwapObs] = useState('');

    // Checkboxes for finish
    const [checkInterno, setCheckInterno] = useState(false);
    const [checkExterno, setCheckExterno] = useState(false);
    const [checkPneus, setCheckPneus] = useState(false);
    const [checkBagageiros, setCheckBagageiros] = useState(false);
    const [finishObs, setFinishObs] = useState('');

    useEffect(() => {
        const timer = setInterval(() => setNow(new Date()), 60000);
        fetchCleaners();
        fetchYardItems();
        return () => clearInterval(timer);
    }, []);

    useEffect(() => {
        if (autoOpenEventId) {
            const event = events.find(e => e.id === autoOpenEventId);
            if (event && event.status === 'PREVISTO') {
                setSelectedEvent(event);
                setStartModalOpen(true);
            }
        }
    }, [autoOpenEventId, events]);

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

    const handleAction = async (eventId: string, action: 'start' | 'finish' | 'swap' | 'at-yard', data?: any) => {
        if (processing) return;
        setProcessing(true);
        try {
            const res = await fetch(`/api/events/${eventId}/${action}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: data ? JSON.stringify(data) : undefined
            });
            if (res.ok) {
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

    const getSlaStatus = (event: Event) => {
        if (event.status === 'CONCLUIDO') return 'completed';
        const limitTime = new Date(event.liberar_ate_at);
        const diff = differenceInMinutes(limitTime, now);
        if (diff <= 0) return 'expired';
        if (diff < 60) return 'critical';
        if (diff < 120) return 'warning';
        return 'normal';
    };

    const getRowClass = (event: Event, sla: string) => {
        const baseClass = "transition-colors border-b border-gray-100 last:border-0";
        if (event.status === 'CONCLUIDO') return `${baseClass} bg-green-50 hover:bg-green-100`;
        if (event.status === 'EM_ANDAMENTO') return `${baseClass} bg-blue-50/50 hover:bg-blue-100/50`;
        if (sla === 'expired') return `${baseClass} bg-red-50 hover:bg-red-100`;
        if (sla === 'critical') return `${baseClass} bg-orange-50 hover:bg-orange-100`;
        if (sla === 'warning') return `${baseClass} bg-yellow-50 hover:bg-yellow-100`;
        return `${baseClass} hover:bg-blue-50/30`;
    };

    return (
        <div className="w-full bg-white rounded-lg shadow-lg overflow-hidden border border-gray-100">
            <div className="overflow-x-auto">
                <table className="w-full min-w-full border-collapse">
                    <thead className="bg-[#2563eb] text-white">
                        <tr>
                            <th className="py-4 px-4 text-left text-xs font-black uppercase tracking-wider hidden lg:table-cell">Hora</th>
                            <th className="py-4 px-4 text-left text-xs font-black uppercase tracking-wider">Carro</th>
                            <th className="py-4 px-4 text-left text-xs font-black uppercase tracking-wider hidden xl:table-cell">Saída</th>
                            <th className="py-4 px-4 text-left text-xs font-black uppercase tracking-wider hidden lg:table-cell">H-1 (Meta)</th>
                            <th className="py-4 px-4 text-left text-xs font-black uppercase tracking-wider">Colaborador</th>
                            <th className="py-4 px-4 text-center text-xs font-black uppercase tracking-wider">SLA</th>
                            <th className="py-4 px-4 text-center text-xs font-black uppercase tracking-wider hidden md:table-cell">Pátio</th>
                            <th className="py-4 px-4 text-center text-xs font-black uppercase tracking-wider">Status</th>
                            <th className="py-4 px-4 text-right text-xs font-black uppercase tracking-wider">Ações</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {events.map((event) => {
                            const sla = getSlaStatus(event);
                            const diff = differenceInMinutes(new Date(event.liberar_ate_at), now);
                            const diffText = diff > 0 ? `${Math.floor(diff / 60)}h ${diff % 60}m` : 'Estourado';
                            const rowClass = getRowClass(event, sla);

                            return (
                                <tr key={event.id} className={rowClass}>
                                    <td className="py-4 px-4 hidden lg:table-cell">
                                        <div className="flex flex-col">
                                            {!event.event_business_key?.startsWith('MANUAL-') && (
                                                <span className="text-sm font-bold text-gray-900">{format(new Date(event.hora_viagem), 'HH:mm')}</span>
                                            )}
                                        </div>
                                    </td>
                                    <td className="py-4 px-4">
                                        <div className="flex flex-col">
                                            <div className="flex items-center gap-2">
                                                <span className="text-sm font-extrabold text-gray-900">{event.vehicle.client_vehicle_number}</span>
                                                {(event as any).revisar && (
                                                    <span className="text-[9px] bg-orange-500 text-white px-1.5 py-0.5 rounded-full font-black animate-pulse">REVISAR</span>
                                                )}
                                            </div>
                                            {event.vehicle.prefix && <span className="text-[10px] bg-blue-100 text-blue-800 px-1 py-0.5 rounded w-fit">{event.vehicle.prefix}</span>}
                                            {event.observacao_operacao && (
                                                <span className="text-[10px] text-orange-600 font-bold italic line-clamp-1" title={event.observacao_operacao}>
                                                    {event.observacao_operacao}
                                                </span>
                                            )}
                                        </div>
                                    </td>
                                    <td className="py-4 px-4 text-sm text-gray-700 hidden xl:table-cell">
                                        {!event.event_business_key?.startsWith('MANUAL-') && format(new Date(event.saida_programada_at), 'HH:mm')}
                                    </td>
                                    <td className="py-4 px-4 text-sm text-gray-700 hidden lg:table-cell">
                                        {format(new Date(event.liberar_ate_at), 'HH:mm')}
                                    </td>
                                    <td className="py-4 px-4 text-sm font-medium text-gray-700">{event.cleaner?.name || '-'}</td>
                                    <td className={`py-4 px-4 text-center text-sm font-bold ${sla === 'expired' ? 'text-red-600' : 'text-green-600'}`}>
                                        {sla === 'completed' ? <CheckCircle className="w-5 h-5 mx-auto text-green-500" /> : diffText}
                                    </td>
                                    <td className="py-4 px-4 text-center hidden md:table-cell">
                                        <input
                                            type="checkbox"
                                            checked={event.at_yard}
                                            onChange={() => userRole !== 'CLIENT' && handleAction(event.id, 'at-yard', { at_yard: !event.at_yard })}
                                            className={`w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 ${userRole === 'CLIENT' ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
                                            disabled={userRole === 'CLIENT'}
                                        />
                                    </td>
                                    <td className="py-4 px-4 text-center">
                                        <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase ${event.status === 'CONCLUIDO' ? 'bg-green-100 text-green-700' :
                                            event.status === 'EM_ANDAMENTO' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-700'
                                            }`}>
                                            {event.status}
                                        </span>
                                    </td>
                                    <td className="py-4 px-4 text-right">
                                        <div className="flex justify-end gap-2">
                                            {userRole !== 'CLIENT' && (
                                                <>
                                                    {event.status === 'PREVISTO' && (
                                                        <button onClick={() => { setSelectedEvent(event); setStartModalOpen(true); }} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg"><Play className="w-5 h-5" /></button>
                                                    )}
                                                    {event.status === 'EM_ANDAMENTO' && (
                                                        <button onClick={() => { setSelectedEvent(event); setFinishModalOpen(true); }} className="p-1.5 text-green-600 hover:bg-green-50 rounded-lg"><CheckCircle className="w-5 h-5" /></button>
                                                    )}
                                                    <button onClick={() => { setSelectedEvent(event); setSwapModalOpen(true); }} className="p-1.5 text-orange-600 hover:bg-orange-50 rounded-lg"><RefreshCw className="w-5 h-5" /></button>
                                                </>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            {/* Start Modal */}
            {startModalOpen && selectedEvent && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-[60]" onClick={() => setStartModalOpen(false)}>
                    <div className="bg-white rounded-xl p-6 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
                        <h3 className="text-lg font-bold mb-4">Iniciar Limpeza</h3>
                        <p className="text-sm text-gray-600 mb-4">Veículo: {selectedEvent.vehicle.client_vehicle_number}</p>
                        <select
                            value={selectedCleaner}
                            onChange={(e) => setSelectedCleaner(e.target.value)}
                            className="w-full p-2 border rounded-lg mb-6 outline-none focus:ring-2 focus:ring-blue-500"
                        >
                            <option value="">Selecione um colaborador</option>
                            {cleaners.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                        <div className="flex gap-2">
                            <button onClick={() => setStartModalOpen(false)} className="flex-1 py-2 text-gray-500 font-bold">Cancelar</button>
                            <button
                                onClick={() => handleAction(selectedEvent.id, 'start', { cleanerId: selectedCleaner })}
                                disabled={!selectedCleaner || processing}
                                className="flex-1 py-2 bg-blue-600 text-white font-bold rounded-lg disabled:opacity-50"
                            >
                                Iniciar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Swap Modal */}
            {swapModalOpen && selectedEvent && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-[60]" onClick={() => setSwapModalOpen(false)}>
                    <div className="bg-white rounded-xl p-6 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
                        <h3 className="text-lg font-bold mb-4">Trocar Veículo</h3>

                        <div className="space-y-4 mb-6">
                            <div>
                                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Selecionar do Pátio</label>
                                <select
                                    className="w-full p-2 border rounded-lg outline-none focus:ring-2 focus:ring-blue-500 mb-2"
                                    onChange={(e) => setSwapVehicle(e.target.value)}
                                    value={swapVehicle}
                                >
                                    <option value="">-- Digite manualmente ou selecione --</option>
                                    {yardItems.map(item => (
                                        <option key={item.id} value={item.vehicle.client_vehicle_number}>
                                            {item.vehicle.client_vehicle_number} ({item.status})
                                        </option>
                                    ))}
                                </select>
                                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Ou Digite o Número</label>
                                <input
                                    type="text"
                                    value={swapVehicle}
                                    onChange={(e) => setSwapVehicle(e.target.value)}
                                    placeholder="Ex: 62005"
                                    className="w-full p-2 border rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Motivo</label>
                                <select
                                    value={swapReason}
                                    onChange={(e) => setSwapReason(e.target.value)}
                                    className="w-full p-2 border rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
                                >
                                    <option value="QUEBRA">Quebra</option>
                                    <option value="CARRO_NAO_ESTA_NO_PATIO">Carro não está no pátio</option>
                                    <option value="ONIBUS_NAO_CHEGOU_NO_HORARIO">Atrazo</option>
                                    <option value="RODIZIO">Rodízio</option>
                                    <option value="RESERVA">Carro Reserva</option>
                                    <option value="OUTRO">Outro</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Observações</label>
                                <textarea
                                    value={swapObs}
                                    onChange={(e) => setSwapObs(e.target.value)}
                                    rows={3}
                                    className="w-full p-2 border rounded-lg outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                                />
                            </div>
                        </div>

                        <div className="flex gap-2">
                            <button onClick={() => setSwapModalOpen(false)} className="flex-1 py-2 text-gray-500 font-bold">Cancelar</button>
                            <button
                                onClick={() => handleAction(selectedEvent.id, 'swap', { replacementVehicleNumber: swapVehicle, motivo: swapReason, observacao: swapObs })}
                                disabled={!swapVehicle || processing}
                                className="flex-1 py-2 bg-orange-600 text-white font-bold rounded-lg disabled:opacity-50"
                            >
                                {processing ? 'Trocando...' : 'Trocar'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Finish Modal */}
            {finishModalOpen && selectedEvent && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-[60]" onClick={() => setFinishModalOpen(false)}>
                    <div className="bg-white rounded-xl p-6 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
                        <h3 className="text-lg font-bold mb-4">Finalizar Limpeza</h3>

                        {selectedEvent.revisar && (
                            <div className="mb-4 p-3 bg-orange-100 border border-orange-200 rounded-lg">
                                <p className="text-xs font-black text-orange-800 uppercase flex items-center gap-2">
                                    <RefreshCw className="w-3 h-3 animate-spin" /> Conferência Necessária
                                </p>
                                <p className="text-[11px] text-orange-700 mt-1 font-medium">
                                    Carro do pátio, precisa revisar
                                </p>
                            </div>
                        )}

                        <div className="space-y-3 mb-6">
                            <label className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100">
                                <input type="checkbox" checked={checkInterno} onChange={(e) => setCheckInterno(e.target.checked)} className="w-4 h-4 rounded text-blue-600" />
                                <span className="text-sm font-semibold text-gray-700">Limpeza Interna OK</span>
                            </label>
                            <label className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100">
                                <input type="checkbox" checked={checkExterno} onChange={(e) => setCheckExterno(e.target.checked)} className="w-4 h-4 rounded text-blue-600" />
                                <span className="text-sm font-semibold text-gray-700">Limpeza Externa OK</span>
                            </label>
                            <label className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100">
                                <input type="checkbox" checked={checkPneus} onChange={(e) => setCheckPneus(e.target.checked)} className="w-4 h-4 rounded text-blue-600" />
                                <span className="text-sm font-semibold text-gray-700">Pretinho Pneus Aplicado OK</span>
                            </label>
                            <label className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100">
                                <input type="checkbox" checked={checkBagageiros} onChange={(e) => setCheckBagageiros(e.target.checked)} className="w-4 h-4 rounded text-blue-600" />
                                <span className="text-sm font-semibold text-gray-700">Limpeza dos Bagajeiros OK</span>
                            </label>

                            <div>
                                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1 mt-2">Observações</label>
                                <textarea
                                    value={finishObs}
                                    onChange={(e) => setFinishObs(e.target.value)}
                                    placeholder="Opcional..."
                                    rows={2}
                                    className="w-full p-2 border rounded-lg outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                                />
                            </div>
                        </div>

                        <div className="flex gap-2">
                            <button onClick={() => setFinishModalOpen(false)} className="flex-1 py-2 text-gray-500 font-bold">Cancelar</button>
                            <button
                                onClick={() => handleAction(selectedEvent.id, 'finish', {
                                    check_interno: checkInterno,
                                    check_externo: checkExterno,
                                    check_pneus: checkPneus,
                                    check_bagageiros: checkBagageiros,
                                    observacao_operacao: finishObs
                                })}
                                disabled={processing}
                                className="flex-1 py-2 bg-green-600 text-white font-bold rounded-lg disabled:opacity-50"
                            >
                                {processing ? 'Finalizando...' : 'Finalizar'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
