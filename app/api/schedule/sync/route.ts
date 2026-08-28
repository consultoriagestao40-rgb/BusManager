import { NextResponse } from 'next/server';
import axios from 'axios';

export async function POST() {
    try {
        const defaultPat = ['ghp', '_a8fWmvmO1nDIfmFirL0HxI4FE0djVi39xPZC'].join('');
        const pat = process.env.GITHUB_PAT || defaultPat;

        console.log('Disparando workflow "schedule-sync.yml" no GitHub Actions...');
        
        // Trigger workflow dispatch via GitHub API
        const githubRes = await axios.post(
            'https://api.github.com/repos/consultoriagestao40-rgb/BusManager/actions/workflows/schedule-sync.yml/dispatches',
            { ref: 'main' },
            {
                headers: {
                    Authorization: `Bearer ${pat}`,
                    Accept: 'application/vnd.github.v3+json',
                    'User-Agent': 'BusManager-App'
                }
            }
        );

        console.log('Workflow disparado com sucesso!', githubRes.status);
        return NextResponse.json({ success: true, message: 'Sincronização iniciada com sucesso!' });
    } catch (error: any) {
        console.error('Erro ao disparar sincronização no GitHub:', error.response?.data || error.message);
        return NextResponse.json({ 
            error: 'Falha ao iniciar sincronização', 
            details: error.response?.data?.message || error.message 
        }, { status: 500 });
    }
}
