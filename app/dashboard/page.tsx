'use client';

import { useState, useEffect } from 'react';
import { startOfDay, addDays, subDays, isSameDay, format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Loader2, ChevronLeft, ChevronRight, Calendar } from 'lucide-react';
import EventList from '@/components/dashboard/EventList';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

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

    // Search states
    const [cancelledSearch, setCancelledSearch] = useState('');
    const [inProgressSearch, setInProgressSearch] = useState('');
    const [swapsSearch, setSwapsSearch] = useState('');

    // Main table search and filter
    const [mainSearch, setMainSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('TODOS');

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

    // Filtered lists
    const filteredCancelled = cancelledList.filter((e: any) => {
        const searchLower = cancelledSearch.toLowerCase();
        return (
            e.vehicle.client_vehicle_number?.toString().includes(searchLower) ||
            e.empresa?.toLowerCase().includes(searchLower)
        );
    });

    // Export functions
    const exportCancelledToPDF = () => {
        const doc = new jsPDF();
        doc.text('Veículos Cancelados', 14, 15);
        doc.text(`Data: ${format(currentDate, 'dd/MM/yyyy')}`, 14, 22);

        const tableData = filteredCancelled.map((e: any) => [
            e.vehicle.client_vehicle_number,
            format(new Date(e.hora_viagem), 'HH:mm'),
            format(new Date(e.saida_programada_at), 'HH:mm'),
            e.empresa || '-',
            'Cancelado'
        ]);

        autoTable(doc, {
            head: [['Carro', 'Hora Prevista', 'Saída', 'Empresa', 'Status']],
            body: tableData,
            startY: 28,
        });

        doc.save(`cancelados_${format(currentDate, 'yyyy-MM-dd')}.pdf`);
    };

    const exportCancelledToExcel = () => {
        const tableData = filteredCancelled.map((e: any) => ({
            'Carro': e.vehicle.client_vehicle_number,
            'Hora Prevista': format(new Date(e.hora_viagem), 'HH:mm'),
            'Saída': format(new Date(e.saida_programada_at), 'HH:mm'),
            'Empresa': e.empresa || '-',
            'Status': 'Cancelado'
        }));

        const ws = XLSX.utils.json_to_sheet(tableData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Cancelados');
        XLSX.writeFile(wb, `cancelados_${format(currentDate, 'yyyy-MM-dd')}.xlsx`);
    };

    // Main table filtering
    const filteredEvents = events.filter((e: any) => {
        const searchLower = mainSearch.toLowerCase();
        const matchesSearch = (
            e.vehicle.client_vehicle_number?.toString().includes(searchLower) ||
            e.empresa?.toLowerCase().includes(searchLower) ||
            e.motorista?.toLowerCase().includes(searchLower)
        );
        const matchesStatus = statusFilter === 'TODOS' || e.status === statusFilter;
        return matchesSearch && matchesStatus;
    });

    // Main table export functions
    const exportMainToPDF = () => {
        const doc = new jsPDF();
        doc.text('Escala de Limpeza', 14, 15);
        doc.text(`Data: ${format(currentDate, 'dd/MM/yyyy')}`, 14, 22);

        const tableData = filteredEvents.map((e: any) => [
            e.vehicle.client_vehicle_number,
            format(new Date(e.hora_viagem), 'HH:mm'),
            format(new Date(e.saida_programada_at), 'HH:mm'),
            e.empresa || '-',
            e.status
        ]);

        autoTable(doc, {
            head: [['Carro', 'Hora', 'Saída', 'Empresa', 'Status']],
            body: tableData,
            startY: 28,
        });

        doc.save(`escala_limpeza_${format(currentDate, 'yyyy-MM-dd')}.pdf`);
    };

    const exportMainToExcel = () => {
        const tableData = filteredEvents.map((e: any) => ({
            'Carro': e.vehicle.client_vehicle_number,
            'Hora': format(new Date(e.hora_viagem), 'HH:mm'),
            'Saída': format(new Date(e.saida_programada_at), 'HH:mm'),
            'Empresa': e.empresa || '-',
            'Status': e.status
        }));

        const ws = XLSX.utils.json_to_sheet(tableData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Escala');
        XLSX.writeFile(wb, `escala_limpeza_${format(currentDate, 'yyyy-MM-dd')}.xlsx`);
    };

    return (
        <div className="space-y-6">
            {/* Main Content Area */}
            {loading ? (
                <div className="flex items-center justify-center min-h-[60vh]">
                    <Loader2 className="w-10 h-10 animate-spin text-blue-600" />
                </div>
            ) : (
                <div className="max-w-7xl mx-auto">
                    {/* Date Navigation (Desktop Only) */}
                    <div className="hidden md:flex justify-between items-center mb-6 px-4">
                        <div className="flex items-center gap-3 bg-white p-2 rounded-xl shadow-sm border border-gray-100">
                            <button onClick={handlePrevDay} className="p-2 hover:bg-gray-50 rounded-lg transition-colors"><ChevronLeft size={20} /></button>
                            <span className="font-bold text-gray-700 w-40 text-center uppercase tracking-wider">
                                {format(currentDate, "dd 'de' MMMM", { locale: ptBR })}
                            </span>
                            <button onClick={handleNextDay} className="p-2 hover:bg-gray-50 rounded-lg transition-colors"><ChevronRight size={20} /></button>
                        </div>
                        <div className="flex gap-3">
                            <button onClick={() => setShowSwapsModal(true)} className="px-4 py-2 bg-white border border-gray-200 rounded-xl text-sm font-bold text-gray-600 hover:bg-gray-50 shadow-sm transition-all">Trocas</button>
                            <a href="/dashboard/import" className="px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700 shadow-md shadow-blue-100 transition-all">Importar</a>
                        </div>
                    </div>

                    {/* The Clean Event List */}
                    <EventList events={events} />
                </div>
            )}

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
                        <div className="mb-6">
                            <div className="flex justify-between items-center mb-4">
                                <h3 className="text-xl font-bold text-gray-800">Veículos Cancelados</h3>
                                <button
                                    onClick={() => setShowCancelledModal(false)}
                                    className="text-gray-500 hover:text-gray-700 font-bold text-xl"
                                >
                                    &times;
                                </button>
                            </div>

                            <div className="flex gap-3 items-center">
                                <input
                                    type="text"
                                    placeholder="Pesquisar por carro, empresa..."
                                    value={cancelledSearch}
                                    onChange={(e) => setCancelledSearch(e.target.value)}
                                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                                />
                                <button
                                    onClick={exportCancelledToPDF}
                                    className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium flex items-center gap-2"
                                >
                                    PDF
                                </button>
                                <button
                                    onClick={exportCancelledToExcel}
                                    className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium flex items-center gap-2"
                                >
                                    Excel
                                </button>
                            </div>
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
                                    {filteredCancelled.map((event: any) => (
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
        </div>
    );
}
