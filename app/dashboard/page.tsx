'use client';

import { useState, useEffect } from 'react';
import { startOfDay, addDays, subDays, isSameDay, format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Loader2, ChevronLeft, ChevronRight, Calendar } from 'lucide-react';
import EventList from '@/components/dashboard/EventList';

export default function DashboardPage() {
    const [currentDate, setCurrentDate] = useState(new Date());
    const [events, setEvents] = useState([]);
    const [loading, setLoading] = useState(true);

    const fetchEvents = async () => {
        // Don't set loading to true on background refreshes if we already have data
        if (events.length === 0) setLoading(true);

        try {
            const res = await fetch(`/api/events?date=${format(currentDate, 'yyyy-MM-dd')}`);
            if (res.ok) {
                const data = await res.json();
                setEvents(data.events);
            }
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchEvents();
        // Poll every 30 seconds for updates on the selected date
        const timer = setInterval(fetchEvents, 30000);
        return () => clearInterval(timer);
    }, [currentDate]); // Re-run when date changes

    const handlePrevDay = () => setCurrentDate(prev => subDays(prev, 1));
    const handleNextDay = () => setCurrentDate(prev => addDays(prev, 1));
    const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.value) {
            // Create date at noon to avoid timezone rolling issues with simple string parsing
            const [year, month, day] = e.target.value.split('-').map(Number);
            setCurrentDate(new Date(year, month - 1, day, 12));
        }
    };

    const isToday = isSameDay(currentDate, new Date());

    const [showSwapsModal, setShowSwapsModal] = useState(false);
    const [showInProgressModal, setShowInProgressModal] = useState(false);
    const [showCancelledModal, setShowCancelledModal] = useState(false);

    // Helper to extract all swaps
    const getAllSwaps = () => {
        return events.flatMap((e: any) =>
            (e.swaps || []).map((s: any) => ({
                ...s,
                original_event: e
            }))
        );
    };

    const swapsList = getAllSwaps();
    const inProgressList = events.filter((e: any) => e.status === 'EM_ANDAMENTO');
    const cancelledList = events.filter((e: any) => e.status === 'CANCELADO');

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                <div className="flex items-center gap-4">
                    <div className="flex items-center bg-white rounded-lg shadow p-1">
                        <button
                            onClick={handlePrevDay}
                            className="p-2 hover:bg-gray-100 rounded-lg text-gray-600 transition-colors"
                            title="Dia Anterior"
                        >
                            <ChevronLeft size={20} />
                        </button>

                        <div className="flex items-center px-4 border-l border-r border-gray-200">
                            <Calendar size={18} className="text-gray-500 mr-2" />
                            <span className="font-semibold text-gray-800 capitalize min-w-[140px] text-center">
                                {format(currentDate, "dd 'de' MMMM", { locale: ptBR })}
                            </span>
                            <input
                                type="date"
                                value={format(currentDate, 'yyyy-MM-dd')}
                                onChange={handleDateChange}
                                className="absolute opacity-0 w-[140px] cursor-pointer"
                            />
                        </div>

                        <button
                            onClick={handleNextDay}
                            className="p-2 hover:bg-gray-100 rounded-lg text-gray-600 transition-colors"
                            title="Próximo Dia"
                        >
                            <ChevronRight size={20} />
                        </button>
                    </div>

                    {!isToday && (
                        <button
                            onClick={() => setCurrentDate(new Date())}
                            className="text-sm text-blue-600 hover:text-blue-800 font-medium"
                        >
                            Voltar para Hoje
                        </button>
                    )}
                </div>

                <div className="space-x-2">
                    <a href="/dashboard/import" className="inline-block bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 font-medium text-sm transition-colors shadow-sm">
                        Nova Importação
                    </a>
                </div>
            </div>

            {/* Basic Stats Stub (Dynamic data to be added later if needed) */}
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                <div className="bg-white p-4 rounded shadow">
                    <h3 className="text-gray-500 text-sm">Previstos</h3>
                    <p className="text-2xl font-bold">{events.length}</p>
                </div>
                <div
                    className="bg-white p-4 rounded shadow cursor-pointer hover:bg-blue-50 transition-colors border border-transparent hover:border-blue-200"
                    onClick={() => setShowInProgressModal(true)}
                >
                    <h3 className="text-gray-500 text-sm">Em Andamento</h3>
                    <p className="text-2xl font-bold text-blue-600">
                        {events.filter((e: any) => e.status === 'EM_ANDAMENTO').length}
                    </p>
                </div>
                <div className="bg-white p-4 rounded shadow">
                    <h3 className="text-gray-500 text-sm">Concluídos</h3>
                    <p className="text-2xl font-bold text-green-600">
                        {events.filter((e: any) => e.status === 'CONCLUIDO').length}
                    </p>
                </div>
                <div
                    className="bg-white p-4 rounded shadow cursor-pointer hover:bg-red-50 transition-colors border border-transparent hover:border-red-200"
                    onClick={() => setShowCancelledModal(true)}
                >
                    <h3 className="text-gray-500 text-sm">Cancelados</h3>
                    <p className="text-2xl font-bold text-red-600">
                        {events.filter((e: any) => e.status === 'CANCELADO').length}
                    </p>
                </div>
                <div
                    className="bg-white p-4 rounded shadow cursor-pointer hover:bg-orange-50 transition-colors border border-transparent hover:border-orange-200"
                    onClick={() => setShowSwapsModal(true)}
                >
                    <h3 className="text-gray-500 text-sm">Trocas</h3>
                    <p className="text-2xl font-bold text-orange-600">
                        {events.filter((e: any) => e.swaps && e.swaps.length > 0).length}
                    </p>
                </div>
            </div>

            <div className="bg-white rounded shadow overflow-hidden">
                <div className="p-4 border-b">
                    <h2 className="font-semibold text-gray-700">Escala de Limpeza</h2>
                </div>

                {loading ? (
                    <div className="p-12 flex justify-center">
                        <Loader2 className="animate-spin h-8 w-8 text-blue-600" />
                    </div>
                ) : events.length === 0 ? (
                    <div className="p-8 text-center text-gray-500">
                        Nenhum evento importado para hoje.
                    </div>
                ) : (
                    <EventList events={events} />
                )}
            </div>

            {showSwapsModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
                    <div className="bg-white rounded-lg p-6 max-w-4xl w-full max-h-[80vh] overflow-y-auto">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-xl font-bold text-gray-800">Relatório de Trocas do Dia</h3>
                            <button
                                onClick={() => setShowSwapsModal(false)}
                                className="text-gray-500 hover:text-gray-700 font-bold text-xl"
                            >
                                &times;
                            </button>
                        </div>

                        {swapsList.length === 0 ? (
                            <p className="text-center text-gray-500 py-8">Nenhuma troca registrada hoje.</p>
                        ) : (
                            <table className="min-w-full divide-y divide-gray-200">
                                <thead className="bg-gray-50">
                                    <tr>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Hora Evento</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Carro Original</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Novo Carro</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Motivo</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Observação</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Criado em</th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-200">
                                    {swapsList.map((swap: any) => (
                                        <tr key={swap.id}>
                                            <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                                                {format(new Date(swap.original_event.hora_viagem), 'HH:mm')}
                                            </td>
                                            <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-red-600">
                                                {swap.original_vehicle?.client_vehicle_number || '-'}
                                            </td>
                                            <td className="px-4 py-3 whitespace-nowrap text-sm font-bold text-green-600">
                                                {swap.replacement_vehicle?.client_vehicle_number || '-'}
                                            </td>
                                            <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700">
                                                {swap.motivo}
                                            </td>
                                            <td className="px-4 py-3 text-sm text-gray-500 max-w-xs truncate">
                                                {swap.observacao || '-'}
                                            </td>
                                            <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                                                {format(new Date(swap.created_at), 'HH:mm')}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}

                        <div className="mt-6 flex justify-end">
                            <button
                                onClick={() => setShowSwapsModal(false)}
                                className="px-4 py-2 bg-gray-200 text-gray-800 rounded hover:bg-gray-300"
                            >
                                Fechar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {showInProgressModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
                    <div className="bg-white rounded-lg p-6 max-w-4xl w-full max-h-[80vh] overflow-y-auto">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-xl font-bold text-gray-800">Veículos em Andamento</h3>
                            <button
                                onClick={() => setShowInProgressModal(false)}
                                className="text-gray-500 hover:text-gray-700 font-bold text-xl"
                            >
                                &times;
                            </button>
                        </div>

                        {inProgressList.length === 0 ? (
                            <p className="text-center text-gray-500 py-8">Nenhum veículo em andamento no momento.</p>
                        ) : (
                            <table className="min-w-full divide-y divide-gray-200">
                                <thead className="bg-gray-50">
                                    <tr>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Carro</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Colaborador</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Início</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Meta (H-1)</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-200">
                                    {inProgressList.map((event: any) => (
                                        <tr key={event.id}>
                                            <td className="px-4 py-3 whitespace-nowrap text-sm font-bold text-gray-900">
                                                {event.vehicle.client_vehicle_number}
                                            </td>
                                            <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700">
                                                {event.cleaner?.name || '-'}
                                            </td>
                                            <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                                                {event.started_at ? format(new Date(event.started_at), 'HH:mm') : '-'}
                                            </td>
                                            <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                                                {format(new Date(event.liberar_ate_at), 'HH:mm')}
                                            </td>
                                            <td className="px-4 py-3 whitespace-nowrap text-sm">
                                                <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-blue-100 text-blue-800">
                                                    Em Andamento
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}

                        <div className="mt-6 flex justify-end">
                            <button
                                onClick={() => setShowInProgressModal(false)}
                                className="px-4 py-2 bg-gray-200 text-gray-800 rounded hover:bg-gray-300"
                            >
                                Fechar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {showCancelledModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
                    <div className="bg-white rounded-lg p-6 max-w-4xl w-full max-h-[80vh] overflow-y-auto">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-xl font-bold text-gray-800">Veículos Cancelados</h3>
                            <button
                                onClick={() => setShowCancelledModal(false)}
                                className="text-gray-500 hover:text-gray-700 font-bold text-xl"
                            >
                                &times;
                            </button>
                        </div>

                        {cancelledList.length === 0 ? (
                            <p className="text-center text-gray-500 py-8">Nenhum veículo cancelado hoje.</p>
                        ) : (
                            <table className="min-w-full divide-y divide-gray-200">
                                <thead className="bg-gray-50">
                                    <tr>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Carro</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Hora Prevista</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Saída</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Empresa</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-200">
                                    {cancelledList.map((event: any) => (
                                        <tr key={event.id}>
                                            <td className="px-4 py-3 whitespace-nowrap text-sm font-bold text-gray-900">
                                                {event.vehicle.client_vehicle_number}
                                            </td>
                                            <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700">
                                                {format(new Date(event.hora_viagem), 'HH:mm')}
                                            </td>
                                            <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                                                {format(new Date(event.saida_programada_at), 'HH:mm')}
                                            </td>
                                            <td className="px-4 py-3 text-sm text-gray-500 max-w-xs truncate">
                                                {event.empresa || '-'}
                                            </td>
                                            <td className="px-4 py-3 whitespace-nowrap text-sm">
                                                <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-red-100 text-red-800">
                                                    Cancelado
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}

                        <div className="mt-6 flex justify-end">
                            <button
                                onClick={() => setShowCancelledModal(false)}
                                className="px-4 py-2 bg-gray-200 text-gray-800 rounded hover:bg-gray-300"
                            >
                                Fechar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div >
    );
}
