import { NextResponse } from 'next/server';
import axios from 'axios';

const ZAPI_INSTANCE_ID = process.env.ZAPI_INSTANCE_ID;
const ZAPI_TOKEN = process.env.ZAPI_TOKEN;
const ZAPI_CLIENT_TOKEN = process.env.ZAPI_CLIENT_TOKEN;

export async function GET() {
    try {
        const url = `https://api.z-api.io/instances/${ZAPI_INSTANCE_ID}/token/${ZAPI_TOKEN}/chats`;
        const res = await axios.get(url, {
            headers: { 'Client-Token': ZAPI_CLIENT_TOKEN || '' }
        });
        
        const chats = res.data.slice(0, 10).map((c: any) => ({
            name: c.name || c.subject || 'Sem nome',
            phone: c.phone
        }));

        return NextResponse.json(chats);
    } catch (e: any) {
        return NextResponse.json({ error: e.response?.data || e.message }, { status: 500 });
    }
}
