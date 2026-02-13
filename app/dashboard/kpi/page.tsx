'use client';

import { useState, useEffect } from 'react';
import { format, subDays, startOfMonth, endOfMonth, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Loader2, Calendar, TrendingUp, Clock, AlertTriangle, CheckCircle } from 'lucide-react';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
    LineChart, Line, AreaChart, Area, ComposedChart
} from 'recharts';

export default function KPIDashboard() {
    const [startDate, setStartDate] = useState(format(subDays(new Date(), 30), 'yyyy-MM-dd'));
    const [endDate, setEndDate] = useState(format(new Date(), 'yyyy-MM-dd'));
    const [showAccumulated, setShowAccumulated] = useState(true);

    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    const fetchData = async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams({ startDate, endDate });
            const res = await fetch(`/api/kpi?${params.toString()}`);
            if (res.ok) {
                const jsonData = await res.json();
                console.log(jsonData); // Debug
                setData(jsonData);
            }
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    if (loading) {
        return (
            <div className="flex justify-center items-center h-96">
                <Loader2 className="animate-spin h-12 w-12 text-blue-600" />
            </div>
        );
    }

    if (!data) return <div className="text-center p-8">Erro ao carregar dados.</div>;

    const { daily, performance, monthly } = data;

    // Calculate totals for cards
    const totalEvents = daily.reduce((acc: number, curr: any) => acc + (curr.total || 0), 0);
    const totalCompleted = daily.reduce((acc: number, curr: any) => acc + (curr.completed || 0), 0);
    const completionRate = totalEvents > 0 ? ((totalCompleted / totalEvents) * 100).toFixed(1) : '0';
    const totalDelays = daily.reduce((acc: number, curr: any) => acc + (curr.delayed || 0), 0);
    const totalNotCompleted = daily.reduce((acc: number, curr: any) => acc + (curr.not_completed || 0), 0);

    return (
        <div className="space-y-8 pb-12">
            <div className="flex justify-between items-center bg-white p-4 rounded shadow">
                <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                    <TrendingUp className="h-6 w-6 text-blue-600" />
                    Dashboard de Performance (KPIs)
                </h1>

                <div className="flex items-center gap-2">
                    <input
                        type="date"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        className="border rounded p-2 text-sm"
                    />
                    <span className="text-gray-500">-</span>
                    <input
                        type="date"
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                        className="border rounded p-2 text-sm"
                    />
                    <button
                        onClick={fetchData}
                        className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 text-sm font-medium"
                    >
                        Filtrar
                    </button>
                </div>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 md:gap-4">
                <div className="bg-white p-6 rounded shadow border-l-4 border-blue-500">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm font-medium text-gray-500">Total Programado</p>
                            <p className="text-3xl font-bold text-gray-800">{totalEvents}</p>
                        </div>
                        <CheckCircle className="h-8 w-8 text-blue-100" />
                    </div>
                </div>

                <div className="bg-white p-6 rounded shadow border-l-4 border-green-500">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm font-medium text-gray-500">Taxa de Conclusão</p>
                            <p className="text-3xl font-bold text-green-600">{completionRate}%</p>
                            <p className="text-xs text-gray-400">{totalCompleted} realizados</p>
                        </div>
                        <TrendingUp className="h-8 w-8 text-green-100" />
                    </div>
                </div>

                <div className="bg-white p-6 rounded shadow border-l-4 border-yellow-500">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm font-medium text-gray-500">Tempo Médio</p>
                            <p className="text-3xl font-bold text-yellow-600">{performance.avgTimeGlobal} min</p>
                        </div>
                        <Clock className="h-8 w-8 text-yellow-100" />
                    </div>
                </div>

                <div className="bg-white p-6 rounded shadow border-l-4 border-purple-500">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm font-medium text-gray-500">Total Atrasos</p>
                            <p className="text-3xl font-bold text-purple-600">{totalDelays}</p>
                            <p className="text-xs text-gray-400">Saídas fora do prazo</p>
                        </div>
                        <AlertTriangle className="h-8 w-8 text-purple-100" />
                    </div>
                </div>

                <div className="bg-white p-6 rounded shadow border-l-4 border-red-500">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm font-medium text-gray-500">Não Realizados</p>
                            <p className="text-3xl font-bold text-red-600">{totalNotCompleted}</p>
                            <p className="text-xs text-gray-400">Pendentes ou não feitos</p>
                        </div>
                        <AlertTriangle className="h-8 w-8 text-red-100" />
                    </div>
                </div>
            </div>

            {/* Charts Row 1: Daily Stats */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white p-6 rounded shadow">
                    <h3 className="text-lg font-bold text-gray-700 mb-6">Status Diário (Previsto x Realizado x Pendente)</h3>
                    <div className="h-80">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={daily}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                <XAxis dataKey="date" tick={{ fontSize: 12 }} tickFormatter={(val) => format(parseISO(val), 'dd/MM')} />
                                <YAxis />
                                <Tooltip labelFormatter={(val) => format(parseISO(val), 'dd/MM/yyyy')} />
                                <Legend />
                                <Bar dataKey="total" name="Previsto" fill="#94a3b8" radius={[4, 4, 0, 0]} />
                                <Bar dataKey="completed" name="Realizado" fill="#16a34a" radius={[4, 4, 0, 0]} />
                                <Bar dataKey="not_completed" name="Não Realizado" fill="#ef4444" radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                <div className="bg-white p-6 rounded shadow">
                    <h3 className="text-lg font-bold text-gray-700 mb-6">Incidências Diárias (Atrasos e Trocas)</h3>
                    <div className="h-80">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={daily}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                <XAxis dataKey="date" tick={{ fontSize: 12 }} tickFormatter={(val) => format(parseISO(val), 'dd/MM')} />
                                <YAxis />
                                <Tooltip labelFormatter={(val) => format(parseISO(val), 'dd/MM/yyyy')} />
                                <Legend />
                                <Bar dataKey="delayed" name="Atrasos" fill="#dc2626" radius={[4, 4, 0, 0]} />
                                <Bar dataKey="swaps" name="Trocas" fill="#f97316" radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>

            {/* Charts Row 2: Performance by Cleaner */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white p-6 rounded shadow">
                    <h3 className="text-lg font-bold text-gray-700 mb-6">Quantidade Média de Limpeza por Colaborador</h3>
                    <div className="h-96">
                        {/* Show top 10 */}
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart layout="vertical" data={performance.byCleaner.slice(0, 10)}>
                                <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} />
                                <XAxis type="number" />
                                <YAxis dataKey="name" type="category" width={120} tick={{ fontSize: 12 }} />
                                <Tooltip cursor={{ fill: 'transparent' }} />
                                <Legend />
                                <Bar dataKey="count" name="Qtd. Limpezas" fill="#3b82f6" radius={[0, 4, 4, 0]} barSize={20} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                <div className="bg-white p-6 rounded shadow">
                    <h3 className="text-lg font-bold text-gray-700 mb-6">Tempo Médio por Colaborador (Minutos)</h3>
                    <div className="h-96">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart layout="vertical" data={performance.byCleaner.slice(0, 10).sort((a: any, b: any) => a.avgTime - b.avgTime)}>
                                <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} />
                                <XAxis type="number" />
                                <YAxis dataKey="name" type="category" width={120} tick={{ fontSize: 12 }} />
                                <Tooltip cursor={{ fill: 'transparent' }} />
                                <Legend />
                                <Bar dataKey="avgTime" name="Tempo Médio (min)" fill="#8b5cf6" radius={[0, 4, 4, 0]} barSize={20} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>

            {/* Charts Row 3: Trend (Daily or Cumulative) */}
            <div className="bg-white p-6 rounded shadow">
                <div className="flex justify-between items-center mb-6">
                    <h3 className="text-lg font-bold text-gray-700">
                        Evolução {showAccumulated ? 'Acumulada' : 'Diária'} (Previsto x Realizado)
                    </h3>
                    <div className="flex items-center gap-2">
                        <label className="relative inline-flex items-center cursor-pointer">
                            <input
                                type="checkbox"
                                className="sr-only peer"
                                checked={showAccumulated}
                                onChange={() => setShowAccumulated(!showAccumulated)}
                            />
                            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                            <span className="ml-3 text-sm font-medium text-gray-700">Ver Acumulado</span>
                        </label>
                    </div>
                </div>
                <div className="h-80">
                    <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart data={showAccumulated ? data.cumulative : daily}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} />
                            <XAxis dataKey="date" tick={{ fontSize: 12 }} tickFormatter={(val) => format(parseISO(val), 'dd/MM')} />
                            <YAxis />
                            <Tooltip labelFormatter={(val) => format(parseISO(val), 'dd/MM/yyyy')} />
                            <Legend />
                            <Bar
                                dataKey={showAccumulated ? "accumulated_completed" : "completed"}
                                name={showAccumulated ? "Acumulado Realizado" : "Realizado"}
                                fill="#16a34a"
                                barSize={20}
                                radius={[4, 4, 0, 0]}
                            />
                            <Line
                                type="monotone"
                                dataKey={showAccumulated ? "accumulated_total" : "total"}
                                name={showAccumulated ? "Acumulado Previsto" : "Previsto"}
                                stroke="#2563eb"
                                strokeWidth={3}
                                dot={{ r: 4 }}
                            />
                        </ComposedChart>
                    </ResponsiveContainer>
                </div>
            </div>

        </div>
    );
}
