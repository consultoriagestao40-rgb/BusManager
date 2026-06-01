'use client';

import { useState, useEffect } from 'react';
import { startOfDay, addDays, subDays, isSameDay, format, subHours, differenceInMinutes } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Loader2, ChevronLeft, ChevronRight, Calendar, Search, FileText, Table, Play, Plus, Trash2, LogOut, RefreshCw, CheckCircle, X, Timer } from 'lucide-react';
import WebEventList from '@/components/dashboard/WebEventList';
import EventDashboardList from '@/components/dashboard/EventList';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { useRouter } from 'next/navigation';

// Sound utility for notifications
const playNotificationSound = (type: 'new' | 'alert' | 'yard-alert') => {
    try {
        const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const oscillator = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(audioCtx.destination);

        if (type === 'new') {
            // Soft notification for new items
            oscillator.type = 'sine';
            oscillator.frequency.setValueAtTime(880, audioCtx.currentTime); // A5
            oscillator.frequency.exponentialRampToValueAtTime(440, audioCtx.currentTime + 0.5);
            gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.5);
        } else if (type === 'yard-alert') {
            // Siren sound for critical yard alert (sawtooth linear sliding pitch)
            oscillator.type = 'sawtooth';
            oscillator.frequency.setValueAtTime(450, audioCtx.currentTime);
            oscillator.frequency.linearRampToValueAtTime(750, audioCtx.currentTime + 0.25);
            oscillator.frequency.linearRampToValueAtTime(450, audioCtx.currentTime + 0.5);
            gainNode.gain.setValueAtTime(0.08, audioCtx.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.5);
        } else {
            // Beep for critical time
            oscillator.type = 'square';
            oscillator.frequency.setValueAtTime(440, audioCtx.currentTime);
            oscillator.frequency.setValueAtTime(660, audioCtx.currentTime + 0.15);
            gainNode.gain.setValueAtTime(0.03, audioCtx.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);
        }

        oscillator.start();
        oscillator.stop(audioCtx.currentTime + 0.5);
    } catch (e) {
        console.warn('Audio feedback not supported or blocked');
    }
};

export default function DashboardPage() {
    const [currentDate, setCurrentDate] = useState(new Date());
    const [events, setEvents] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<'schedule' | 'yard'>('schedule');
    const [yardItems, setYardItems] = useState<any[]>([]);
    const [now, setNow] = useState(new Date());
    const [prevEventsCount, setPrevEventsCount] = useState(0);
    const [yardLoading, setYardLoading] = useState(false);
    const [newVehicleNumber, setNewVehicleNumber] = useState('');
    const [newVehicleStatus, setNewVehicleStatus] = useState<'SUJO' | 'LIMPO'>('SUJO');
    const [autoOpenEventId, setAutoOpenEventId] = useState<string | null>(null);
    const [user, setUser] = useState<{ name: string; role: string } | null>(null);
    const router = useRouter();

    const fetchUser = async () => {
        try {
            const res = await fetch('/api/auth/me');
            if (res.ok) {
                const data = await res.json();
                setUser(data.user);
            } else {
                router.push('/login');
            }
        } catch (error) {
            console.error('Error fetching user:', error);
        }
    };
    const canEdit = user?.role !== 'CLIENT';

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

    const fetchCleaners = async () => {
        try {
            const res = await fetch('/api/cleaners');
            if (res.ok) {
                const data = await res.json();
                setCleaners(data.cleaners);
            }
        } catch (error) {
            console.error('Error fetching cleaners:', error);
        }
    };

    useEffect(() => {
        fetchUser();
        fetchCleaners();
    }, []);

    useEffect(() => {
        const timer = setInterval(() => setNow(new Date()), 60000);
        if (user) {
            fetchEvents();
            fetchYardItems();
        }
        return () => clearInterval(timer);
    }, [currentDate, activeTab, user]);

    // Detect new events to play sound
    useEffect(() => {
        if (events.length > prevEventsCount && prevEventsCount !== 0) {
            playNotificationSound('new');
        }
        setPrevEventsCount(events.length);
    }, [events.length]);

    // Detect critical time to play alert (Cleaning Timer or SLA Meta or Yard Alert)
    useEffect(() => {
        // Check 1: Cleaning in progress timer (60 min rule)
        const hasCriticalCleaning = events.some(e => {
            if (e.status !== 'EM_ANDAMENTO' || !e.started_at) return false;
            const diff = differenceInMinutes(new Date(new Date(e.started_at).getTime() + 60 * 60 * 1000), now);
            return diff === 10 || diff === 5 || diff === 0;
        });

        // Check 2: SLA Meta (H-1) for scheduled cars
        const hasCriticalSLA = events.some(e => {
            if (e.status !== 'PREVISTO') return false;
            const metaTime = new Date(e.liberar_ate_at);
            const diffSLA = differenceInMinutes(metaTime, now);
            // Alert at exactly the meta time, 5 min before, or 10 min before
            return diffSLA === 10 || diffSLA === 5 || diffSLA === 0;
        });

        // Check 3: Yard Lock siren alarm
        const hasYardAlert = events.some(e => {
            if (e.status !== 'PREVISTO' || e.at_yard) return false;
            if ((e.event_business_key || '').startsWith('YARD-')) return false;
            const diffSLA = differenceInMinutes(new Date(e.liberar_ate_at), now);
            return diffSLA <= 90;
        });

        if (hasYardAlert) {
            playNotificationSound('yard-alert');
        } else if (hasCriticalCleaning || hasCriticalSLA) {
            playNotificationSound('alert');
        }
    }, [now, events]);



    // Prevent screen sleep (Wake Lock)
    useEffect(() => {
        let wakeLock: any = null;
        const requestWakeLock = async () => {
            try {
                if ('wakeLock' in navigator) {
                    wakeLock = await (navigator as any).wakeLock.request('screen');
                }
            } catch (err) {}
        };
        requestWakeLock();
        const handleVisibilityChange = async () => {
            if (wakeLock !== null && document.visibilityState === 'visible') {
                await requestWakeLock();
            }
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            if (wakeLock !== null) wakeLock.release();
        };
    }, []);

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

    const handleRefresh = async () => {
        setLoading(true);
        try {
            await Promise.all([
                fetchUser(),
                fetchEvents(),
                fetchYardItems()
            ]);
        } finally {
            setLoading(false);
        }
    };

    const [showSwapsModal, setShowSwapsModal] = useState(false);
    const [showCleanYardModal, setShowCleanYardModal] = useState(false);
    const [showInProgressModal, setShowInProgressModal] = useState(false);
    const [showCancelledModal, setShowCancelledModal] = useState(false);
    const [showCompletedModal, setShowCompletedModal] = useState(false);
    const [showTotalYardModal, setShowTotalYardModal] = useState(false);
    const [showTotalCleanYardModal, setShowTotalCleanYardModal] = useState(false);
    const [showYardStartModal, setShowYardStartModal] = useState(false);
    const [selectedYardVehicleId, setSelectedYardVehicleId] = useState<string | null>(null);

    // Manual schedule modal state
    const [showManualScheduleModal, setShowManualScheduleModal] = useState(false);
    const [manualVehicleNumber, setManualVehicleNumber] = useState('');
    const [manualSaidaTime, setManualSaidaTime] = useState('');
    const [manualLoading, setManualLoading] = useState(false);
    const [manualError, setManualError] = useState<string | null>(null);
    const [manualSuccess, setManualSuccess] = useState<string | null>(null);

    // Search states
    const [cancelledSearch, setCancelledSearch] = useState('');
    const [inProgressSearch, setInProgressSearch] = useState('');
    const [swapsSearch, setSwapsSearch] = useState('');
    const [completedSearch, setCompletedSearch] = useState('');
    const [totalYardSearch, setTotalYardSearch] = useState('');
    const [totalCleanYardSearch, setTotalCleanYardSearch] = useState('');

    // Main table search and filter
    const [mainSearch, setMainSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('TODOS');

    // Yard cleaning state
    const [showYardFinishModal, setShowYardFinishModal] = useState(false);
    const [selectedYardVehicle, setSelectedYardVehicle] = useState<any>(null);
    const [cleaners, setCleaners] = useState<any[]>([]);
    const [selectedCleaner, setSelectedCleaner] = useState('');
    const [yardCheckInterno, setYardCheckInterno] = useState(false);
    const [yardCheckExterno, setYardCheckExterno] = useState(false);
    const [yardCheckPneus, setYardCheckPneus] = useState(false);
    const [yardCheckBagageiros, setYardCheckBagageiros] = useState(false);
    const [yardCheckLatrina, setYardCheckLatrina] = useState(false);
    const [yardCheckBanheiro, setYardCheckBanheiro] = useState(false);
    const [yardCheckHigiene, setYardCheckHigiene] = useState(false);
    const [yardCheckOzonio, setYardCheckOzonio] = useState(false);
    const [yardFinishObs, setYardFinishObs] = useState('');
    const [processing, setProcessing] = useState(false);

    const getEventProgress = (e: any) => {
        let count = 0;
        if (e.check_interno) count++;
        if (e.check_externo) count++;
        if (e.check_pneus) count++;
        if (e.check_bagageiros) count++;
        if (e.check_latrina) count++;
        if (e.check_banheiro) count++;
        if (e.check_higiene) count++;
        if (e.check_ozonio) count++;
        return count;
    };

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
    const completedList = events.filter((e: any) => e.status === 'CONCLUIDO').map((e: any) => ({
        ...e,
        origin: 'Escala' // Eventos vindos da escala principal
    }));

    const cleanYardItemsFormatted = yardItems.filter((item: any) => {
        if (item.status !== 'LIMPO') return false;
        const cleanDate = item.last_cleaned_at || item.updated_at;
        if (!cleanDate) return false;
        
        // Normalize to Brazil Time (-3) to match KPI logic
        const brazilDate = subHours(new Date(cleanDate), 3);
        return isSameDay(brazilDate, currentDate);
    }).map((item: any) => ({
        id: item.id,
        vehicle: item.vehicle,
        cleaner: { name: item.last_cleaner_name },
        started_at: item.created_at, // Consider entry as "start" for yard clean
        finished_at: item.last_cleaned_at,
        check_interno: true,
        check_externo: true,
        check_pneus: true,
        check_bagageiros: true,
        check_latrina: true,
        check_banheiro: true,
        check_higiene: true,
        check_ozonio: true,
        observacao_operacao: 'Limpeza de Pátio',
        origin: 'Pátio'
    }));

    const unifiedCompletedList = [...completedList, ...cleanYardItemsFormatted];
    const escalaCount = completedList.length; // Apenas escala
    const patioCount = cleanYardItemsFormatted.length; // Apenas pátio

    // Critical Yard Alert Lock and sound notification rules
    const criticalYardEvent = events.find((e: any) => 
        e.status === 'PREVISTO' && 
        !e.at_yard && 
        !e.yard_bypass && 
        differenceInMinutes(new Date(e.liberar_ate_at), now) <= 90 &&
        !(e.event_business_key || '').startsWith('YARD-')
    );
    const hasYardLock = !!criticalYardEvent;

    // Total Clean Inventory (No date filter)
    const totalCleanYardItems = yardItems.filter((item: any) => item.status === 'LIMPO').map((item: any) => ({
        id: item.id,
        vehicle: item.vehicle,
        cleaner: { name: item.last_cleaner_name },
        started_at: item.created_at,
        finished_at: item.last_cleaned_at,
        check_interno: true,
        check_externo: true,
        check_pneus: true,
        check_bagageiros: true,
        check_latrina: true,
        check_banheiro: true,
        check_higiene: true,
        check_ozonio: true,
        origin: 'Pátio'
    }));

    // Filtered lists
    const filteredCancelled = cancelledList.filter((e: any) => {
        const searchLower = cancelledSearch.toLowerCase();
        return (
            e.vehicle.client_vehicle_number?.toString().includes(searchLower) ||
            e.empresa?.toLowerCase().includes(searchLower)
        );
    });

    const filteredCompleted = unifiedCompletedList.filter((e: any) => {
        const searchLower = completedSearch.toLowerCase();
        return (
            e.vehicle.client_vehicle_number?.toString().includes(searchLower) ||
            e.cleaner?.name?.toLowerCase().includes(searchLower) ||
            e.empresa?.toLowerCase().includes(searchLower) ||
            e.origin.toLowerCase().includes(searchLower)
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

    const exportCompletedToPDF = () => {
        const doc = new jsPDF('l', 'mm', 'a4');
        doc.text('Relatório de Veículos Concluídos', 14, 15);
        doc.setFontSize(10);
        doc.text(`Data: ${format(currentDate, 'dd/MM/yyyy')} | Total Concluídos: ${escalaCount + patioCount} (Escala: ${escalaCount} | Pátio: ${patioCount})`, 14, 22);

        const tableData = filteredCompleted.map((e: any) => [
            e.vehicle.client_vehicle_number,
            e.origin,
            e.cleaner?.name || '-',
            e.started_at ? format(new Date(e.started_at), 'HH:mm') : '-',
            e.finished_at ? format(new Date(e.finished_at), 'HH:mm') : '-',
            '', // Interno
            '', // Externo
            '', // Pneus
            e.observacao_operacao || '-'
        ]);

        autoTable(doc, {
            head: [['Carro', 'Origem', 'Colaborador', 'Início', 'Fim', 'Int.', 'Ext.', 'Pneus', 'Observação']],
            body: tableData,
            startY: 28,
            didDrawCell: (data) => {
                if (data.section === 'body' && [5, 6, 7].includes(data.column.index)) {
                   const event = filteredCompleted[data.row.index];
                   let checked = false;
                   if (data.column.index === 5) checked = event.check_interno;
                   if (data.column.index === 6) checked = event.check_externo;
                   if (data.column.index === 7) checked = event.check_pneus;

                   const posX = data.cell.x + data.cell.width / 2;
                   const posY = data.cell.y + data.cell.height / 2;

                   if (checked) {
                       doc.setFillColor(34, 197, 94);
                   } else {
                       doc.setFillColor(229, 231, 235);
                   }
                   doc.circle(posX, posY, 2, 'F');
                }
            },
            styles: { fontSize: 9, cellPadding: 3 },
            columnStyles: {
                0: { fontStyle: 'bold' },
                1: { fontStyle: 'bold' },
                5: { cellWidth: 15, halign: 'center' },
                6: { cellWidth: 15, halign: 'center' },
                7: { cellWidth: 15, halign: 'center' },
                8: { cellWidth: 'auto' }
            }
        });

        doc.save(`concluidos_${format(currentDate, 'yyyy-MM-dd')}.pdf`);
    };

    const exportCompletedToExcel = () => {
        const tableData = filteredCompleted.map((e: any) => ({
            'Carro': e.vehicle.client_vehicle_number,
            'Origem': e.origin,
            'Colaborador': e.cleaner?.name || '-',
            'Início': e.started_at ? format(new Date(e.started_at), 'HH:mm') : '-',
            'Fim': e.finished_at ? format(new Date(e.finished_at), 'HH:mm') : '-',
            'Interno': e.check_interno ? 'SIM' : 'NÃO',
            'Externo': e.check_externo ? 'SIM' : 'NÃO',
            'Pneus': e.check_pneus ? 'SIM' : 'NÃO',
            'Observação': e.observacao_operacao || '-'
        }));

        const ws = XLSX.utils.json_to_sheet(tableData);
        
        // Add summary row at the top
        XLSX.utils.sheet_add_aoa(ws, [[`Resumo: Total Concluídos: ${escalaCount + patioCount} (Escala: ${escalaCount} | Pátio: ${patioCount})`]], { origin: 'A1' });
        // Shift existing data down is not easy with sheet_add_aoa, better to just prepend to tableData or use a different origin.
        // Let's just add it to the bottom or as a separate info if needed, but the user asked for "at the top".
        // Re-creating with summary at the top:
        const fullData = [
            { 'Carro': `Resumo: Total Concluídos: ${escalaCount + patioCount} (Escala: ${escalaCount} | Pátio: ${patioCount})`, 'Origem': '', 'Colaborador': '', 'Início': '', 'Fim': '', 'Interno': '', 'Externo': '', 'Pneus': '', 'Observação': '' },
            {}, // Empty row
            ...tableData
        ];
        const ws2 = XLSX.utils.json_to_sheet(fullData);

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws2, 'Concluídos');
        XLSX.writeFile(wb, `concluidos_${format(currentDate, 'yyyy-MM-dd')}.xlsx`);
    };

    const exportSwapsToPDF = () => {
        const doc = new jsPDF('l', 'mm', 'a4');
        doc.text('Relatório de Trocas do Dia', 14, 15);
        doc.text(`Data: ${format(currentDate, 'dd/MM/yyyy')}`, 14, 22);

        const tableData = swapsList.map((s: any) => [
            format(new Date(s.original_event.hora_viagem), 'HH:mm'),
            s.original_vehicle?.client_vehicle_number || '-',
            s.replacement_vehicle?.client_vehicle_number || '-',
            s.motivo,
            s.observacao || '-',
            format(new Date(s.created_at), 'HH:mm')
        ]);

        autoTable(doc, {
            head: [['Hora Evento', 'Carro Orig.', 'Novo Carro', 'Motivo', 'Observação', 'Criado em']],
            body: tableData,
            startY: 28,
        });

        doc.save(`trocas_${format(currentDate, 'yyyy-MM-dd')}.pdf`);
    };

    const cleanYardItems = yardItems.filter((item: any) => {
        if (item.status !== 'LIMPO') return false;
        const cleanDate = item.last_cleaned_at || item.updated_at;
        if (!cleanDate) return false;
        
        // Normalize to Brazil Time (-3) to match KPI logic
        const brazilDate = subHours(new Date(cleanDate), 3);
        return isSameDay(brazilDate, currentDate);
    }).map((item: any) => ({
        id: item.id,
        vehicle_number: item.vehicle.client_vehicle_number,
        cleaner_name: item.last_cleaner_name || '--',
        cleaned_at: item.last_cleaned_at,
        created_at: item.created_at,
        status: item.status,
        origin: 'Pátio'
    }));

    const exportTotalYardToPDF = () => {
        const doc = new jsPDF() as any;
        const tableColumn = ["Veículo", "Ingresso", "Status", "Última Limpeza", "Colaborador"];
        const tableRows: any[] = [];

        yardItems.forEach((item: any) => {
            const rowData = [
                item.vehicle?.client_vehicle_number || '-',
                item.created_at ? format(new Date(item.created_at), "dd/MM HH:mm") : '-',
                item.status || 'PENDENTE',
                item.last_cleaned_at ? format(new Date(item.last_cleaned_at), "dd/MM HH:mm") : '-',
                item.last_cleaner_name || '-'
            ];
            tableRows.push(rowData);
        });

        doc.setFontSize(18);
        doc.text("Estoque Total no Pátio", 14, 22);
        doc.setFontSize(11);
        doc.text(`Data: ${format(new Date(), "dd/MM/yyyy HH:mm")}`, 14, 30);
        doc.text(`Total de Veículos: ${yardItems.length}`, 14, 37);

        autoTable(doc, {
            head: [tableColumn],
            body: tableRows,
            startY: 45,
            theme: 'grid',
            headStyles: { fillColor: [59, 130, 246] },
            styles: { fontSize: 9 }
        });

        doc.save(`Estoque_Total_Patio_${format(new Date(), "dd_MM_yyyy")}.pdf`);
    };

    const exportCleanYardToPDF = () => {
        const doc = new jsPDF({ orientation: 'landscape' });
        doc.text('Veículos Limpos no Pátio (Hoje)', 14, 15);
        doc.text(`Data: ${format(new Date(), 'dd/MM/yyyy HH:mm')}`, 14, 22);

        const tableData = cleanYardItems.map((item: any) => [
            item.vehicle_number,
            'Pátio',
            item.cleaner_name || '-',
            item.created_at ? format(new Date(item.created_at), 'HH:mm') : '--:--',
            item.cleaned_at ? format(new Date(item.cleaned_at), 'HH:mm') : '--:--',
            'OK', 'OK', 'OK',
            'Limpeza de Pátio'
        ]);

        autoTable(doc, {
            head: [['CARRO', 'ORIGEM', 'COLABORADOR', 'INÍCIO', 'FIM', 'INTERNO', 'EXTERNO', 'PNEUS', 'OBSERVAÇÃO']],
            body: tableData,
            startY: 28,
            styles: { fontSize: 8 }
        });

        doc.save(`carros_limpos_hoje_${format(new Date(), 'yyyy-MM-dd')}.pdf`);
    };

    const exportTotalCleanYardToPDF = () => {
        const doc = new jsPDF({ orientation: 'landscape' });
        doc.text('Estoque Total Limpo no Pátio', 14, 15);
        doc.text(`Gerado em: ${format(new Date(), 'dd/MM/yyyy HH:mm')}`, 14, 22);

        const tableData = totalCleanYardItems.filter((item: any) => 
            item.vehicle?.client_vehicle_number?.toString().toLowerCase().includes(totalCleanYardSearch.toLowerCase())
        ).map((item: any) => [
            item.vehicle.client_vehicle_number,
            'Pátio',
            item.cleaner?.name || '-',
            item.started_at ? format(new Date(item.started_at), 'HH:mm') : '--:--',
            item.finished_at ? format(new Date(item.finished_at), 'HH:mm') : '--:--',
            'OK', 'OK', 'OK',
            'Estoque'
        ]);

        autoTable(doc, {
            head: [['CARRO', 'ORIGEM', 'COLABORADOR', 'INÍCIO', 'FIM', 'INTERNO', 'EXTERNO', 'PNEUS', 'OBSERVAÇÃO']],
            body: tableData,
            startY: 28,
            styles: { fontSize: 8 }
        });

        doc.save(`estoque_limpo_total_${format(new Date(), 'yyyy-MM-dd')}.pdf`);
    };



    // Main table filtering and sorting
    const filteredEvents = events.filter((e: any) => {
        const searchLower = mainSearch.toLowerCase();
        const matchesSearch = (
            e.vehicle.client_vehicle_number?.toString().includes(searchLower) ||
            e.empresa?.toLowerCase().includes(searchLower) ||
            e.motorista?.toLowerCase().includes(searchLower)
        );

        // DEFAULT FILTER: Show only EM_ANDAMENTO and PREVISTO unless a specific status is chosen
        const matchesStatus = statusFilter === 'TODOS' 
            ? (e.status === 'EM_ANDAMENTO' || e.status === 'PREVISTO') 
            : e.status === statusFilter;

        return matchesSearch && matchesStatus;
    }).sort((a: any, b: any) => {
        // Priority 1: EM_ANDAMENTO
        // Priority 2: PREVISTO
        // Priority 3: Others (CONCLUIDO/CANCELADO)
        const getPriority = (status: string) => {
            if (status === 'EM_ANDAMENTO') return 1;
            if (status === 'PREVISTO') return 2;
            return 3;
        };
        
        const priorityA = getPriority(a.status);
        const priorityB = getPriority(b.status);
        
        if (priorityA !== priorityB) {
            return priorityA - priorityB;
        }
        
        // If both are EM_ANDAMENTO, sort by started_at (oldest first - who started first stays at top)
        if (a.status === 'EM_ANDAMENTO' && b.status === 'EM_ANDAMENTO') {
            const timeA = a.started_at ? new Date(a.started_at).getTime() : 0;
            const timeB = b.started_at ? new Date(b.started_at).getTime() : 0;
            return timeA - timeB;
        }
        
        // Otherwise use original trip time
        return new Date(a.hora_viagem).getTime() - new Date(b.hora_viagem).getTime();
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

    const handleStartYardCleaning = async (vehicleId: string, cleanerId: string) => {
        try {
            const res = await fetch('/api/yard', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    vehicle_id: vehicleId, 
                    status: 'EM_ANDAMENTO',
                    checklist: { cleaner_id: cleanerId }
                })
            });

            if (res.ok) {
                setShowYardStartModal(false);
                fetchEvents();
                fetchYardItems();
            } else {
                const errorData = await res.json().catch(() => ({}));
                alert(`Erro ao iniciar: ${errorData.error || 'Erro desconhecido'}`);
            }
        } catch (error) {
            console.error('Error starting yard cleaning:', error);
            alert('Erro de conexão.');
        }
    };

    const handleFinishYardCleaning = async () => {
        if (!selectedYardVehicle) return;

        try {
            setProcessing(true);
            const res = await fetch('/api/yard', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    vehicle_id: selectedYardVehicle.vehicle.id,
                    status: 'LIMPO',
                    checklist: {
                        check_interno: yardCheckInterno,
                        check_externo: yardCheckExterno,
                        check_pneus: yardCheckPneus,
                        check_bagageiros: yardCheckBagageiros,
                        check_latrina: yardCheckLatrina,
                        check_banheiro: yardCheckBanheiro,
                        check_higiene: yardCheckHigiene,
                        check_ozonio: yardCheckOzonio,
                        cleaner_id: selectedCleaner,
                        observacao: yardFinishObs
                    }
                })
            });

            if (res.ok) {
                setShowYardFinishModal(false);
                setSelectedYardVehicle(null);
                setYardCheckInterno(false);
                setYardCheckExterno(false);
                setYardCheckPneus(false);
                setYardCheckBagageiros(false);
                setYardCheckLatrina(false);
                setYardCheckBanheiro(false);
                setYardCheckHigiene(false);
                setYardCheckOzonio(false);
                setYardFinishObs('');
                fetchYardItems();
                fetchEvents();
            } else {
                const errorData = await res.json().catch(() => ({}));
                alert(`Erro ao finalizar: ${errorData.error || 'Erro desconhecido'}`);
            }
        } catch (error) {
            console.error('Error finishing yard cleaning:', error);
            alert('Erro de conexão.');
        } finally {
            setProcessing(false);
        }
    };

    const handleManualSchedule = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!manualVehicleNumber || !manualSaidaTime) return;

        setManualLoading(true);
        setManualError(null);
        setManualSuccess(null);

        try {
            const res = await fetch('/api/events/manual-schedule', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    vehicle_number: manualVehicleNumber.trim(),
                    saida_time: manualSaidaTime
                })
            });

            const data = await res.json();

            if (res.ok) {
                setManualSuccess(`Carro ${manualVehicleNumber} adicionado com sucesso à escala!`);
                setManualVehicleNumber('');
                setManualSaidaTime('');
                fetchEvents();
                // Auto-close modal after 2 seconds
                setTimeout(() => {
                    setShowManualScheduleModal(false);
                    setManualSuccess(null);
                }, 2000);
            } else {
                setManualError(data.error || 'Erro ao adicionar carro.');
            }
        } catch (error) {
            console.error('Error adding manual schedule event:', error);
            setManualError('Erro de conexão. Tente novamente.');
        } finally {
            setManualLoading(false);
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

    const handleAdminBypass = async (eventId: string) => {
        if (!confirm('Deseja realmente liberar o bloqueio operacional deste veículo como Administrador?')) return;
        try {
            const res = await fetch(`/api/events/${eventId}/bypass`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ yard_bypass: true })
            });
            if (res.ok) {
                fetchEvents();
            } else {
                const errorData = await res.json().catch(() => ({}));
                alert(`Erro ao liberar bloqueio: ${errorData.error || 'Erro desconhecido'}`);
            }
        } catch (error) {
            console.error('Error performing bypass:', error);
            alert('Erro de conexão ao liberar bloqueio.');
        }
    };

    return (
        <div className="space-y-6">
            {hasYardLock && (
                <div className="bg-red-600 text-white p-4 rounded-2xl shadow-lg shadow-red-200 border border-red-700 animate-pulse flex flex-col md:flex-row justify-between items-center gap-4">
                    <div className="flex items-center gap-3">
                        <div className="bg-white/10 p-2 rounded-xl">
                            <Timer size={24} className="text-white animate-spin" />
                        </div>
                        <div>
                            <h4 className="font-extrabold text-base tracking-wide uppercase">🚨 PENDÊNCIA OPERACIONAL CRÍTICA 🚨</h4>
                            <p className="text-sm font-semibold text-red-100">
                                O carro <span className="font-black underline decoration-2">{criticalYardEvent.vehicle.client_vehicle_number}</span> está previsto mas NÃO foi confirmado no pátio! Faltam menos de 30 minutos para iniciar a limpeza planejada. Todas as outras operações do sistema foram bloqueadas!
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        <button
                            onClick={() => {
                                const el = document.getElementById(`event-row-${criticalYardEvent.id}`);
                                if (el) {
                                    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                    // Add a temporary border flash or effect
                                    el.classList.add('ring-4', 'ring-red-500');
                                    setTimeout(() => el.classList.remove('ring-4', 'ring-red-500'), 3000);
                                }
                            }}
                            className="px-5 py-2.5 bg-white text-red-600 font-black rounded-xl text-sm hover:bg-red-50 active:scale-95 transition-all shadow-md uppercase tracking-wider"
                        >
                            Localizar Carro
                        </button>
                        {user?.role === 'ADMIN' && (
                            <button
                                onClick={() => handleAdminBypass(criticalYardEvent.id)}
                                className="px-5 py-2.5 bg-yellow-500 hover:bg-yellow-400 text-gray-950 font-black rounded-xl text-sm active:scale-95 transition-all shadow-md uppercase tracking-wider"
                            >
                                Liberar Bloqueio (Admin)
                            </button>
                        )}
                    </div>
                </div>
            )}
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
                        <div className="h-6 w-px bg-gray-200 mx-2"></div>
                        <button 
                            onClick={handleRefresh} 
                            disabled={loading}
                            className={`p-2 hover:bg-gray-100 rounded-lg transition-all ${loading ? 'animate-spin text-blue-500' : 'text-gray-500'}`}
                            title="Atualizar Página"
                        >
                            <RefreshCw size={20} />
                        </button>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                        {canEdit && (
                            <a href="/dashboard/import" className="px-6 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700 shadow-md shadow-blue-100 transition-all">
                                Nova Importação
                            </a>
                        )}
                        <button
                            id="btn-adicionar-carro-manual"
                            onClick={() => {
                                setManualError(null);
                                setManualSuccess(null);
                                setManualVehicleNumber('');
                                setManualSaidaTime('');
                                setShowManualScheduleModal(true);
                            }}
                            className="px-6 py-2 bg-amber-500 text-white rounded-xl text-sm font-bold hover:bg-amber-600 shadow-md shadow-amber-100 transition-all flex items-center gap-2"
                        >
                            <Plus size={16} />
                            Adicionar Carro Manual
                        </button>
                    </div>
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
                        <p className="text-[10px] font-black text-green-600 uppercase tracking-widest mb-1">Total Concluídos</p>
                        <p className="text-4xl font-black text-green-800">{escalaCount + patioCount}</p>
                        <p className="text-[10px] text-green-600 mt-1 font-bold">{escalaCount} escala + {patioCount} pátio</p>
                    </div>
                    <div className="bg-[#FEF2F2] p-5 rounded-2xl border-l-[6px] border-red-500 shadow-xl shadow-red-100/50 transform hover:-translate-y-1 transition-all cursor-pointer" onClick={() => setShowCancelledModal(true)}>
                        <p className="text-[10px] font-black text-red-600 uppercase tracking-widest mb-1">Cancelados</p>
                        <p className="text-4xl font-black text-red-800">{cancelledList.length}</p>
                    </div>
                    <div className="bg-[#FFFBEB] p-5 rounded-2xl border-l-[6px] border-amber-500 shadow-xl shadow-amber-100/50 transform hover:-translate-y-1 transition-all cursor-pointer" onClick={() => setShowSwapsModal(true)}>
                        <p className="text-[10px] font-black text-amber-600 uppercase tracking-widest mb-1">Trocas</p>
                        <p className="text-4xl font-black text-amber-800">{swapsList.length}</p>
                    </div>
                    <div className="bg-[#F0FDF4] p-5 rounded-2xl border-l-[6px] border-emerald-500 shadow-xl shadow-emerald-100/50 transform hover:-translate-y-1 transition-all cursor-pointer" onClick={() => setShowCleanYardModal(true)}>
                        <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest mb-1">Limpos no Pátio</p>
                        <p className="text-4xl font-black text-emerald-800">{cleanYardItems.length}</p>
                    </div>
                    <div className="bg-[#EFF6FF] p-5 rounded-2xl border-l-[6px] border-blue-500 shadow-xl shadow-blue-100/50 transform hover:-translate-y-1 transition-all cursor-pointer" onClick={() => setShowTotalYardModal(true)}>
                        <p className="text-[10px] font-black text-blue-600 uppercase tracking-widest mb-1">Total no Pátio</p>
                        <p className="text-4xl font-black text-blue-800">{yardItems.length}</p>
                    </div>
                    <div className="bg-[#ECFDF5] p-5 rounded-2xl border-l-[6px] border-emerald-600 shadow-xl shadow-emerald-100/50 transform hover:-translate-y-1 transition-all cursor-pointer" onClick={() => setShowTotalCleanYardModal(true)}>
                        <p className="text-[10px] font-black text-emerald-700 uppercase tracking-widest mb-1">Estoque Limpo Totál</p>
                        <p className="text-4xl font-black text-emerald-900">{totalCleanYardItems.length}</p>
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
                        <WebEventList 
                            events={filteredEvents} 
                            autoOpenEventId={autoOpenEventId} 
                            hasYardLock={hasYardLock}
                            criticalYardEventId={criticalYardEvent?.id}
                            userRole={user?.role}
                        />
                    </div>
                ) : (
                    /* Yard Inventory Content */
                    <div className="space-y-6">
                        {canEdit && (
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
                        )}
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
                                                        {canEdit && (
                                                            <>
                                                                {item.status === 'SUJO' && (
                                                                    <button
                                                                        onClick={() => {
                                                                            setSelectedYardVehicleId(item.vehicle.id);
                                                                            setShowYardStartModal(true);
                                                                        }}
                                                                        className="bg-blue-600 text-white px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider hover:bg-blue-700 flex items-center gap-1"
                                                                    >
                                                                        <Play size={10} fill="currentColor" /> Iniciar
                                                                    </button>
                                                                )}
                                                                {item.status === 'EM_ANDAMENTO' && (
                                                                    <button
                                                                        onClick={() => {
                                                                            setSelectedYardVehicle(item);
                                                                            setYardCheckInterno(false);
                                                                            setYardCheckExterno(false);
                                                                            setYardCheckPneus(false);
                                                                            setYardCheckBagageiros(false);
                                                                            setYardCheckLatrina(false);
                                                                            setYardCheckBanheiro(false);
                                                                            setYardCheckHigiene(false);
                                                                            setYardCheckOzonio(false);
                                                                            setYardFinishObs('');
                                                                            setShowYardFinishModal(true);
                                                                        }}
                                                                        className="bg-green-600 text-white px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider hover:bg-green-700 flex items-center gap-1"
                                                                    >
                                                                        <CheckCircle className="w-2.5 h-2.5" /> Finalizar
                                                                    </button>
                                                                )}
                                                                <button
                                                                    onClick={() => handleManualProgram(item.vehicle.id)}
                                                                    disabled={item.status === 'EM_ANDAMENTO'}
                                                                    className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all flex items-center gap-1 ${item.status === 'EM_ANDAMENTO'
                                                                        ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                                                                        : 'bg-emerald-600 text-white hover:bg-emerald-700'
                                                                        }`}
                                                                    title="Programar para Escala"
                                                                >
                                                                    <Plus size={10} /> Escala
                                                                </button>
                                                                <button
                                                                    onClick={() => handleRemoveYardVehicle(item.id)}
                                                                    className="text-red-500 hover:text-red-700 text-[10px] font-black uppercase tracking-wider"
                                                                >
                                                                    Remover
                                                                </button>
                                                            </>
                                                        )}
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
                    <EventDashboardList 
                        events={events} 
                        hasYardLock={hasYardLock}
                        criticalYardEventId={criticalYardEvent?.id}
                        userRole={user?.role}
                    />
                )}
                {/* Floating Refresh Button for Mobile */}
                <button 
                  onClick={handleRefresh}
                  disabled={loading}
                  className="fixed bottom-20 right-6 p-4 bg-blue-600 text-white rounded-full shadow-lg z-40 active:scale-95 transition-all outline-none"
                >
                  <RefreshCw size={24} className={loading ? 'animate-spin' : ''} />
                </button>
            </div>

            {showSwapsModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
                    <div className="bg-white rounded-lg p-6 max-w-4xl w-full max-h-[80vh] overflow-y-auto">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-xl font-bold text-gray-800">Relatório de Trocas do Dia</h3>
                            <div className="flex gap-2">
                                <button 
                                    onClick={exportSwapsToPDF}
                                    className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium flex items-center gap-2 text-sm"
                                >
                                    <FileText size={16} /> PDF
                                </button>
                                <button
                                    onClick={() => setShowSwapsModal(false)}
                                    className="text-gray-500 hover:text-gray-700 font-bold text-xl px-2"
                                >
                                    &times;
                                </button>
                            </div>
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
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tempo Limpeza</th>
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
                                            <td className="px-4 py-3 whitespace-nowrap text-sm">
                                                {event.started_at ? (
                                                    <div className={(() => {
                                                        const diff = differenceInMinutes(new Date(new Date(event.started_at).getTime() + 60 * 60 * 1000), now);
                                                        if (diff <= 10) return "flex items-center gap-1.5 font-black text-red-600 animate-pulse";
                                                        if (diff <= 20) return "flex items-center gap-1.5 font-black text-orange-600";
                                                        return "flex items-center gap-1.5 font-bold text-blue-600";
                                                    })()}>
                                                        <Timer className="w-4 h-4" />
                                                        {(() => {
                                                            const diff = differenceInMinutes(new Date(new Date(event.started_at).getTime() + 60 * 60 * 1000), now);
                                                            return diff > 0 ? `${diff} min` : <span className="text-red-500">Atrasado</span>;
                                                        })()}
                                                    </div>
                                                ) : '-'}
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
                                <div className="flex items-center gap-4">
                                    <h3 className="text-xl font-bold text-gray-800">Veículos Concluídos</h3>
                                    <div className="flex gap-2">
                                        <span className="px-2 py-1 bg-blue-50 text-blue-700 text-xs font-bold rounded-md border border-blue-100">
                                            Escala: {escalaCount}
                                        </span>
                                        <span className="px-2 py-1 bg-emerald-50 text-emerald-700 text-xs font-bold rounded-md border border-emerald-100">
                                            Pátio: {patioCount}
                                        </span>
                                    </div>
                                </div>
                                <button
                                    onClick={() => setShowCompletedModal(false)}
                                    className="text-gray-500 hover:text-gray-700 font-bold text-xl"
                                >
                                    &times;
                                </button>
                            </div>

                            <div className="flex gap-3 items-center flex-1">
                                <Search size={18} className="text-gray-400" />
                                <input
                                    type="text"
                                    placeholder="Pesquisar por carro, colaborador, empresa..."
                                    value={completedSearch}
                                    onChange={(e) => setCompletedSearch(e.target.value)}
                                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                                />
                                <button
                                    onClick={exportCompletedToPDF}
                                    className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium flex items-center gap-2"
                                >
                                    <FileText size={16} /> PDF
                                </button>
                                <button
                                    onClick={exportCompletedToExcel}
                                    className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium flex items-center gap-2"
                                >
                                    <Table size={16} /> Excel
                                </button>
                            </div>
                        </div>

                        {unifiedCompletedList.length === 0 ? (
                            <p className="text-center text-gray-500 py-8">Nenhum veículo concluído hoje.</p>
                        ) : (
                            <table className="min-w-full divide-y divide-gray-200">
                                <thead className="bg-gray-50">
                                    <tr>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Carro</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Origem</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Colaborador</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Início</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Fim</th>
                                        <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Progresso da Limpeza</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Observação</th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-200">
                                    {filteredCompleted.map((event: any) => (
                                        <tr key={event.id}>
                                            <td className="px-4 py-3 whitespace-nowrap text-sm font-bold text-gray-900">
                                                {event.vehicle.client_vehicle_number}
                                            </td>
                                            <td className="px-4 py-3 whitespace-nowrap text-sm">
                                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                                                    event.origin === 'Escala' ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700'
                                                }`}>
                                                    {event.origin}
                                                </span>
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
                                                {(() => {
                                                    const progress = getEventProgress(event);
                                                    const pct = Math.round((progress / 8) * 100);
                                                    return (
                                                        <div className="flex flex-col items-center justify-center gap-1">
                                                            <div className="w-24 bg-gray-200 rounded-full h-2">
                                                                <div 
                                                                    className={`h-2 rounded-full transition-all ${pct === 100 ? 'bg-green-500' : 'bg-amber-500'}`} 
                                                                    style={{ width: `${pct}%` }}
                                                                />
                                                            </div>
                                                            <span className="text-[10px] font-black text-gray-600">{pct}% ({progress}/8)</span>
                                                        </div>
                                                    );
                                                })()}
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
            {showTotalYardModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
                    <div className="bg-white rounded-xl p-6 max-w-4xl w-full max-h-[80vh] overflow-y-auto">
                        <div className="flex justify-between items-center mb-6 border-b pb-4">
                            <div>
                                <h3 className="text-xl font-bold text-gray-800">Estoque Geral no Pátio</h3>
                                <p className="text-xs text-gray-500 uppercase font-black tracking-widest mt-1">Total de {yardItems.length} veículos em estoque</p>
                            </div>
                            <div className="flex gap-2">
                                <button 
                                    onClick={exportTotalYardToPDF}
                                    className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium flex items-center gap-2 text-sm"
                                >
                                    <FileText size={16} /> Relatório PDF
                                </button>
                                <button
                                    onClick={() => setShowTotalYardModal(false)}
                                    className="text-gray-500 hover:text-gray-700 font-bold text-2xl px-2"
                                >
                                    &times;
                                </button>
                            </div>
                        </div>

                        <div className="mb-4">
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                                <input 
                                    type="text" 
                                    placeholder="Buscar veículo no pátio..." 
                                    className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-medium"
                                    value={totalYardSearch}
                                    onChange={(e) => setTotalYardSearch(e.target.value)}
                                />
                            </div>
                        </div>

                        {yardItems.length === 0 ? (
                            <p className="text-center text-gray-500 py-12 font-medium">Nenhum veículo cadastrado no estoque.</p>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="min-w-full divide-y divide-gray-100">
                                    <thead>
                                        <tr>
                                            <th className="px-4 py-3 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Carro</th>
                                            <th className="px-4 py-3 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Ingresso</th>
                                            <th className="px-4 py-3 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Status</th>
                                            <th className="px-4 py-3 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Última Limpeza</th>
                                            <th className="px-4 py-3 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Colaborador</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-50">
                                        {yardItems.filter((item: any) => 
                                            item.vehicle?.client_vehicle_number?.toString().toLowerCase().includes(totalYardSearch.toLowerCase())
                                        ).map((item: any) => (
                                            <tr key={item.id} className="hover:bg-gray-50/50 transition-colors">
                                                <td className="px-4 py-3">
                                                    <span className="text-base font-black text-gray-800">{item.vehicle?.client_vehicle_number}</span>
                                                </td>
                                                <td className="px-4 py-3 text-sm text-gray-500 font-bold">
                                                    {item.created_at ? format(new Date(item.created_at), "dd/MM HH:mm") : '-'}
                                                </td>
                                                <td className="px-4 py-3">
                                                    <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                                                        item.status === 'LIMPO' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                                                    }`}>
                                                        {item.status || 'PENDENTE'}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3 text-sm text-gray-500">
                                                    {item.last_cleaned_at ? format(new Date(item.last_cleaned_at), "dd/MM HH:mm") : '-'}
                                                </td>
                                                <td className="px-4 py-3 text-sm font-bold text-gray-600">
                                                    {item.last_cleaner_name || '-'}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        <div className="mt-8 flex justify-end">
                            <button
                                onClick={() => setShowTotalYardModal(false)}
                                className="px-6 py-2 bg-gray-100 text-gray-600 rounded-xl font-bold hover:bg-gray-200 transition-all"
                            >
                                Fechar
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {showCleanYardModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
                    <div className="bg-white rounded-xl p-6 max-w-4xl w-full max-h-[80vh] overflow-y-auto">
                        <div className="flex justify-between items-center mb-6 border-b pb-4">
                            <div>
                                <h3 className="text-xl font-bold text-gray-800">Veículos Limpos no Pátio</h3>
                                <p className="text-xs text-gray-500 uppercase font-black tracking-widest mt-1">Total de {cleanYardItems.length} veículos (Apenas Estoque)</p>
                            </div>
                            <div className="flex gap-2">
                                <button 
                                    onClick={exportCleanYardToPDF}
                                    className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium flex items-center gap-2 text-sm"
                                >
                                    <FileText size={16} /> Relatório PDF
                                </button>
                                <button
                                    onClick={() => setShowCleanYardModal(false)}
                                    className="text-gray-500 hover:text-gray-700 font-bold text-2xl px-2"
                                >
                                    &times;
                                </button>
                            </div>
                        </div>

                        {cleanYardItems.length === 0 ? (
                            <p className="text-center text-gray-500 py-12 font-medium">Nenhum veículo com status LIMPO disponível no estoque.</p>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="min-w-full divide-y divide-gray-100">
                                    <thead>
                                        <tr>
                                            <th className="px-4 py-3 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Carro</th>
                                            <th className="px-4 py-3 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Origem</th>
                                            <th className="px-4 py-3 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Colaborador</th>
                                            <th className="px-4 py-3 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Início</th>
                                            <th className="px-4 py-3 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Fim</th>
                                            <th className="px-4 py-3 text-center text-[10px] font-black text-gray-400 uppercase tracking-widest">Progresso</th>
                                            <th className="px-4 py-3 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Obs</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-50">
                                        {cleanYardItems.map((item: any) => (
                                            <tr key={item.id} className="hover:bg-gray-50/50 transition-colors">
                                                <td className="px-4 py-3">
                                                    <span className="text-base font-black text-gray-800">{item.vehicle_number}</span>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <span className="text-[10px] bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full font-bold">Pátio</span>
                                                </td>
                                                <td className="px-4 py-3 text-sm font-bold text-gray-600">
                                                    {item.cleaner_name}
                                                </td>
                                                <td className="px-4 py-3 text-sm text-gray-500">
                                                    {item.created_at ? format(new Date(item.created_at), "HH:mm") : '-'}
                                                </td>
                                                <td className="px-4 py-3 text-sm text-gray-500">
                                                    {item.cleaned_at ? format(new Date(item.cleaned_at), "HH:mm") : '-'}
                                                </td>
                                                <td className="px-4 py-3 text-center">
                                                    {(() => {
                                                        const progress = 8;
                                                        const pct = 100;
                                                        return (
                                                            <div className="flex flex-col items-center justify-center gap-1">
                                                                <div className="w-16 bg-gray-200 rounded-full h-1.5">
                                                                    <div className="h-1.5 rounded-full bg-green-500" style={{ width: '100%' }} />
                                                                </div>
                                                                <span className="text-[9px] font-black text-gray-600">100% (8/8)</span>
                                                            </div>
                                                        );
                                                    })()}
                                                </td>
                                                <td className="px-4 py-3 text-[10px] text-gray-400 font-medium max-w-[100px] truncate">
                                                    Pátio
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        <div className="mt-8 flex justify-end">
                            <button
                                onClick={() => setShowCleanYardModal(false)}
                                className="px-6 py-2 bg-gray-100 text-gray-600 rounded-xl font-bold hover:bg-gray-200 transition-all"
                            >
                                Fechar
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {showTotalCleanYardModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
                    <div className="bg-white rounded-xl p-6 max-w-4xl w-full max-h-[80vh] overflow-y-auto">
                        <div className="flex justify-between items-center mb-6 border-b pb-4">
                            <div>
                                <h3 className="text-xl font-bold text-gray-800">Estoque Total Limpo no Pátio</h3>
                                <p className="text-xs text-gray-500 uppercase font-black tracking-widest mt-1">Todos os veículos prontos no estoque ({totalCleanYardItems.length})</p>
                            </div>
                            <div className="flex gap-2">
                                <button 
                                    onClick={exportTotalCleanYardToPDF}
                                    className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium flex items-center gap-2 text-sm"
                                >
                                    <FileText size={16} /> Relatório PDF
                                </button>
                                <button
                                    onClick={() => setShowTotalCleanYardModal(false)}
                                    className="text-gray-500 hover:text-gray-700 font-bold text-2xl px-2"
                                >
                                    &times;
                                </button>
                            </div>
                        </div>

                        <div className="mb-4">
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                                <input 
                                    type="text" 
                                    placeholder="Buscar veículo limpo..." 
                                    className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-medium"
                                    value={totalCleanYardSearch}
                                    onChange={(e) => setTotalCleanYardSearch(e.target.value)}
                                />
                            </div>
                        </div>

                        {totalCleanYardItems.length === 0 ? (
                            <p className="text-center text-gray-500 py-12 font-medium">Nenhum veículo limpo no estoque.</p>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="min-w-full divide-y divide-gray-100">
                                    <thead>
                                        <tr>
                                            <th className="px-4 py-3 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Carro</th>
                                            <th className="px-4 py-3 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Origem</th>
                                            <th className="px-4 py-3 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Colaborador</th>
                                            <th className="px-4 py-3 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Início</th>
                                            <th className="px-4 py-3 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Fim</th>
                                            <th className="px-4 py-3 text-center text-[10px] font-black text-gray-400 uppercase tracking-widest">Progresso</th>
                                            <th className="px-4 py-3 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Obs</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-50">
                                        {totalCleanYardItems.filter((item: any) => 
                                            item.vehicle?.client_vehicle_number?.toString().toLowerCase().includes(totalCleanYardSearch.toLowerCase())
                                        ).map((item: any) => (
                                            <tr key={item.id} className="hover:bg-gray-50/50 transition-colors">
                                                <td className="px-4 py-3">
                                                    <span className="text-base font-black text-gray-800">{item.vehicle?.client_vehicle_number}</span>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <span className="text-[10px] bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full font-bold">Pátio</span>
                                                </td>
                                                <td className="px-4 py-3 text-sm font-bold text-gray-600">
                                                    {item.cleaner?.name || '-'}
                                                </td>
                                                <td className="px-4 py-3 text-sm text-gray-500">
                                                    {item.started_at ? format(new Date(item.started_at), "HH:mm") : '-'}
                                                </td>
                                                <td className="px-4 py-3 text-sm text-gray-500">
                                                    {item.finished_at ? format(new Date(item.finished_at), "HH:mm") : '-'}
                                                </td>
                                                <td className="px-4 py-3 text-center">
                                                    {(() => {
                                                        const progress = 8;
                                                        const pct = 100;
                                                        return (
                                                            <div className="flex flex-col items-center justify-center gap-1">
                                                                <div className="w-16 bg-gray-200 rounded-full h-1.5">
                                                                    <div className="h-1.5 rounded-full bg-green-500" style={{ width: '100%' }} />
                                                                </div>
                                                                <span className="text-[9px] font-black text-gray-600">100% (8/8)</span>
                                                            </div>
                                                        );
                                                    })()}
                                                </td>
                                                <td className="px-4 py-3 text-[10px] text-gray-400 font-medium max-w-[100px] truncate">
                                                    Estoque
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        <div className="mt-8 flex justify-end">
                            <button
                                onClick={() => setShowTotalCleanYardModal(false)}
                                className="px-6 py-2 bg-gray-100 text-gray-600 rounded-xl font-bold hover:bg-gray-200 transition-all"
                            >
                                Fechar
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {/* Yard Finish Modal */}
            {showYardFinishModal && selectedYardVehicle && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-[100]" onClick={() => setShowYardFinishModal(false)}>
                    <div className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl transform transition-all animate-in zoom-in-95 duration-200" onClick={(e) => e.stopPropagation()}>
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-2xl font-black text-gray-800 tracking-tight">Finalizar Limpeza</h3>
                            <button onClick={() => setShowYardFinishModal(false)} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
                                <X size={24} className="text-gray-400" />
                            </button>
                        </div>

                        <div className="mb-6 p-4 bg-blue-50 rounded-2xl border border-blue-100">
                            <p className="text-xs font-black text-blue-600 uppercase tracking-widest mb-1">Veículo selecionado</p>
                            <p className="text-2xl font-black text-blue-900">{selectedYardVehicle.vehicle.client_vehicle_number}</p>
                        </div>

                        <div className="space-y-4 mb-8">
                            <div className="space-y-2">
                                <label className="text-xs font-black text-gray-400 uppercase tracking-widest ml-1">Colaborador</label>
                                <select
                                    value={selectedCleaner}
                                    onChange={(e) => setSelectedCleaner(e.target.value)}
                                    className="w-full p-4 bg-gray-50 border border-gray-100 rounded-2xl outline-none focus:ring-2 focus:ring-blue-500 font-bold text-gray-700 transition-all"
                                >
                                    <option value="">Selecione quem realizou a limpeza</option>
                                    {cleaners.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                </select>
                            </div>

                             {(() => {
                                 const yardCurrentProgress = [yardCheckInterno, yardCheckExterno, yardCheckPneus, yardCheckBagageiros, yardCheckLatrina, yardCheckBanheiro, yardCheckHigiene, yardCheckOzonio].filter(Boolean).length;
                                 const yardCurrentPercentage = Math.round((yardCurrentProgress / 8) * 100);
                                 const isYardFinishDisabled = yardCurrentProgress < 8 && !yardFinishObs.trim();

                                 return (
                                     <>
                                         <div className="mb-4 bg-gray-50 p-4 rounded-xl border border-gray-100">
                                             <div className="flex justify-between items-center mb-1.5">
                                                 <span className="text-xs font-black text-gray-500 uppercase tracking-wider">Evolução da Limpeza</span>
                                                 <span className="text-xs font-black text-blue-600">{yardCurrentPercentage}% ({yardCurrentProgress}/8)</span>
                                             </div>
                                             <div className="w-full bg-gray-200 rounded-full h-2.5">
                                                 <div 
                                                     className={`h-2.5 rounded-full transition-all duration-300 ${yardCurrentPercentage === 100 ? 'bg-green-500' : 'bg-blue-600'}`} 
                                                     style={{ width: `${yardCurrentPercentage}%` }}
                                                 />
                                             </div>
                                         </div>

                                         <div className="grid grid-cols-1 gap-3 max-h-[35vh] overflow-y-auto pr-1">
                                             <label className="flex items-center gap-3 p-4 bg-gray-50 rounded-2xl cursor-pointer hover:bg-gray-100 transition-all border border-transparent hover:border-blue-200 group">
                                                 <input 
                                                     type="checkbox" 
                                                     checked={yardCheckInterno} 
                                                     onChange={(e) => setYardCheckInterno(e.target.checked)} 
                                                     className="w-5 h-5 rounded-lg border-gray-300 text-blue-600 focus:ring-blue-500 transition-all" 
                                                 />
                                                 <span className="text-sm font-bold text-gray-700 group-hover:text-blue-700">Limpeza Interna OK</span>
                                             </label>
                                             <label className="flex items-center gap-3 p-4 bg-gray-50 rounded-2xl cursor-pointer hover:bg-gray-100 transition-all border border-transparent hover:border-blue-200 group">
                                                 <input 
                                                     type="checkbox" 
                                                     checked={yardCheckExterno} 
                                                     onChange={(e) => setYardCheckExterno(e.target.checked)} 
                                                     className="w-5 h-5 rounded-lg border-gray-300 text-blue-600 focus:ring-blue-500 transition-all" 
                                                 />
                                                 <span className="text-sm font-bold text-gray-700 group-hover:text-blue-700">Limpeza Externa OK</span>
                                             </label>
                                             <label className="flex items-center gap-3 p-4 bg-gray-50 rounded-2xl cursor-pointer hover:bg-gray-100 transition-all border border-transparent hover:border-blue-200 group">
                                                 <input 
                                                     type="checkbox" 
                                                     checked={yardCheckPneus} 
                                                     onChange={(e) => setYardCheckPneus(e.target.checked)} 
                                                     className="w-5 h-5 rounded-lg border-gray-300 text-blue-600 focus:ring-blue-500 transition-all" 
                                                 />
                                                 <span className="text-sm font-bold text-gray-700 group-hover:text-blue-700">Pretinho Pneus OK</span>
                                             </label>
                                             <label className="flex items-center gap-3 p-4 bg-gray-50 rounded-2xl cursor-pointer hover:bg-gray-100 transition-all border border-transparent hover:border-blue-200 group">
                                                 <input 
                                                     type="checkbox" 
                                                     checked={yardCheckBagageiros} 
                                                     onChange={(e) => setYardCheckBagageiros(e.target.checked)} 
                                                     className="w-5 h-5 rounded-lg border-gray-300 text-blue-600 focus:ring-blue-500 transition-all" 
                                                 />
                                                 <span className="text-sm font-bold text-gray-700 group-hover:text-blue-700">Limpeza do Bagajeiro/Comp. Cadeirante OK?</span>
                                             </label>
                                             <label className="flex items-center gap-3 p-4 bg-gray-50 rounded-2xl cursor-pointer hover:bg-gray-100 transition-all border border-transparent hover:border-blue-200 group">
                                                 <input 
                                                     type="checkbox" 
                                                     checked={yardCheckLatrina} 
                                                     onChange={(e) => setYardCheckLatrina(e.target.checked)} 
                                                     className="w-5 h-5 rounded-lg border-gray-300 text-blue-600 focus:ring-blue-500 transition-all" 
                                                 />
                                                 <span className="text-sm font-bold text-gray-700 group-hover:text-blue-700">Esgotamento da latrina ok?</span>
                                             </label>
                                             <label className="flex items-center gap-3 p-4 bg-gray-50 rounded-2xl cursor-pointer hover:bg-gray-100 transition-all border border-transparent hover:border-blue-200 group">
                                                 <input 
                                                     type="checkbox" 
                                                     checked={yardCheckBanheiro} 
                                                     onChange={(e) => setYardCheckBanheiro(e.target.checked)} 
                                                     className="w-5 h-5 rounded-lg border-gray-300 text-blue-600 focus:ring-blue-500 transition-all" 
                                                 />
                                                 <span className="text-sm font-bold text-gray-700 group-hover:text-blue-700">Lavagem do banheiro ok?</span>
                                             </label>
                                             <label className="flex items-center gap-3 p-4 bg-gray-50 rounded-2xl cursor-pointer hover:bg-gray-100 transition-all border border-transparent hover:border-blue-200 group">
                                                 <input 
                                                     type="checkbox" 
                                                     checked={yardCheckHigiene} 
                                                     onChange={(e) => setYardCheckHigiene(e.target.checked)} 
                                                     className="w-5 h-5 rounded-lg border-gray-300 text-blue-600 focus:ring-blue-500 transition-all" 
                                                 />
                                                 <span className="text-sm font-bold text-gray-700 group-hover:text-blue-700">Reposição de produto de higiene ok?</span>
                                             </label>
                                             <label className="flex items-center gap-3 p-4 bg-gray-50 rounded-2xl cursor-pointer hover:bg-gray-100 transition-all border border-transparent hover:border-blue-200 group">
                                                 <input 
                                                     type="checkbox" 
                                                     checked={yardCheckOzonio} 
                                                     onChange={(e) => setYardCheckOzonio(e.target.checked)} 
                                                     className="w-5 h-5 rounded-lg border-gray-300 text-blue-600 focus:ring-blue-500 transition-all" 
                                                 />
                                                 <span className="text-sm font-bold text-gray-700 group-hover:text-blue-700">Jato de estabilizante ozônio no final ok?</span>
                                             </label>
                                         </div>

                                         <div className="space-y-2">
                                             <label className="text-xs font-black text-gray-400 uppercase tracking-widest ml-1">Observações</label>
                                             <textarea
                                                 value={yardFinishObs}
                                                 onChange={(e) => setYardFinishObs(e.target.value)}
                                                 placeholder="Alguma observação importante?"
                                                 rows={2}
                                                 className="w-full p-4 bg-gray-50 border border-gray-100 rounded-2xl outline-none focus:ring-2 focus:ring-blue-500 resize-none font-medium text-gray-700 transition-all"
                                             />
                                             {isYardFinishDisabled && (
                                                 <p className="text-[10px] text-red-500 font-bold mt-1 animate-pulse">
                                                     * Justificativa obrigatória caso a limpeza não esteja 100% concluída.
                                                 </p>
                                             )}
                                         </div>

                                         <div className="flex gap-3 mt-4">
                                             <button
                                                 type="button"
                                                 onClick={() => setShowYardFinishModal(false)}
                                                 className="flex-1 py-4 text-gray-500 font-black uppercase tracking-widest text-xs hover:bg-gray-50 rounded-2xl transition-all"
                                             >
                                                 Cancelar
                                             </button>
                                             <button
                                                 type="button"
                                                 onClick={handleFinishYardCleaning}
                                                 disabled={isYardFinishDisabled || processing}
                                                 className="flex-2 py-4 px-8 bg-green-600 text-white font-black uppercase tracking-widest text-xs rounded-2xl disabled:opacity-50 hover:bg-green-700 shadow-xl shadow-green-100 transition-all transform active:scale-95 animate-pulse-slow"
                                             >
                                                 Confirmar Finalização
                                             </button>
                                         </div>
                                     </>
                                 );
                             })()}
                        </div>
                    </div>
                </div>
            )}
            {showYardStartModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-[100]" onClick={() => setShowYardStartModal(false)}>
                    <div className="bg-white rounded-2xl p-6 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
                        <h3 className="text-lg font-black mb-4">Iniciar Limpeza (Pátio)</h3>
                        <div className="space-y-4">
                            <div>
                                <label className="text-xs font-black text-gray-400 uppercase tracking-widest mb-1 block">Selecionar Colaborador</label>
                                <select
                                    value={selectedCleaner}
                                    onChange={(e) => setSelectedCleaner(e.target.value)}
                                    className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-bold"
                                >
                                    <option value="">Selecione um colaborador</option>
                                    {cleaners.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                </select>
                            </div>
                        </div>
                        <div className="flex gap-2 mt-6">
                            <button onClick={() => setShowYardStartModal(false)} className="flex-1 py-2 text-gray-500 font-bold">Cancelar</button>
                            <button
                                onClick={() => selectedYardVehicleId && handleStartYardCleaning(selectedYardVehicleId, selectedCleaner)}
                                disabled={!selectedCleaner}
                                className="flex-1 py-2 bg-blue-600 text-white font-black rounded-xl disabled:opacity-50 shadow-md shadow-blue-100"
                            >
                                Iniciar
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {/* Manual Schedule Modal */}
            {showManualScheduleModal && (
                <div
                    className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-[100]"
                    onClick={() => setShowManualScheduleModal(false)}
                >
                    <div
                        className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Header */}
                        <div className="flex justify-between items-center mb-6">
                            <div>
                                <h3 className="text-2xl font-black text-gray-800 tracking-tight">Adicionar Carro Manual</h3>
                                <p className="text-xs text-gray-400 font-medium mt-0.5">Para uso em feriados sem escala do cliente</p>
                            </div>
                            <button
                                onClick={() => setShowManualScheduleModal(false)}
                                className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                            >
                                <X size={24} className="text-gray-400" />
                            </button>
                        </div>

                        {/* Success message */}
                        {manualSuccess && (
                            <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-2xl flex items-center gap-3">
                                <CheckCircle size={20} className="text-green-600 shrink-0" />
                                <p className="text-sm font-bold text-green-700">{manualSuccess}</p>
                            </div>
                        )}

                        {/* Error message */}
                        {manualError && (
                            <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-2xl flex items-center gap-3">
                                <X size={20} className="text-red-500 shrink-0" />
                                <p className="text-sm font-bold text-red-600">{manualError}</p>
                            </div>
                        )}

                        <form onSubmit={handleManualSchedule} className="space-y-5">
                            {/* Vehicle Number */}
                            <div className="space-y-2">
                                <label className="text-xs font-black text-gray-400 uppercase tracking-widest ml-1">
                                    Número do Carro <span className="text-red-400">*</span>
                                </label>
                                <input
                                    id="manual-vehicle-number"
                                    type="text"
                                    value={manualVehicleNumber}
                                    onChange={(e) => setManualVehicleNumber(e.target.value)}
                                    placeholder="Ex: 65305"
                                    required
                                    autoFocus
                                    className="w-full p-4 bg-gray-50 border border-gray-100 rounded-2xl outline-none focus:ring-2 focus:ring-amber-400/50 focus:border-amber-400 font-bold text-gray-800 text-lg transition-all placeholder:font-normal placeholder:text-gray-300"
                                />
                            </div>

                            {/* Departure Time */}
                            <div className="space-y-2">
                                <label className="text-xs font-black text-gray-400 uppercase tracking-widest ml-1">
                                    Horário de Saída do Cliente <span className="text-red-400">*</span>
                                </label>
                                <input
                                    id="manual-saida-time"
                                    type="time"
                                    value={manualSaidaTime}
                                    onChange={(e) => setManualSaidaTime(e.target.value)}
                                    required
                                    className="w-full p-4 bg-gray-50 border border-gray-100 rounded-2xl outline-none focus:ring-2 focus:ring-amber-400/50 focus:border-amber-400 font-bold text-gray-800 text-lg transition-all"
                                />
                            </div>

                            {/* Info box */}
                            <div className="p-4 bg-amber-50 border border-amber-100 rounded-2xl">
                                <p className="text-xs font-bold text-amber-700 leading-relaxed">
                                    ℹ️ O <strong>H-1 (meta)</strong> será calculado automaticamente como <strong>1 hora antes</strong> da saída informada.
                                    Os demais campos serão preenchidos com valores padrão do sistema.
                                </p>
                            </div>

                            {/* Default values summary */}
                            <div className="p-4 bg-gray-50 border border-gray-100 rounded-2xl space-y-1.5">
                                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Valores padrão que serão aplicados</p>
                                <div className="flex justify-between text-xs">
                                    <span className="text-gray-500 font-medium">Status</span>
                                    <span className="font-black text-gray-700">PREVISTO</span>
                                </div>
                                <div className="flex justify-between text-xs">
                                    <span className="text-gray-500 font-medium">Pátio</span>
                                    <span className="font-black text-green-600">✓ Marcado</span>
                                </div>
                                <div className="flex justify-between text-xs">
                                    <span className="text-gray-500 font-medium">Colaborador</span>
                                    <span className="font-black text-gray-400">— (em branco)</span>
                                </div>
                                <div className="flex justify-between text-xs">
                                    <span className="text-gray-500 font-medium">Empresa</span>
                                    <span className="font-black text-gray-700">MANUAL</span>
                                </div>
                            </div>

                            {/* Actions */}
                            <div className="flex gap-3 pt-2">
                                <button
                                    type="button"
                                    onClick={() => setShowManualScheduleModal(false)}
                                    className="flex-1 py-4 text-gray-500 font-black uppercase tracking-widest text-xs hover:bg-gray-50 rounded-2xl transition-all"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    id="btn-confirmar-manual"
                                    disabled={manualLoading || !manualVehicleNumber || !manualSaidaTime}
                                    className="flex-1 py-4 bg-amber-500 text-white font-black uppercase tracking-widest text-xs rounded-2xl disabled:opacity-50 hover:bg-amber-600 shadow-xl shadow-amber-100 transition-all transform active:scale-95 flex items-center justify-center gap-2"
                                >
                                    {manualLoading ? (
                                        <><Loader2 size={16} className="animate-spin" /> Salvando...</>
                                    ) : (
                                        <><Plus size={16} /> Confirmar</>                                    )}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
