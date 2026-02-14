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
}

export default function WebEventList({ events }: { events: Event[] }) {
    const [now, setNow] = useState(new Date());
    const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
    const [processing, setProcessing] = useState(false);

    // Modal states
    const [startModalOpen, setStartModalOpen] = useState(false);
    const [finishModalOpen, setFinishModalOpen] = useState(false);
    const [swapModalOpen, setSwapModalOpen] = useState(false);
    const [cleaners, setCleaners] = useState<any[]>([]);
    const [selectedCleaner, setSelectedCleaner] = useState('');
    const [swapVehicle, setSwapVehicle] = useState('');
    const [swapReason, setSwapReason] = useState('QUEBRA');
    const [swapObs, setSwapObs] = useState('');

    // Checkboxes for finish
    const [checkInterno, setCheckInterno] = useState(false);
    const [checkExterno, setCheckExterno] = useState(false);
    const [checkPneus, setCheckPneus] = useState(false);
    const [finishObs, setFinishObs] = useState('');

    useEffect(() => {
        const timer = setInterval(() => setNow(new Date()), 60000);
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

    const handleAction = async (eventId: string, action: 'start' | 'finish' | 'swap', data?: any) => {
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
                alert('Erro ao processar ação');
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
        if (diff < 0) return 'expired';
        if (diff < 60) return 'critical';
        if (diff < 120) return 'warning';
        return 'normal';
    };

    return (
        <div className="w-full bg-white rounded-lg shadow-lg overflow-hidden border border-gray-100">
            <div className="overflow-x-auto">
                <table className="w-full min-w-full border-collapse">
                    <thead className="bg-[#2563eb] text-white">
                        <tr>
                            <th className="py-4 px-4 text-left text-xs font-black uppercase tracking-wider">Hora</th>
                            <th className="py-4 px-4 text-left text-xs font-black uppercase tracking-wider">Carro</th>
                            <th className="py-4 px-4 text-left text-xs font-black uppercase tracking-wider">Saída</th>
                            <th className="py-4 px-4 text-left text-xs font-black uppercase tracking-wider">H-1 (Meta)</th>
                            <th className="py-4 px-4 text-left text-xs font-black uppercase tracking-wider">Colaborador</th>
                            <th className="py-4 px-4 text-center text-xs font-black uppercase tracking-wider">SLA</th>
                            <th className="py-4 px-4 text-center text-xs font-black uppercase tracking-wider">Status</th>
                            <th className="py-4 px-4 text-right text-xs font-black uppercase tracking-wider">Ações</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {events.map((event) => {
                            const sla = getSlaStatus(event);
                            const diff = differenceInMinutes(new Date(event.liberar_ate_at), now);
                            const diffText = diff > 0 ? `${Math.floor(diff / 60)}h ${diff % 60}m` : 'Estourado';

                            return (
                                <tr key={event.id} className="hover:bg-blue-50/30 transition-colors">
                                    <td className="py-4 px-4">
                                        <div className="flex flex-col">
                                            <span className="text-sm font-bold text-gray-900">{format(new Date(event.hora_viagem), 'HH:mm')}</span>
                                            <span className="text-[10px] text-gray-400">UTC: {new Date(event.hora_viagem).toISOString().slice(11, 16)}</span>
                                        </div>
                                    </td>
                                    <td className="py-4 px-4">
                                        <div className="flex flex-col">
                                            <span className="text-sm font-extrabold text-gray-900">{event.vehicle.client_vehicle_number}</span>
                                            {event.vehicle.prefix && <span className="text-[10px] bg-blue-100 text-blue-800 px-1 py-0.5 rounded w-fit">{event.vehicle.prefix}</span>}
                                        </div>
                                    </td>
                                    <td className="py-4 px-4 text-sm text-gray-700">{format(new Date(event.saida_programada_at), 'HH:mm')}</td>
                                    <td className="py-4 px-4 text-sm text-gray-700">{format(new Date(event.liberar_ate_at), 'HH:mm')}</td>
                                    <td className="py-4 px-4 text-sm font-medium text-gray-700">{event.cleaner?.name || '-'}</td>
                                    <td className={`py-4 px-4 text-center text-sm font-bold ${sla === 'expired' ? 'text-red-600' : 'text-green-600'}`}>
                                        {sla === 'completed' ? <CheckCircle className="w-5 h-5 mx-auto text-green-500" /> : diffText}
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
                                            {event.status === 'PREVISTO' && (
                                                <button onClick={() => { setSelectedEvent(event); setStartModalOpen(true); }} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg"><Play className="w-5 h-5" /></button>
                                            )}
                                            {event.status === 'EM_ANDAMENTO' && (
                                                <button onClick={() => { setSelectedEvent(event); setFinishModalOpen(true); }} className="p-1.5 text-green-600 hover:bg-green-50 rounded-lg"><CheckCircle className="w-5 h-5" /></button>
                                            )}
                                            <button onClick={() => { setSelectedEvent(event); setSwapModalOpen(true); }} className="p-1.5 text-orange-600 hover:bg-orange-50 rounded-lg"><RefreshCw className="w-5 h-5" /></button>
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
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-[60]">
                    <div className="bg-white rounded-xl p-6 max-w-sm w-full">
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

            {/* Other modals would go here, omitting for brevity in this initial restore */}
        </div>
    );
}
