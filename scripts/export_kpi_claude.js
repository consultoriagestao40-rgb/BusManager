const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');
require('dotenv').config({ path: '.env.local' });

const prisma = new PrismaClient();

// Format date to Brazil Time (UTC-3)
function formatBRT(date) {
    if (!date) return '';
    const d = new Date(date);
    if (isNaN(d.getTime())) return '';
    // Adjust UTC to BRT (sub 3 hours)
    const brDate = new Date(d.getTime() - 3 * 60 * 60 * 1000);
    return brDate.toISOString().replace('T', ' ').substring(0, 16);
}

function formatDateOnly(date) {
    if (!date) return '';
    const d = new Date(date);
    if (isNaN(d.getTime())) return '';
    return d.toISOString().substring(0, 10);
}

function escapeCSV(val) {
    if (val === null || val === undefined) return '';
    const str = String(val).replace(/"/g, '""').replace(/\r?\n/g, ' ');
    if (str.includes(',') || str.includes(';') || str.includes('"') || str.includes('\n')) {
        return `"${str}"`;
    }
    return `"${str}"`;
}

async function main() {
    const outputDir = path.join(__dirname, '..', 'export_claude');
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    console.log('Buscando dados de Julho, Agosto e Setembro de 2026...');
    const start = new Date('2026-07-01T00:00:00.000Z');
    const end = new Date('2026-09-30T23:59:59.999Z');

    // Fetch all active events
    const events = await prisma.cleaningEvent.findMany({
        where: {
            data_viagem: { gte: start, lte: end },
            schedule_version: { is_active: true }
        },
        include: {
            vehicle: true,
            cleaner: true,
            swaps: {
                include: {
                    replacement_vehicle: true
                }
            }
        },
        orderBy: [
            { data_viagem: 'asc' },
            { hora_viagem: 'asc' }
        ]
    });

    console.log(`Encontrados ${events.length} eventos ativos.`);

    // Yard inventory limpos no período
    const yardCleanings = await prisma.yardInventory.findMany({
        where: {
            status: 'LIMPO',
            updated_at: { gte: start, lte: end }
        },
        include: { vehicle: true }
    });

    // Swaps no período
    const allSwaps = await prisma.swap.findMany({
        where: {
            original_event: {
                data_viagem: { gte: start, lte: end }
            }
        },
        include: {
            original_event: true,
            original_vehicle: true,
            replacement_vehicle: true
        }
    });

    // Structure data for CSV
    const headers = [
        'ID_Evento',
        'Mes',
        'Data_Viagem',
        'Hora_Programada',
        'Horario_Liberar_Ate',
        'Horario_Inicio_Limpeza',
        'Horario_Fim_Limpeza',
        'Duracao_Minutos',
        'Status',
        'Atrasou',
        'Minutos_Atraso',
        'Prefixo_Veiculo',
        'Placa_Veiculo',
        'Nome_Higienizador',
        'Teve_Troca',
        'Motivo_Troca',
        'Submotivo_Troca',
        'Veiculo_Substituto',
        'Observacao_Troca',
        'Estava_No_Patio',
        'Bypass_Patio',
        'Classe_Servico',
        'Motorista',
        'Observacao_Cliente',
        'Observacao_Operacao'
    ];

    const rows = [];
    const rowsByMonth = { '2026-07': [], '2026-08': [], '2026-09': [] };

    // KPI Metrics calculation
    const monthlyStats = {
        '2026-07': { total: 0, concluidos: 0, cancelados: 0, previstos: 0, atrasos: 0, trocas: 0, temposMin: [] },
        '2026-08': { total: 0, concluidos: 0, cancelados: 0, previstos: 0, atrasos: 0, trocas: 0, temposMin: [] },
        '2026-09': { total: 0, concluidos: 0, cancelados: 0, previstos: 0, atrasos: 0, trocas: 0, temposMin: [] }
    };

    const cleanersStats = {};
    const swapReasons = {};

    events.forEach(ev => {
        const dateStr = formatDateOnly(ev.data_viagem);
        const monthStr = dateStr.substring(0, 7);

        let duracaoMin = '';
        if (ev.started_at && ev.finished_at) {
            const diff = Math.round((new Date(ev.finished_at) - new Date(ev.started_at)) / (1000 * 60));
            if (diff >= 0 && diff < 600) {
                duracaoMin = diff;
            }
        }

        let atrasou = 'NAO';
        let minutosAtraso = 0;
        if (ev.status === 'CONCLUIDO' && ev.finished_at && ev.liberar_ate_at) {
            const diffAtraso = Math.round((new Date(ev.finished_at) - new Date(ev.liberar_ate_at)) / (1000 * 60));
            if (diffAtraso > 0) {
                atrasou = 'SIM';
                minutosAtraso = diffAtraso;
            }
        }

        const swap = (ev.swaps && ev.swaps.length > 0) ? ev.swaps[0] : null;
        let motivoTroca = '';
        let submotivoTroca = '';
        let obsTroca = '';
        let substituto = '';

        if (swap) {
            motivoTroca = swap.motivo;
            obsTroca = swap.observacao || '';
            if (motivoTroca === 'OUTROS' && obsTroca.includes('[Motivo:')) {
                const match = obsTroca.match(/\[Motivo: (.*?)\]/);
                if (match && match[1]) {
                    submotivoTroca = match[1];
                }
            }
            if (swap.replacement_vehicle) {
                substituto = swap.replacement_vehicle.client_vehicle_number || swap.replacement_vehicle.prefix || '';
            }
            const keyReason = submotivoTroca || motivoTroca;
            swapReasons[keyReason] = (swapReasons[keyReason] || 0) + 1;
        }

        const cleanerName = ev.cleaner ? ev.cleaner.name : (ev.cleaner_id ? 'ID: ' + ev.cleaner_id : 'Não Definido');

        // Stats accumulation
        if (monthlyStats[monthStr]) {
            const m = monthlyStats[monthStr];
            m.total += 1;
            if (ev.status === 'CONCLUIDO') {
                m.concluidos += 1;
                if (atrasou === 'SIM') m.atrasos += 1;
                if (duracaoMin !== '') m.temposMin.push(duracaoMin);
            } else if (ev.status === 'CANCELADO') {
                m.cancelados += 1;
            } else {
                m.previstos += 1;
            }
            if (swap) m.trocas += 1;
        }

        if (ev.status === 'CONCLUIDO') {
            if (!cleanersStats[cleanerName]) {
                cleanersStats[cleanerName] = { total: 0, atrasos: 0, duracoes: [] };
            }
            cleanersStats[cleanerName].total += 1;
            if (atrasou === 'SIM') cleanersStats[cleanerName].atrasos += 1;
            if (duracaoMin !== '') cleanersStats[cleanerName].duracoes.push(duracaoMin);
        }

        const row = [
            ev.id,
            monthStr,
            dateStr,
            formatBRT(ev.hora_viagem),
            formatBRT(ev.liberar_ate_at),
            formatBRT(ev.started_at),
            formatBRT(ev.finished_at),
            duracaoMin,
            ev.status,
            atrasou,
            minutosAtraso,
            ev.vehicle ? (ev.vehicle.client_vehicle_number || ev.vehicle.prefix || '') : '',
            ev.vehicle ? (ev.vehicle.plate || '') : '',
            cleanerName,
            swap ? 'SIM' : 'NAO',
            motivoTroca,
            submotivoTroca,
            substituto,
            obsTroca,
            ev.at_yard ? 'SIM' : 'NAO',
            ev.yard_bypass ? 'SIM' : 'NAO',
            ev.classe || '',
            ev.motorista || '',
            ev.observacao_cliente || '',
            ev.observacao_operacao || ''
        ];

        rows.push(row);
        if (rowsByMonth[monthStr]) {
            rowsByMonth[monthStr].push(row);
        }
    });

    // Write Full CSV
    const csvContent = [headers.map(escapeCSV).join(';'), ...rows.map(r => r.map(escapeCSV).join(';'))].join('\n');
    const fullCsvPath = path.join(outputDir, 'dados_julho_agosto_setembro_2026.csv');
    fs.writeFileSync(fullCsvPath, '\uFEFF' + csvContent, 'utf8');
    console.log(`Gerado CSV completo em: ${fullCsvPath}`);

    // Write Monthly CSVs
    for (const [monthKey, monthRows] of Object.entries(rowsByMonth)) {
        const monthNames = { '2026-07': 'julho', '2026-08': 'agosto', '2026-09': 'setembro' };
        const mName = monthNames[monthKey];
        const mCsv = [headers.map(escapeCSV).join(';'), ...monthRows.map(r => r.map(escapeCSV).join(';'))].join('\n');
        const mPath = path.join(outputDir, `dados_${mName}_2026.csv`);
        fs.writeFileSync(mPath, '\uFEFF' + mCsv, 'utf8');
        console.log(`Gerado CSV ${mName} em: ${mPath}`);
    }

    // Prepare JSON Summary for Claude
    const cleanerRanking = Object.entries(cleanersStats).map(([name, s]) => {
        const avg = s.duracoes.length > 0 ? Math.round(s.duracoes.reduce((a, b) => a + b, 0) / s.duracoes.length) : 0;
        return {
            colaborador: name,
            total_limpezas: s.total,
            atrasos: s.atrasos,
            taxa_atraso_pct: s.total > 0 ? ((s.atrasos / s.total) * 100).toFixed(1) : '0',
            tempo_medio_minutos: avg
        };
    }).sort((a, b) => b.total_limpezas - a.total_limpezas);

    const swapRanking = Object.entries(swapReasons)
        .map(([motivo, qtd]) => ({ motivo, qtd }))
        .sort((a, b) => b.qtd - a.qtd);

    const summaryData = {
        periodo: 'Julho, Agosto e Setembro de 2026 (3º Trimestre)',
        total_eventos_ativos: events.length,
        resumo_mensal: Object.entries(monthlyStats).map(([mKey, s]) => {
            const monthNames = { '2026-07': 'Julho/2026', '2026-08': 'Agosto/2026', '2026-09': 'Setembro/2026' };
            const efetivos = s.total - s.cancelados;
            const taxaConclusao = efetivos > 0 ? ((s.concluidos / efetivos) * 100).toFixed(1) : '0';
            const avgTempo = s.temposMin.length > 0 ? Math.round(s.temposMin.reduce((a, b) => a + b, 0) / s.temposMin.length) : 0;
            return {
                mes: monthNames[mKey],
                total_programado: s.total,
                cancelados: s.cancelados,
                programados_efetivos: efetivos,
                realizados: s.concluidos,
                pendentes_nao_realizados: s.previstos,
                taxa_conclusao_pct: taxaConclusao,
                total_atrasos: s.atrasos,
                taxa_atraso_sobre_realizados_pct: s.concluidos > 0 ? ((s.atrasos / s.concluidos) * 100).toFixed(1) : '0',
                tempo_medio_limpeza_minutos: avgTempo,
                total_trocas: s.trocas
            };
        }),
        ranking_higienizadores_top15: cleanerRanking.slice(0, 15),
        motivos_trocas: swapRanking
    };

    const jsonPath = path.join(outputDir, 'resumo_executivo_kpi_jul_ago_set_2026.json');
    fs.writeFileSync(jsonPath, JSON.stringify(summaryData, null, 2), 'utf8');
    console.log(`Gerado JSON consolidado em: ${jsonPath}`);

    // Generate Markdown Claude Dossier
    const mdContent = `# Relatório de Dados Operacionais e KPIs (Julho, Agosto e Setembro de 2026)
> Gerado para análise executiva, auditoria e geração de relatórios com Claude / IA.

---

## 1. Visão Geral Consolidada do Trimestre (Q3 2026)

| Mês | Total Programado | Cancelados | Efetivo | Realizados | Pendentes | Taxa Conclusão | Atrasos | % Atrasos | Tempo Médio | Trocas de Carro |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
${summaryData.resumo_mensal.map(m => `| **${m.mes}** | ${m.total_programado} | ${m.cancelados} | ${m.programados_efetivos} | ${m.realizados} | ${m.pendentes_nao_realizados} | **${m.taxa_conclusao_pct}%** | ${m.total_atrasos} | ${m.taxa_atraso_sobre_realizados_pct}% | ${m.tempo_medio_limpeza_minutos} min | ${m.total_trocas} |`).join('\n')}

---

## 2. Produtividade da Equipe de Higienização (Top 15 Colaboradores)

| Colaborador | Total de Limpezas Realizadas | Atrasos Registrados | % Atrasos | Tempo Médio (min) |
| :--- | :---: | :---: | :---: | :---: |
${cleanerRanking.slice(0, 15).map(c => `| ${c.colaborador} | ${c.total_limpezas} | ${c.atrasos} | ${c.taxa_atraso_pct}% | ${c.tempo_medio_minutos} min |`).join('\n')}

---

## 3. Motivos de Troca de Veículos no Trimestre

| Motivo / Causa | Quantidade de Ocorrências |
| :--- | :---: |
${swapRanking.map(s => `| ${s.motivo} | ${s.qtd} |`).join('\n')}

---

## 4. Estrutura dos Arquivos Gerados para o Claude

1. **\`dados_julho_agosto_setembro_2026.csv\`**:
   - Tabela detalhada contendo **${events.length} registros** com todas as colunas operacionais (ID, Data, Horário Programado, Horário Liberar Até, Início, Fim, Duração, Status, Atraso, Prefixo, Placa, Higienizador, Trocas, Observações, Motorista, etc.).
   - Padrão delimitador: \`;\` com codificação UTF-8 BOM para abrir perfeitamente tanto no Excel quanto no Claude / Python.

2. **CSVs Individuais por Mês**:
   - \`dados_julho_2026.csv\` (${rowsByMonth['2026-07'].length} linhas)
   - \`dados_agosto_2026.csv\` (${rowsByMonth['2026-08'].length} linhas)
   - \`dados_setembro_2026.csv\` (${rowsByMonth['2026-09'].length} linhas)

3. **\`resumo_executivo_kpi_jul_ago_set_2026.json\`**:
   - Dados agregados em formato JSON estruturado pronto para processamento analítico direto.

---
`;

    const mdPath = path.join(outputDir, 'relatorio_executivo_kpi_jul_ago_set_2026.md');
    fs.writeFileSync(mdPath, mdContent, 'utf8');
    console.log(`Gerado Relatório Markdown em: ${mdPath}`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
