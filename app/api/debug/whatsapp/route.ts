import { NextResponse } from 'next/server';
import axios from 'axios';

/**
 * FERRAMENTA DE DIAGNÓSTICO PROFUNDO
 * Esta rota testa a conexão com a Z-API e retorna o erro real.
 */
export async function GET(request: Request) {
    const ZAPI_INSTANCE_ID = process.env.ZAPI_INSTANCE_ID;
    const ZAPI_TOKEN = process.env.ZAPI_TOKEN;
    const WHATSAPP_GROUP_ID = process.env.WHATSAPP_GROUP_ID;
    const ZAPI_CLIENT_TOKEN = process.env.ZAPI_CLIENT_TOKEN;

    const url = `https://api.z-api.io/instances/${ZAPI_INSTANCE_ID}/token/${ZAPI_TOKEN}/send-text`;

    try {
        const response = await axios.post(url, {
            phone: WHATSAPP_GROUP_ID,
            message: "🧪 *DIAGNÓSTICO BUSMANAGER*\n\nConexão estabelecida com sucesso! ✅"
        }, {
            headers: {
                'Content-Type': 'application/json',
                'Client-Token': ZAPI_CLIENT_TOKEN || ''
            },
            timeout: 15000
        });

        return NextResponse.json({ 
            status: "SUCESSO",
            message: "WhatsApp está funcionando!",
            zapi_code: response.status,
            details: response.data
        });

    } catch (error: any) {
        return NextResponse.json({ 
            status: "ERRO",
            error: error.message,
            zapi_response: error.response?.data || 'Sem resposta da Z-API',
            http_status: error.response?.status,
            diagnostico: {
                instance: ZAPI_INSTANCE_ID ? 'OK' : 'FALTANDO',
                token: ZAPI_TOKEN ? 'OK' : 'FALTANDO',
                group_id: WHATSAPP_GROUP_ID || 'FALTANDO'
            }
        }, { status: 200 }); // Retornamos 200 para garantir que a página carregue com o erro detalhado
    }
}
