'use client';

import { useState, useEffect } from 'react';
import { format, subDays, differenceInMinutes } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Loader2, Search, Filter } from 'lucide-react';

export default function HistoryPage() {
    // Default to last 7 days
    const [startDate, setStartDate] = useState(format(subDays(new Date(), 7), 'yyyy-MM-dd'));
    const [endDate, setEndDate] = useState(format(new Date(), 'yyyy-MM-dd'));
    const [vehicleFilter, setVehicleFilter] = useState('');

    const [events, setEvents] = useState([]);
    const [loading, setLoading] = useState(false);

    const fetchHistory = async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams({
                startDate,
                endDate,
                ...(vehicleFilter && { vehicle: vehicleFilter })
            });

            const res = await fetch(`/api/history?${params.toString()}`);
            if (res.ok) {
                const data = await res.json();
                setEvents(data.events);
            }
        } catch (error) {
            console.error('Failed to fetch history:', error);
        } finally {
            setLoading(false);
        }
    };

    // Initial fetch
    useEffect(() => {
        fetchHistory();
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    return (
        <div className="space-y-6">
            <h1 className="text-2xl font-bold text-gray-800">Histórico de Limpezas</h1>

            {/* Filters */}
            <div className="bg-white p-4 rounded shadow flex flex-col md:flex-row gap-4 items-end">
                <div className="flex-1 w-full">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Período</label>
                    <div className="flex gap-2">
                        <input
                            type="date"
                            className="border rounded p-2 w-full"
                            value={startDate}
                            onChange={(e) => setStartDate(e.target.value)}
                        />
                        <span className="self-center">até</span>
                        <input
                            type="date"
                            className="border rounded p-2 w-full"
                            value={endDate}
                            onChange={(e) => setEndDate(e.target.value)}
                        />
                    </div>
                </div>

                <div className="w-full md:w-64">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Veículo (Prefixo)</label>
                    <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <Search className="h-4 w-4 text-gray-400" />
                        </div>
                        <input
                            type="text"
                            placeholder="Buscar carro..."
                            className="border rounded p-2 pl-10 w-full"
                            value={vehicleFilter}
                            onChange={(e) => setVehicleFilter(e.target.value)}
                        />
                    </div>
                </div>

                <button
                    onClick={fetchHistory}
                    className="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700 flex items-center gap-2"
                >
                    <Filter className="h-4 w-4" />
                    Filtrar
                </button>
            </div>

            {/* Results Table */}
            <div className="bg-white rounded shadow overflow-hidden">
                <div className="p-4 border-b border-gray-200">
                    <h2 className="font-semibold text-gray-700">
                        Resultados ({events.length})
                    </h2>
                </div>

                {loading ? (
                    <div className="p-12 flex justify-center">
                        <Loader2 className="animate-spin h-8 w-8 text-blue-600" />
                    </div>
                ) : events.length === 0 ? (
                    <div className="p-8 text-center text-gray-500">
                        Nenhum registro encontrado para os filtros selecionados.
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-300">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Data</th>
                                    <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Hora</th>
                                    <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Carro</th>
                                    <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Colaborador</th>
                                    <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Status</th>
                                    <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Meta (H-1)</th>
                                    <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Troca?</th>
                                    <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">No Prazo?</th>
                                    <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Duração</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200 bg-white">
                                {events.map((event: any) => {
                                    // Check for swap
                                    const hasSwap = event.swaps && event.swaps.length > 0;
                                    const swapInfo = hasSwap ? event.swaps[0] : null;

                                    return (
                                        <tr key={event.id}>
                                            <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                                                {format(new Date(event.data_viagem), 'dd/MM/yyyy')}
                                            </td>
                                            <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-900">
                                                {format(new Date(event.hora_viagem), 'HH:mm')}
                                            </td>
                                            <td className="whitespace-nowrap px-3 py-4 text-sm font-bold text-gray-900">
                                                {event.vehicle.client_vehicle_number}
                                            </td>
                                            <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                                                {event.cleaner?.name || '-'}
                                            </td>
                                            <td className="whitespace-nowrap px-3 py-4 text-sm">
                                                <span className={`inline-flex rounded-full px-2 text-xs font-semibold leading-5 
                                                    ${event.status === 'CONCLUIDO' ? 'bg-green-100 text-green-800' :
                                                        event.status === 'EM_ANDAMENTO' ? 'bg-blue-100 text-blue-800' :
                                                            event.status === 'CANCELADO' ? 'bg-red-100 text-red-800' :
                                                                'bg-gray-100 text-gray-800'}`}>
                                                    {event.status}
                                                </span>
                                            </td>
                                            <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                                                {format(new Date(event.liberar_ate_at), 'HH:mm')}
                                            </td>
                                            <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                                                {hasSwap ? (
                                                    <div className="flex flex-col">
                                                        <span className="text-xs font-bold text-orange-600">
                                                            Substituiu {swapInfo.original_vehicle?.client_vehicle_number}
                                                        </span>
                                                        <span className="text-[10px] text-gray-400 truncate max-w-[100px]" title={swapInfo.motivo}>
                                                            {swapInfo.motivo}
                                                        </span>
                                                    </div>
                                                ) : '-'}
                                            </td>
                                            <td className="whitespace-nowrap px-3 py-4 text-sm">
                                                {event.finished_at && event.liberar_ate_at ? (
                                                    new Date(event.finished_at) <= new Date(event.liberar_ate_at) ? (
                                                        <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-1 text-xs font-medium text-green-700">
                                                            Sim
                                                        </span>
                                                    ) : (
                                                        <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-1 text-xs font-medium text-red-700">
                                                            Não
                                                        </span>
                                                    )
                                                ) : (
                                                    <span className="text-gray-400">-</span>
                                                )}
                                            </td>
                                            <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                                                {event.started_at && event.finished_at ? (
                                                    (() => {
                                                        const diff = differenceInMinutes(new Date(event.finished_at), new Date(event.started_at));
                                                        const hours = Math.floor(diff / 60);
                                                        const minutes = diff % 60;
                                                        return `${hours > 0 ? `${hours}h ` : ''}${minutes}m`;
                                                    })()
                                                ) : (
                                                    <span className="text-gray-400">-</span>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}
