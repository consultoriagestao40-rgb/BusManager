import { useState, useEffect } from 'react';
import { format, differenceInMinutes, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Clock, CheckCircle, AlertTriangle, AlertOctagon, RefreshCw, Play, Square } from 'lucide-react';

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

export default function EventList({ events }: { events: Event[] }) {
    const [now, setNow] = useState(new Date());
    const [swapModalOpen, setSwapModalOpen] = useState(false);
    const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
    const [swapVehicle, setSwapVehicle] = useState('');
    const [swapReason, setSwapReason] = useState('QUEBRA');
    const [swapObs, setSwapObs] = useState('');
    const [processing, setProcessing] = useState(false);

    // Finish Modal State
    const [finishModalOpen, setFinishModalOpen] = useState(false);
    const [checkInterno, setCheckInterno] = useState(false);
    const [checkExterno, setCheckExterno] = useState(false);
    const [checkPneus, setCheckPneus] = useState(false);
    const [finishObs, setFinishObs] = useState('');

    const [startModalOpen, setStartModalOpen] = useState(false);
    const [cleaners, setCleaners] = useState<any[]>([]);
    const [selectedCleaner, setSelectedCleaner] = useState('');

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

    const handleAction = async (eventId: string, action: 'start' | 'finish') => {
        if (action === 'start') {
            const event = events.find(e => e.id === eventId);
            if (event) {
                setSelectedEvent(event);
                setStartModalOpen(true);
            }
            return;
        }

        if (action === 'finish') {
            const event = events.find(e => e.id === eventId);
            if (event) {
                setSelectedEvent(event);
                setCheckInterno(false);
                setCheckExterno(false);
                setCheckPneus(false);
                setFinishObs('');
                setFinishModalOpen(true);
            }
            return;
        }

        if (processing) return;
        setProcessing(true);
        try {
            const res = await fetch(`/api/events/${eventId}/${action}`, { method: 'POST' });
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

    const handleFinishSubmit = async () => {
        if (!selectedEvent) return;

        // Validation: If NOT all checks are true, obs is required
        const allChecks = checkInterno && checkExterno && checkPneus;
        if (!allChecks && !finishObs.trim()) {
            alert('Se algum item não foi verificado, é OBRIGATÓRIO informar o motivo na observação.');
            return;
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
                    observacao_operacao: finishObs
                })
            });

            if (res.ok) {
                setFinishModalOpen(false);
                window.location.reload();
            } else {
                const err = await res.json();
                alert('Erro ao finalizar: ' + (err.error || 'Desconhecido'));
            }
        } catch (e) {
            console.error(e);
            alert('Erro de conexão');
        } finally {
            setProcessing(false);
        }
    };

    const confirmStart = async () => {
        if (!selectedEvent || !selectedCleaner) return;
        setProcessing(true);
        try {
            const res = await fetch(`/api/events/${selectedEvent.id}/start`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ cleanerId: selectedCleaner })
            });
            if (res.ok) {
                setStartModalOpen(false);
                window.location.reload();
            } else {
                alert('Erro ao iniciar limpeza');
            }
        } catch (e) {
            console.error(e);
            alert('Erro de conexão');
        } finally {
            setProcessing(false);
        }
    };

    const openSwap = (event: Event) => {
        setSelectedEvent(event);
        setSwapVehicle('');
        setSwapReason('QUEBRA');
        setSwapObs('');
        setSwapModalOpen(true);
    };

    const handleSwapSubmit = async () => {
        if (!selectedEvent) return;
        setProcessing(true);
        try {
            const res = await fetch(`/api/events/${selectedEvent.id}/swap`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    replacementVehicleNumber: swapVehicle,
                    motivo: swapReason,
                    observacao: swapObs
                })
            });

            if (res.ok) {
                setSwapModalOpen(false);
                window.location.reload();
            } else {
                const err = await res.json();
                alert('Erro na troca: ' + (err.error || 'Desconhecido'));
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

        // The event.liberar_ate_at is string from JSON, parse it
        const limitTime = new Date(event.liberar_ate_at);
        const minutesLeft = differenceInMinutes(limitTime, now);

        if (minutesLeft < 0) return 'expired'; // Already passed H-1
        if (minutesLeft < 60) return 'critical'; // Less than 1 hour to H-1
        if (minutesLeft < 120) return 'warning'; // Less than 2 hours to H-1
        return 'normal';
    };

    const getRowClass = (status: string) => {
        switch (status) {
            case 'completed': return 'bg-green-50 hover:bg-green-100';
            case 'expired': return 'bg-red-50 hover:bg-red-100 border-l-4 border-red-500';
            case 'critical': return 'bg-orange-50 hover:bg-orange-100 border-l-4 border-orange-500';
            case 'warning': return 'bg-yellow-50 hover:bg-yellow-100 border-l-4 border-yellow-400';
            default: return 'hover:bg-gray-50';
        }
    };

    return (
        <>
            {/* Fixed height container with sticky header */}
            <div className="w-full bg-white rounded-lg shadow-lg overflow-hidden">
                <div className="max-h-[calc(100vh-180px)] md:max-h-[calc(100vh-150px)] overflow-y-auto">
                    <table className="w-full min-w-full border-collapse">
                        <thead className="bg-gradient-to-r from-blue-600 to-blue-700 sticky top-0 z-50 shadow-lg">
                            <tr>
                                <th className="py-4 px-2 md:px-4 text-left text-xs md:text-sm font-black text-white uppercase tracking-wide border-b-2 border-blue-800">
                                    <div className="flex flex-col">
                                        <span>Hora</span>
                                        <span className="text-[10px] font-normal opacity-75">Local</span>
                                    </div>
                                </th>
                                <th className="py-4 px-2 md:px-4 text-left text-xs md:text-sm font-black text-white uppercase tracking-wide border-b-2 border-blue-800">Carro</th>
                                <th className="hidden md:table-cell py-4 px-4 text-left text-xs md:text-sm font-black text-white uppercase tracking-wide border-b-2 border-blue-800">Saída</th>
                                <th className="hidden lg:table-cell py-4 px-4 text-left text-xs md:text-sm font-black text-white uppercase tracking-wide border-b-2 border-blue-800">Meta</th>
                                <th className="hidden md:table-cell py-4 px-4 text-left text-xs md:text-sm font-black text-white uppercase tracking-wide border-b-2 border-blue-800">Colaborador</th>
                                <th className="py-4 px-2 md:px-4 text-center text-xs md:text-sm font-black text-white uppercase tracking-wide border-b-2 border-blue-800">SLA</th>
                                <th className="py-4 px-2 md:px-4 text-center text-xs md:text-sm font-black text-white uppercase tracking-wide border-b-2 border-blue-800">Status</th>
                                <th className="py-4 px-2 md:px-4 text-right text-xs md:text-sm font-black text-white uppercase tracking-wide border-b-2 border-blue-800">Ações</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 bg-white">
                            {events.map((event) => {
                                const sla = getSlaStatus(event);
                                const slaColor = {
                                    completed: 'text-green-600',
                                    expired: 'text-red-600',
                                    critical: 'text-orange-600',
                                    warning: 'text-yellow-600',
                                    normal: 'text-green-600'
                                }[sla];

                                const diff = differenceInMinutes(new Date(event.liberar_ate_at), now);
                                const diffText = diff > 0 ? `${Math.floor(diff / 60)}h ${diff % 60}m` : 'Estourado';

                                // Find cleaner name if available
                                const cleanerName = event.cleaner?.name || '-';

                                return (
                                    <tr key={event.id} className={`${getRowClass(sla)} hover:bg-blue-50/50 transition-colors`}>
                                        <td className="py-3 md:py-4 pl-2 md:pl-4 pr-1 md:pr-3">
                                            <div className="flex flex-col">
                                                <span className="text-sm md:text-base font-bold text-gray-900">{format(new Date(event.hora_viagem), 'HH:mm')}</span>
                                                <span className="text-[10px] md:text-xs text-gray-400 mt-0.5">UTC: {new Date(event.hora_viagem).toISOString().slice(11, 16)}</span>
                                            </div>
                                        </td>
                                        <td className="py-3 md:py-4 px-1 md:px-3">
                                            <div className="flex flex-col">
                                                <span className="text-sm md:text-base font-extrabold text-gray-900">{event.vehicle.client_vehicle_number}</span>
                                                {event.vehicle.prefix && <span className="text-[10px] md:text-xs bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded mt-1 inline-block w-fit font-medium">{event.vehicle.prefix}</span>}
                                            </div>
                                        </td>
                                        <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                                            {format(new Date(event.saida_programada_at), 'HH:mm')}
                                        </td>
                                        <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                                            {format(new Date(event.liberar_ate_at), 'HH:mm')}
                                        </td>
                                        <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500 font-medium">
                                            {cleanerName}
                                        </td>
                                        <td className={`whitespace-nowrap px-3 py-4 text-sm font-bold ${slaColor}`}>
                                            {sla === 'completed' ? <CheckCircle className="w-5 h-5" /> : diffText}
                                        </td>
                                        <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                                            <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium 
                        ${event.status === 'CONCLUIDO' ? 'bg-green-100 text-green-800' :
                                                    event.status === 'EM_ANDAMENTO' ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-800'}`}>
                                                {event.status}
                                            </span>
                                        </td>
                                        <td className="relative whitespace-nowrap py-4 pl-3 pr-4 text-right text-sm font-medium sm:pr-6">
                                            {event.status !== 'CONCLUIDO' && (
                                                <div className="flex justify-end space-x-2">
                                                    {event.status === 'PREVISTO' && (
                                                        <button
                                                            onClick={() => handleAction(event.id, 'start')}
                                                            disabled={processing}
                                                            title="Iniciar Limpeza"
                                                            className="p-1 text-blue-600 hover:bg-blue-50 rounded"
                                                        >
                                                            <Play className="w-5 h-5" />
                                                        </button>
                                                    )}

                                                    {event.status === 'EM_ANDAMENTO' && (
                                                        <button
                                                            onClick={() => handleAction(event.id, 'finish')}
                                                            disabled={processing}
                                                            title="Finalizar Limpeza"
                                                            className="p-1 text-green-600 hover:bg-green-50 rounded"
                                                        >
                                                            <CheckCircle className="w-5 h-5" />
                                                        </button>
                                                    )}

                                                    <button
                                                        onClick={() => openSwap(event)}
                                                        disabled={processing}
                                                        title="Trocar Veículo"
                                                        className="p-1 text-orange-600 hover:bg-orange-50 rounded"
                                                    >
                                                        <RefreshCw className="w-5 h-5" />
                                                    </button>
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>


            {
                startModalOpen && selectedEvent && (
                    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
                        <div className="bg-white rounded-lg p-6 max-w-md w-full">
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
                                    {cleaners.map(c => (
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
                                    onClick={confirmStart}
                                    disabled={processing || !selectedCleaner}
                                    className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                                >
                                    {processing ? 'Iniciando...' : 'Confirmar Início'}
                                </button>
                            </div>
                        </div>
                    </div>
                )}


            {
                swapModalOpen && selectedEvent && (
                    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
                        <div className="bg-white rounded-lg p-6 max-w-md w-full">
                            <h3 className="text-lg font-bold mb-4">Trocar Veículo</h3>
                            <p className="mb-4">Veículo Atual: <span className="font-bold">{selectedEvent.vehicle.client_vehicle_number}</span></p>

                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">Novo Veículo</label>
                                    <input
                                        type="text"
                                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 border p-2"
                                        value={swapVehicle}
                                        onChange={(e) => setSwapVehicle(e.target.value)}
                                        placeholder="Número do carro"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">Motivo</label>
                                    <select
                                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 border p-2"
                                        value={swapReason}
                                        onChange={(e) => setSwapReason(e.target.value)}
                                    >
                                        <option value="QUEBRA">Quebra</option>
                                        <option value="ONIBUS_NAO_CHEGOU_NO_HORARIO">Ônibus Atrasado</option>
                                        <option value="MANUTENCAO">Manutenção</option>
                                        <option value="OUTROS">Outros</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">Observação</label>
                                    <textarea
                                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 border p-2"
                                        value={swapObs}
                                        onChange={(e) => setSwapObs(e.target.value)}
                                    />
                                </div>
                            </div>

                            <div className="mt-6 flex justify-end space-x-3">
                                <button
                                    onClick={() => setSwapModalOpen(false)}
                                    className="px-4 py-2 border rounded text-gray-600 hover:bg-gray-50"
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={handleSwapSubmit}
                                    disabled={processing}
                                    className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                                >
                                    {processing ? 'Salvando...' : 'Confirmar Troca'}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

            {
                finishModalOpen && selectedEvent && (
                    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
                        <div className="bg-white rounded-lg p-6 max-w-md w-full">
                            <h3 className="text-lg font-bold mb-4">Finalizar Limpeza</h3>
                            <p className="mb-4">Confirme os itens realizados no veículo <span className="font-bold">{selectedEvent.vehicle.client_vehicle_number}</span></p>

                            <div className="space-y-4 mb-6">
                                <div className="flex items-center space-x-3 p-3 border rounded hover:bg-gray-50 cursor-pointer" onClick={() => setCheckExterno(!checkExterno)}>
                                    <div className={`w-6 h-6 rounded border flex items-center justify-center ${checkExterno ? 'bg-green-500 border-green-500 text-white' : 'border-gray-300'}`}>
                                        {checkExterno && <CheckCircle className="w-4 h-4" />}
                                    </div>
                                    <span className="text-gray-700 font-medium select-none">Limpeza Externa</span>
                                </div>

                                <div className="flex items-center space-x-3 p-3 border rounded hover:bg-gray-50 cursor-pointer" onClick={() => setCheckInterno(!checkInterno)}>
                                    <div className={`w-6 h-6 rounded border flex items-center justify-center ${checkInterno ? 'bg-green-500 border-green-500 text-white' : 'border-gray-300'}`}>
                                        {checkInterno && <CheckCircle className="w-4 h-4" />}
                                    </div>
                                    <span className="text-gray-700 font-medium select-none">Limpeza Interna</span>
                                </div>

                                <div className="flex items-center space-x-3 p-3 border rounded hover:bg-gray-50 cursor-pointer" onClick={() => setCheckPneus(!checkPneus)}>
                                    <div className={`w-6 h-6 rounded border flex items-center justify-center ${checkPneus ? 'bg-green-500 border-green-500 text-white' : 'border-gray-300'}`}>
                                        {checkPneus && <CheckCircle className="w-4 h-4" />}
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
