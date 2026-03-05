'use client';

import { useState, useEffect } from 'react';
import { startOfDay, addDays, subDays, isSameDay, format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Loader2, ChevronLeft, ChevronRight, Calendar, Search, FileText, Table, Play } from 'lucide-react';
import WebEventList from '@/components/dashboard/WebEventList';
import EventDashboardList from '@/components/dashboard/EventList';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

export default function DashboardPage() {
    const [currentDate, setCurrentDate] = useState(new Date());
    const [events, setEvents] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<'schedule' | 'yard'>('schedule');
    const [yardItems, setYardItems] = useState<any[]>([]);
    const [yardLoading, setYardLoading] = useState(false);
    const [newVehicleNumber, setNewVehicleNumber] = useState('');
    const [newVehicleStatus, setNewVehicleStatus] = useState<'SUJO' | 'LIMPO'>('SUJO');
    const [autoOpenEventId, setAutoOpenEventId] = useState<string | null>(null);

    const fetchEvents = async () => {
        // Don't set loading to true on background refreshes if we already have data
        if (events.length === 0) setLoading(true);
        setError(null);

        try {
            const res = await fetch(`/api/events?date=${format(currentDate, 'yyyy-MM-dd')}`);
            if (res.ok) {
                const data = await res.json();
                setEvents(data.events);
            } else {
                const data = await res.json().catch(() => ({}));
                setError(data.details || data.error || 'Erro ao carregar escala');
            }
        } catch (error: any) {
            console.error(error);
            setError(error.message || 'Erro de conexão');
        } finally {
            setLoading(false);
        }
    };

    const fetchYardItems = async () => {
        setYardLoading(true);
        try {
            const res = await fetch('/api/yard');
            if (res.ok) {
                const data = await res.json();
                setYardItems(data.yardItems);
            }
        } catch (error) {
            console.error('Error fetching yard inventory:', error);
        } finally {
            setYardLoading(false);
        }
    };

    useEffect(() => {
        fetchEvents();
        if (activeTab === 'yard') fetchYardItems();
    }, [currentDate, activeTab]); // Re-run when date or tab changes

    const handlePrevDay = () => setCurrentDate(prev => subDays(prev, 1));
    const handleNextDay = () => setCurrentDate(prev => addDays(prev, 1));
    const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.value) {
            try {
                const [year, month, day] = e.target.value.split('-').map(Number);
                if (!isNaN(year) && !isNaN(month) && !isNaN(day)) {
                    setCurrentDate(new Date(year, month - 1, day, 12));
                }
            } catch (err) {
                console.error("Invalid date selected", err);
            }
        }
    };

    const isToday = isSameDay(currentDate, new Date());

    const [showSwapsModal, setShowSwapsModal] = useState(false);
    const [showInProgressModal, setShowInProgressModal] = useState(false);
    const [showCancelledModal, setShowCancelledModal] = useState(false);
    const [showCompletedModal, setShowCompletedModal] = useState(false);

    // Search states
    const [cancelledSearch, setCancelledSearch] = useState('');
    const [inProgressSearch, setInProgressSearch] = useState('');
    const [swapsSearch, setSwapsSearch] = useState('');
    const [completedSearch, setCompletedSearch] = useState('');

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
    const completedList = events.filter((e: any) => e.status === 'CONCLUIDO');

    // Filtered lists
    const filteredCancelled = cancelledList.filter((e: any) => {
        const searchLower = cancelledSearch.toLowerCase();
        return (
            e.vehicle.client_vehicle_number?.toString().includes(searchLower) ||
            e.empresa?.toLowerCase().includes(searchLower)
        );
    });

    const filteredCompleted = completedList.filter((e: any) => {
        const searchLower = completedSearch.toLowerCase();
        return (
            e.vehicle.client_vehicle_number?.toString().includes(searchLower) ||
            e.cleaner?.name?.toLowerCase().includes(searchLower) ||
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

        // Hide CANCELADO from main list unless explicitly selected (but we are removing the option)
        const isCancelled = e.status === 'CANCELADO';
        const matchesStatus = statusFilter === 'TODOS' ? !isCancelled : e.status === statusFilter;

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

    const handleAddYardVehicle = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newVehicleNumber) return;

        try {
            const res = await fetch('/api/yard', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    vehicle_number: newVehicleNumber,
                    status: newVehicleStatus
                })
            });

            if (res.ok) {
                setNewVehicleNumber('');
                fetchYardItems();
                alert('Veículo cadastrado no pátio com sucesso!');
            } else {
                const errorData = await res.json().catch(() => ({}));
                alert(`Erro ao cadastrar: ${errorData.error || 'Erro desconhecido'}`);
            }
        } catch (error) {
            console.error('Error adding yard vehicle:', error);
            alert('Erro de conexão ao cadastrar veículo no pátio.');
        }
    };

    const handleManualProgram = async (vehicleId: string) => {
        try {
            const res = await fetch('/api/events/manual', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ vehicle_id: vehicleId })
            });

            if (res.ok) {
                const event = await res.json();
                fetchYardItems();
                fetchEvents();
                // Sequence for the user: Switch tab and open the modal
                setActiveTab('schedule');
                setAutoOpenEventId(event.id);
            } else {
                const errorData = await res.json().catch(() => ({}));

                // User requirement: If already programmed, still go to the start modal
                if (res.status === 400 && errorData.eventId) {
                    fetchYardItems();
                    fetchEvents();
                    setActiveTab('schedule');
                    setAutoOpenEventId(errorData.eventId);
                    return;
                }

                alert(`Erro ao programar: ${errorData.error || errorData.details || 'Erro desconhecido'}`);
            }
        } catch (error) {
            console.error('Error manual programming:', error);
            alert('Erro de conexão ao programar carro.');
        }
    };

    const handleRemoveYardVehicle = async (id: string) => {
        if (!confirm('Remover veículo do pátio?')) return;

        try {
            const res = await fetch(`/api/yard?id=${id}`, { method: 'DELETE' });
            if (res.ok) {
                fetchYardItems();
            }
        } catch (error) {
            console.error('Error removing yard vehicle:', error);
        }
    };

    return (
        <div className="space-y-6">
            {/* --- DESKTOP VERSION (Original Designer) --- */}
            <div className="hidden md:block space-y-6">
                {/* Date Navigation & Import */}
                <div className="flex justify-between items-center mb-6">
                    <div className="flex items-center gap-4 bg-white px-4 py-2 rounded-xl shadow-sm border border-gray-100">
                        <button onClick={handlePrevDay} className="p-1 hover:bg-gray-100 rounded-lg"><ChevronLeft size={20} /></button>
                        <div className="flex items-center gap-2">
                            <Calendar size={18} className="text-gray-400" />
                            <span className="font-bold text-gray-700">{format(currentDate, "dd 'De' MMMM", { locale: ptBR })}</span>
                        </div>
                        <button onClick={handleNextDay} className="p-1 hover:bg-gray-100 rounded-lg"><ChevronRight size={20} /></button>
                    </div>
                    <a href="/dashboard/import" className="px-6 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700 shadow-md shadow-blue-100 transition-all">
                        Nova Importação
                    </a>
                </div>

                {/* Original Colored Metric Cards (Vibrant like Foto 02) */}
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
                    <div className="bg-white p-5 rounded-2xl border-l-[6px] border-blue-600 shadow-xl shadow-blue-50/50 transform hover:-translate-y-1 transition-all">
                        <p className="text-[10px] font-black text-blue-600 uppercase tracking-widest mb-1">Total</p>
                        <p className="text-4xl font-black text-blue-900">{events.length}</p>
                    </div>
                    <div className="bg-white p-5 rounded-2xl border-l-[6px] border-gray-400 shadow-xl shadow-gray-50/50 transform hover:-translate-y-1 transition-all">
                        <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1">Previstos</p>
                        <p className="text-4xl font-black text-gray-800">{events.filter((e: any) => e.status === 'PREVISTO').length}</p>
                    </div>
                    <div className="bg-[#EBF5FF] p-5 rounded-2xl border-l-[6px] border-blue-400 shadow-xl shadow-blue-100/50 transform hover:-translate-y-1 transition-all cursor-pointer" onClick={() => setShowInProgressModal(true)}>
                        <p className="text-[10px] font-black text-blue-600 uppercase tracking-widest mb-1">Em Andamento</p>
                        <p className="text-4xl font-black text-blue-800">{inProgressList.length}</p>
                    </div>
                    <div className="bg-[#F0FDF4] p-5 rounded-2xl border-l-[6px] border-green-500 shadow-xl shadow-green-100/50 transform hover:-translate-y-1 transition-all cursor-pointer" onClick={() => setShowCompletedModal(true)}>
                        <p className="text-[10px] font-black text-green-600 uppercase tracking-widest mb-1">Concluídos</p>
                        <p className="text-4xl font-black text-green-800">{completedList.length}</p>
                    </div>
                    <div className="bg-[#FEF2F2] p-5 rounded-2xl border-l-[6px] border-red-500 shadow-xl shadow-red-100/50 transform hover:-translate-y-1 transition-all cursor-pointer" onClick={() => setShowCancelledModal(true)}>
                        <p className="text-[10px] font-black text-red-600 uppercase tracking-widest mb-1">Cancelados</p>
                        <p className="text-4xl font-black text-red-800">{cancelledList.length}</p>
                    </div>
                    <div className="bg-[#FFFBEB] p-5 rounded-2xl border-l-[6px] border-amber-500 shadow-xl shadow-amber-100/50 transform hover:-translate-y-1 transition-all cursor-pointer" onClick={() => setShowSwapsModal(true)}>
                        <p className="text-[10px] font-black text-amber-600 uppercase tracking-widest mb-1">Trocas</p>
                        <p className="text-4xl font-black text-amber-800">{swapsList.length}</p>
                    </div>
                </div>

                {/* Tab Switcher */}
                <div className="flex gap-4 mb-6 border-b border-gray-200">
                    <button
                        onClick={() => setActiveTab('schedule')}
                        className={`pb-3 px-6 text-sm font-bold transition-all ${activeTab === 'schedule' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                        Escala de Limpeza
                    </button>
                    <button
                        onClick={() => setActiveTab('yard')}
                        className={`pb-3 px-6 text-sm font-bold transition-all ${activeTab === 'yard' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                        Estoque do Pátio
                    </button>
                </div>

                {activeTab === 'schedule' ? (
                    /* Main Content Area (Original Filters & Table) */
                    <div className="space-y-6">
                        <div className="flex flex-col md:flex-row gap-4 bg-white p-4 rounded-2xl border border-gray-100 shadow-sm">
                            <div className="flex-1 flex gap-3">
                                <div className="bg-gray-50 flex items-center gap-2 px-3 py-2 rounded-xl border border-gray-200 group focus-within:ring-2 focus-within:ring-blue-500/20 transition-all">
                                    <Search size={18} className="text-gray-400" />
                                    <input
                                        type="text"
                                        placeholder="Pesquisar por carro, empresa, motorista..."
                                        value={mainSearch}
                                        onChange={(e) => setMainSearch(e.target.value)}
                                        className="bg-transparent border-none focus:ring-0 text-sm font-medium text-gray-700 outline-none w-full"
                                    />
                                </div>
                            </div>
                            <div className="flex gap-3">
                                <select
                                    value={statusFilter}
                                    onChange={(e) => setStatusFilter(e.target.value)}
                                    className="bg-white px-4 py-2 border border-gray-200 rounded-xl text-sm font-medium text-gray-700 focus:ring-2 focus:ring-blue-500/20 outline-none"
                                >
                                    <option value="TODOS">Todos Status</option>
                                    <option value="PREVISTO">Previsto</option>
                                    <option value="EM_ANDAMENTO">Em Andamento</option>
                                    <option value="CONCLUIDO">Concluído</option>
                                    <option value="CANCELADO">Cancelado</option>
                                </select>
                                <button onClick={exportMainToPDF} className="px-5 py-2.5 bg-red-600 text-white rounded-xl text-sm font-black flex items-center gap-2 hover:bg-red-700 shadow-md shadow-red-100 transition-all"><FileText size={16} /> PDF</button>
                                <button onClick={exportMainToExcel} className="px-5 py-2.5 bg-green-600 text-white rounded-xl text-sm font-black flex items-center gap-2 hover:bg-green-700 shadow-md shadow-green-100 transition-all"><Table size={16} /> Excel</button>
                            </div>
                        </div>

                        <h2 className="text-xl font-black text-gray-800 tracking-tight">Escala de Limpeza</h2>
                        <WebEventList events={filteredEvents} autoOpenEventId={autoOpenEventId} />
                    </div>
                ) : (
                    /* Yard Inventory Content */
                    <div className="space-y-6">
                        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                            <h3 className="text-lg font-bold text-gray-800 mb-4">Cadastrar Veículo no Pátio</h3>
                            <form onSubmit={handleAddYardVehicle} className="flex flex-col md:flex-row gap-4 items-end">
                                <div className="space-y-1.5 flex-1">
                                    <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Número do Carro</label>
                                    <input
                                        type="text"
                                        value={newVehicleNumber}
                                        onChange={(e) => setNewVehicleNumber(e.target.value)}
                                        placeholder="Ex: 2700"
                                        className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 outline-none font-bold"
                                    />
                                </div>
                                <div className="space-y-1.5 w-40">
                                    <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Status</label>
                                    <select
                                        value={newVehicleStatus}
                                        onChange={(e) => setNewVehicleStatus(e.target.value as any)}
                                        className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 outline-none font-bold"
                                    >
                                        <option value="SUJO">Sujo</option>
                                        <option value="LIMPO">Limpo</option>
                                    </select>
                                </div>
                                <button
                                    type="submit"
                                    className="px-8 py-2.5 bg-blue-600 text-white rounded-xl font-black hover:bg-blue-700 transition-all shadow-md shadow-blue-100"
                                >
                                    Adicionar ao Pátio
                                </button>
                            </form>
                        </div>

                        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                            <div className="p-4 bg-gray-50 border-b border-gray-100 flex justify-between items-center">
                                <h3 className="font-black text-gray-800 uppercase tracking-widest text-xs">Veículos no Pátio</h3>
                                <span className="bg-blue-100 text-blue-700 px-3 py-1 rounded-full text-[10px] font-black">{yardItems.length} VEÍCULOS</span>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full text-left">
                                    <thead>
                                        <tr className="border-b border-gray-100">
                                            <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Carro</th>
                                            <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-center">Status</th>
                                            <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-center hidden lg:table-cell">Faxineiro</th>
                                            <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-center hidden xl:table-cell">Última Limpeza</th>
                                            <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest hidden lg:table-cell">Ingresso no Pátio</th>
                                            <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">Ações</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-50">
                                        {yardItems.length === 0 ? (
                                            <tr>
                                                <td colSpan={6} className="px-6 py-12 text-center text-gray-400 font-medium">Nenhum veículo no pátio momento.</td>
                                            </tr>
                                        ) : (
                                            yardItems.map((item) => (
                                                <tr key={item.id} className="hover:bg-gray-50/50 transition-colors">
                                                    <td className="px-6 py-4">
                                                        <span className="text-lg font-black text-gray-800">{item.vehicle.client_vehicle_number}</span>
                                                    </td>
                                                    <td className="px-6 py-4 text-center">
                                                        <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${item.status === 'LIMPO'
                                                            ? 'bg-green-100 text-green-700'
                                                            : item.status === 'EM_ANDAMENTO'
                                                                ? 'bg-blue-100 text-blue-700'
                                                                : 'bg-gray-100 text-gray-700'
                                                            }`}>
                                                            {item.status}
                                                        </span>
                                                    </td>
                                                    <td className="px-6 py-4 text-center hidden lg:table-cell">
                                                        <span className="text-[11px] font-bold text-gray-600">
                                                            {item.last_cleaner_name || '--'}
                                                        </span>
                                                    </td>
                                                    <td className="px-6 py-4 text-center hidden xl:table-cell">
                                                        <span className="text-[11px] font-medium text-gray-500">
                                                            {item.last_cleaned_at ? format(new Date(item.last_cleaned_at), "HH:mm 'em' dd/MM", { locale: ptBR }) : '--:--'}
                                                        </span>
                                                    </td>
                                                    <td className="px-6 py-4 hidden lg:table-cell">
                                                        <span className="text-sm font-medium text-gray-500">
                                                            {format(new Date(item.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                                                        </span>
                                                    </td>
                                                    <td className="px-6 py-4 text-right flex justify-end gap-3 items-center">
                                                        <button
                                                            onClick={() => handleManualProgram(item.vehicle.id)}
                                                            disabled={item.status === 'EM_ANDAMENTO'}
                                                            className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all flex items-center gap-1 ${item.status === 'EM_ANDAMENTO'
                                                                ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                                                                : 'bg-blue-600 text-white hover:bg-blue-700'
                                                                }`}
                                                        >
                                                            <Play size={10} fill="currentColor" /> Programar
                                                        </button>
                                                        <button
                                                            onClick={() => handleRemoveYardVehicle(item.id)}
                                                            className="text-red-500 hover:text-red-700 text-[10px] font-black uppercase tracking-wider"
                                                        >
                                                            Remover
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {error && (
                <div className="bg-red-50 border-l-4 border-red-400 p-4 mb-6 rounded-xl">
                    <div className="flex">
                        <div className="flex-shrink-0">
                            <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                            </svg>
                        </div>
                        <div className="ml-3">
                            <p className="text-sm text-red-700 font-bold">{error}</p>
                            <button onClick={fetchEvents} className="mt-2 text-xs text-red-600 underline hover:text-red-800">Tentar novamente</button>
                        </div>
                    </div>
                </div>
            )}

            {/* --- MOBILE/PWA VERSION (New Redesign) --- */}
            <div className="md:hidden">
                {loading ? (
                    <div className="flex items-center justify-center min-h-[60vh]">
                        <Loader2 className="w-10 h-10 animate-spin text-blue-600" />
                    </div>
                ) : (
                    <EventDashboardList events={events} />
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
                                            <td className="px-4 py-3 text-sm text-gray-500 max-w-md break-words">
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
                                            <td className="px-4 py-3 text-sm text-gray-500 max-w-md break-words">
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

            {showCompletedModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
                    <div className="bg-white rounded-lg p-6 max-w-6xl w-full max-h-[80vh] overflow-y-auto">
                        <div className="mb-6">
                            <div className="flex justify-between items-center mb-4">
                                <h3 className="text-xl font-bold text-gray-800">Veículos Concluídos</h3>
                                <button
                                    onClick={() => setShowCompletedModal(false)}
                                    className="text-gray-500 hover:text-gray-700 font-bold text-xl"
                                >
                                    &times;
                                </button>
                            </div>

                            <div className="flex gap-3 items-center">
                                <Search size={18} className="text-gray-400" />
                                <input
                                    type="text"
                                    placeholder="Pesquisar por carro, colaborador, empresa..."
                                    value={completedSearch}
                                    onChange={(e) => setCompletedSearch(e.target.value)}
                                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                                />
                            </div>
                        </div>

                        {completedList.length === 0 ? (
                            <p className="text-center text-gray-500 py-8">Nenhum veículo concluído hoje.</p>
                        ) : (
                            <table className="min-w-full divide-y divide-gray-200">
                                <thead className="bg-gray-50">
                                    <tr>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Carro</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Colaborador</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Início</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Fim</th>
                                        <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Interno</th>
                                        <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Externo</th>
                                        <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Pneus</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Observação</th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-200">
                                    {filteredCompleted.map((event: any) => (
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
                                                {event.finished_at ? format(new Date(event.finished_at), 'HH:mm') : '-'}
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                <div className={`mx-auto w-4 h-4 rounded-full border ${event.check_interno ? 'bg-green-500 border-green-600' : 'bg-gray-100 border-gray-300'}`} />
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                <div className={`mx-auto w-4 h-4 rounded-full border ${event.check_externo ? 'bg-green-500 border-green-600' : 'bg-gray-100 border-gray-300'}`} />
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                <div className={`mx-auto w-4 h-4 rounded-full border ${event.check_pneus ? 'bg-green-500 border-green-600' : 'bg-gray-100 border-gray-300'}`} />
                                            </td>
                                            <td className="px-4 py-3 text-sm text-gray-500 max-w-xs break-words">
                                                {event.observacao_operacao || '-'}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}

                        <div className="mt-6 flex justify-end">
                            <button
                                onClick={() => setShowCompletedModal(false)}
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
